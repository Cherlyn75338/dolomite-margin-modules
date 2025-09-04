## Security Report: Public lazyInitialize Vulnerabilities

### Overview
- **Issue**: Permissionless, one-time `lazyInitialize` functions set critical addresses in multiple contracts.
- **Root cause**: No access control on initializers + weak/nonexistent interface validation in setters.
- **Impact**: High. Enables oracle aggregator takeover (price/decimals manipulation), migrator authority takeover, and permanent vester hijack via malicious `veToken` and `discountCalculator`.
- **Exploit window**: Before first legitimate initialization lands on-chain.

### Scope
- `packages/base/contracts/general/DolomiteRegistryImplementation.sol`
- `packages/tokenomics/contracts/VeExternalVesterImplementationV1.sol`
- `packages/tokenomics/contracts/VeExternalVesterImplementationV2.sol`
- Many dependent modules that read `dolomiteRegistry().oracleAggregator()` and `dolomiteRegistry().dolomiteMigrator()`; vesters that trust injected `veToken` and `discountCalculator`.

### Root Cause and Evidence

#### Permissionless one-time initializer: DolomiteRegistryImplementation
```96:108:packages/base/contracts/general/DolomiteRegistryImplementation.sol
function lazyInitialize(
    address _dolomiteMigrator,
    address _oracleAggregator
) external {
    Require.that(
        address(dolomiteMigrator()) == address(0) && address(oracleAggregator()) == address(0),
        _FILE,
        "Already initialized"
    );

    _ownerSetDolomiteMigrator(_dolomiteMigrator);
    _ownerSetOracleAggregator(_oracleAggregator);
}
```

Critical setters only check non-zero (no interface validation):
```439:450:packages/base/contracts/general/DolomiteRegistryImplementation.sol
function _ownerSetDolomiteMigrator(
    address _dolomiteMigrator
) internal {
    Require.that(
        _dolomiteMigrator != address(0),
        _FILE,
        "Invalid dolomiteMigrator"
    );

    _setAddress(_DOLOMITE_MIGRATOR_SLOT, _dolomiteMigrator);
    emit DolomiteMigratorSet(_dolomiteMigrator);
}
```
```465:476:packages/base/contracts/general/DolomiteRegistryImplementation.sol
function _ownerSetOracleAggregator(
    address _oracleAggregator
) internal {
    Require.that(
        _oracleAggregator != address(0),
        _FILE,
        "Invalid oracleAggregator"
    );

    _setAddress(_ORACLE_AGGREGATOR_SLOT, _oracleAggregator);
    emit OracleAggregatorSet(_oracleAggregator);
}
```

#### Permissionless one-time initializer: VeExternalVesterImplementation V1/V2
```158:171:packages/tokenomics/contracts/VeExternalVesterImplementationV1.sol
function lazyInitialize(
    address _discountCalculator,
    address _veToken
) external {
    Require.that(
        address(VE_TOKEN) == address(0),
        _FILE,
        "veToken already initialized"
    );
    VE_TOKEN = IVeToken(_veToken);
    emit VeTokenSet(_veToken);

    _ownerSetDiscountCalculator(_discountCalculator);
}
```
```159:172:packages/tokenomics/contracts/VeExternalVesterImplementationV2.sol
function lazyInitialize(
    address _discountCalculator,
    address _veToken
) external {
    Require.that(
        address(VE_TOKEN) == address(0),
        _FILE,
        "veToken already initialized"
    );
    VE_TOKEN = IVeToken(_veToken);
    emit VeTokenSet(_veToken);

    _ownerSetDiscountCalculator(_discountCalculator);
}
```

Discount calculator setter (non-zero only):
```574:585:packages/tokenomics/contracts/VeExternalVesterImplementationV1.sol
function _ownerSetDiscountCalculator(
    address _discountCalculator
)
internal {
    Require.that(
        _discountCalculator != address(0),
        _FILE,
        "Invalid discount calculator"
    );
    _setAddress(_DISCOUNT_CALCULATOR_SLOT, _discountCalculator);
    emit DiscountCalculatorSet(_discountCalculator);
}
```

### Dependency Graph and Trust Surfaces

#### Registry.migrator → authority gate
```72:74:packages/base/contracts/isolation-mode/IsolationModeTokenVaultMigrator.sol
function migrate(uint256 _amountWei) external onlyMigrator(msg.sender) {
    _migrate(_amountWei);
}
```
```95:102:packages/base/contracts/isolation-mode/IsolationModeTokenVaultMigrator.sol
function _requireOnlyMigrator(address _from) internal view {
    Require.that(
        _from == address(DOLOMITE_REGISTRY.dolomiteMigrator()),
        _FILE,
        "Caller is not migrator",
        _from
    );
}
```

#### Registry.oracleAggregator → price/decimals across modules
Vester payment calculation:
```654:657:packages/tokenomics/contracts/VeExternalVesterImplementationV1.sol
// Calculate price
uint256 rewardPriceAdj = _getRewardPriceAdj(_nftId, _duration, _veTokenId, _veLockEndTime);
uint256 paymentPrice = DOLOMITE_REGISTRY.oracleAggregator().getPrice(address(PAYMENT_TOKEN)).value;
paymentAmount = _oTokenAmount * rewardPriceAdj / paymentPrice;
```

Adapters rely on aggregator decimals:
```184:186:packages/oracles/contracts/ChainlinkPriceOracleV3.sol
IOracleAggregatorV2 aggregator = IOracleAggregatorV2(address(DOLOMITE_REGISTRY.oracleAggregator()));
uint8 tokenDecimals = aggregator.getDecimalsByToken(_token);
assert(tokenDecimals > 0);
```

#### Vester.VE_TOKEN approvals during close
```322:332:packages/tokenomics/contracts/VeExternalVesterImplementationV1.sol
REWARD_TOKEN.safeApprove(address(VE_TOKEN), position.oTokenAmount);

if (_veTokenId == type(uint256).max) {
    _veTokenId = VE_TOKEN.create_lock_for(
        position.oTokenAmount,
        _veLockEndTime - block.timestamp,
        msg.sender
    );
} else {
    VE_TOKEN.increase_amount(_veTokenId, position.oTokenAmount);
}
```

#### Vester V2 pulls rewards from DAO (larger blast radius)
```472:483:packages/tokenomics/contracts/VeExternalVesterImplementationV2.sol
function pushedTokens() public view returns (uint256) {
    address dao = DOLOMITE_REGISTRY.dao();
    uint256 bal = REWARD_TOKEN.balanceOf(dao);
    Require.that(
        bal > 0,
        _FILE,
        "No DOLO balance in DAO"
    );

    uint256 allowed = REWARD_TOKEN.allowance(dao, address(this));
    return bal < allowed ? bal : allowed;
}
```

### Impact Analysis

- **OracleAggregator takeover (High)**
  - Arbitrary prices/decimals cascade into vesters, adapters (GMX/GLV/Pendle), and oracle wrappers.
  - Users can be over/under-charged; protocol revenue and safety checks degrade.

- **Migrator takeover (Medium→High, situational)**
  - Attacker passes `onlyMigrator`, invoking vault migrators to transfer `MIGRATION_TOKEN` to themselves when balances exist.

- **discountCalculator takeover (High)**
  - Returning `discount == 1e18` (100%) is permitted at use-site, making `paymentAmount == 0` (free rewards). Direct protocol loss.

- **VE_TOKEN takeover (High, irreversible)**
  - One-time set; malicious contract can seize approved `REWARD_TOKEN` during `closePosition` or brick vesting logic.

### Exploitability on Mainnet

- **Preconditions**: For a given proxy, critical slots must be zero and `lazyInitialize` callable.
- **Deployment practice**: Scripts show explicit initialization and invariants, reducing risk for those deployments.
- **Irreversibility**: Registry can be corrected later by owner; vester `VE_TOKEN` cannot (permanent if raced).

### Concrete Attack Paths

- **Registry**
  - Preconditions: `dolomiteMigrator()` and `oracleAggregator()` are zero.
  - Action: `lazyInitialize(attackerEOA, attackerOracle)`.
  - Effects: Migrator-only calls succeed for attacker; price/decimals become attacker-controlled across dependent modules.

- **Vester**
  - Preconditions: `VE_TOKEN()` is zero.
  - Action: `lazyInitialize(maliciousCalculator, maliciousVeToken)`.
  - Effects: Free rewards (100% discount), token theft via approvals, bricked flows. `VE_TOKEN` change is permanent.

### Why Remove or Protect lazyInitialize

- **Design flaw**: Public initializer for critical parameters invites mempool races.
- **Blast radius**: Registry aggregator/migrator affect many modules; vester `VE_TOKEN` is immutable post-init.
- **Validation gap**: Setters check non-zero only; no interface sanity checks.

### Recommendations

1) **Eliminate or gate `lazyInitialize`**
   - Make it `onlyDolomiteMarginOwner`, or remove it and rely on owner-only setters or `upgradeToAndCall` for atomic initialization.

2) **Atomic initialization**
   - Initialize proxies and critical addresses in a single privileged transaction (no window with zeroed slots).

3) **Interface sanity checks**
   - Registry: probe `getPrice` and (if v2) `getDecimalsByToken`; enforce semantics.
   - Vester: probe `calculateDiscount` with sentinels; verify expected ERC721/ve-token surface.

4) **Economic hardening**
   - Cap max discount below 100% (e.g., ≤ 90%) to prevent free rewards even if calculator is compromised.

5) **Operational audit**
   - Verify all live registries/vesters have trusted non-zero values set. For V2 vesters, minimize DAO allowances.

### Appendix: Additional Code References

Vester reward price adjustment (calculator + aggregator):
```861:877:packages/tokenomics/contracts/VeExternalVesterImplementationV1.sol
function _getRewardPriceAdj( ... ) internal view returns (uint256) {
    bytes memory extraBytes = abi.encode(_veTokenId, _veLockEndTime);
    uint256 discount = discountCalculator().calculateDiscount(_nftId, _duration, extraBytes);
    Require.that(
        discount <= _ONE_ETH_BASE,
        _FILE,
        "Invalid discount",
        discount
    );

    uint256 rewardPrice = DOLOMITE_REGISTRY.oracleAggregator().getPrice(address(REWARD_TOKEN)).value;
    return rewardPrice - (rewardPrice * discount / _ONE_ETH_BASE);
}
```

Adapters use registry aggregator for decimals normalization:
```184:191:packages/oracles/contracts/ChainlinkPriceOracleV3.sol
IOracleAggregatorV2 aggregator = IOracleAggregatorV2(address(DOLOMITE_REGISTRY.oracleAggregator()));
uint8 tokenDecimals = aggregator.getDecimalsByToken(_token);
assert(tokenDecimals > 0);
uint256 standardizedPrice = standardizeNumberOfDecimals(
    tokenDecimals,
    chainlinkPrice,
    valueDecimals
);
```

