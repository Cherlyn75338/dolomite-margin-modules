## Lazy-Initialization Vulnerability Report

### Executive summary
- **Issue**: Multiple contracts expose a permissionless, one-time `lazyInitialize(...)` that sets critical authorities and oracles guarded only by "uninitialized" checks, not access control.
- **Impact**: A front‑running attacker on a fresh proxy can permanently set malicious addresses as the registry’s `oracleAggregator` and `dolomiteMigrator`, and the vesters’ `VE_TOKEN` and `discountCalculator`. This enables global price manipulation, unauthorized migrator actions, reward siphoning, and denial of service.
- **Risk**: Critical wherever any uninitialized proxy is publicly callable. Even if production is initialized, any new deployment or re‑proxy with zeroed storage temporarily exposes a high‑impact race.

---

### Affected components
- **DolomiteRegistryImplementation**
  - `lazyInitialize(address _dolomiteMigrator, address _oracleAggregator)`
  - `_ownerSetDolomiteMigrator(...)` and `_ownerSetOracleAggregator(...)` only check non‑zero; no interface validation
- **VeExternalVesterImplementationV1 / VeExternalVesterImplementationV2**
  - `lazyInitialize(address _discountCalculator, address _veToken)`
  - `_ownerSetDiscountCalculator(...)` only checks non‑zero; no interface validation
  - `VE_TOKEN` is one‑time set (no owner setter)

---

### Root cause analysis

- **Permissionless initialization**: Critical admin-like configuration can be set by anyone if storage slots are zero.
- **Insufficient validation**: Setters only check for non-zero addresses; they do not confirm expected interfaces or behavior.
- **Deployment race**: If proxies are deployed and left uninitialized even briefly, an external transaction can seize configuration before the intended deployer.

```solidity
// DolomiteRegistryImplementation: Anyone can initialize once if both slots are zero
function lazyInitialize(address _dolomiteMigrator, address _oracleAggregator) external {
    Require.that(
        address(dolomiteMigrator()) == address(0) && address(oracleAggregator()) == address(0),
        _FILE,
        "Already initialized"
    );

    _ownerSetDolomiteMigrator(_dolomiteMigrator);
    _ownerSetOracleAggregator(_oracleAggregator);
}

// Setters validate only non-zero; no interface sanity checks
function _ownerSetDolomiteMigrator(address _dolomiteMigrator) internal {
    Require.that(_dolomiteMigrator != address(0), _FILE, "Invalid dolomiteMigrator");
    _setAddress(_DOLOMITE_MIGRATOR_SLOT, _dolomiteMigrator);
    emit DolomiteMigratorSet(_dolomiteMigrator);
}

function _ownerSetOracleAggregator(address _oracleAggregator) internal {
    Require.that(_oracleAggregator != address(0), _FILE, "Invalid oracleAggregator");
    _setAddress(_ORACLE_AGGREGATOR_SLOT, _oracleAggregator);
    emit OracleAggregatorSet(_oracleAggregator);
}
```

```solidity
// VeExternalVesterImplementationV1/V2: Anyone can initialize once if VE_TOKEN is unset
function lazyInitialize(address _discountCalculator, address _veToken) external {
    Require.that(address(VE_TOKEN) == address(0), _FILE, "veToken already initialized");
    VE_TOKEN = IVeToken(_veToken);
    emit VeTokenSet(_veToken);

    _ownerSetDiscountCalculator(_discountCalculator);
}

function _ownerSetDiscountCalculator(address _discountCalculator) internal {
    Require.that(_discountCalculator != address(0), _FILE, "Invalid discount calculator");
    _setAddress(_DISCOUNT_CALCULATOR_SLOT, _discountCalculator);
    emit DiscountCalculatorSet(_discountCalculator);
}
```

---

### Detailed impact

- **Oracle aggregator takeover (high impact)**
  - Many modules read prices and decimals via `DOLOMITE_REGISTRY.oracleAggregator()`. A malicious aggregator controls outputs to on‑chain consumers.
  - Example (vesters): payment amount directly depends on aggregator prices.
```solidity
uint256 rewardPriceAdj = _getRewardPriceAdj(_nftId, _duration, _veTokenId, _veLockEndTime);
uint256 paymentPrice = DOLOMITE_REGISTRY.oracleAggregator().getPrice(address(PAYMENT_TOKEN)).value;
uint256 paymentAmount = _oTokenAmount * rewardPriceAdj / paymentPrice;
```
  - Effects:
    - **Underpayment or free claims** by returning huge `paymentPrice` or near‑zero `rewardPriceAdj`.
    - **DoS** by returning zero or reverting.
    - **Protocol mispricing** for GMX/GLV/Pendle adapters and oracle libraries (decimals and price composition).

- **Migrator authority takeover (situational but severe)**
  - Privileged flows gated by the registry’s migrator identity become callable by the attacker.
```solidity
function _requireOnlyMigrator(address _from) internal view {
    Require.that(
        _from == address(DOLOMITE_REGISTRY.dolomiteMigrator()),
        _FILE,
        "Caller is not migrator",
        _from
    );
}
```
  - In `IsolationModeTokenVaultMigrator`, the migrator can trigger `migrate(amount)` and receive `MIGRATION_TOKEN` at `msg.sender`. If any such migrator holds balances during flows, the attacker can extract them.

- **Vester hijack (critical, partially irreversible)**
  - `VE_TOKEN` is set once, permanently. A malicious VE token can:
    - Steal approved `REWARD_TOKEN` during `create_lock_for` / `increase_amount`.
    - Lie on `ownerOf`, brick flows, or redirect benefits.
```solidity
REWARD_TOKEN.safeApprove(address(VE_TOKEN), position.oTokenAmount);
if (_veTokenId == type(uint256).max) {
    _veTokenId = VE_TOKEN.create_lock_for(position.oTokenAmount, _veLockEndTime - block.timestamp, msg.sender);
} else {
    VE_TOKEN.increase_amount(_veTokenId, position.oTokenAmount);
}
```
  - A malicious `discountCalculator` can return values near `1e18` (100%), making `rewardPriceAdj ≈ 0` and `paymentAmount ≈ 0`, draining rewards or DAO balances (V2 vesters pull from DAO allowance).

---

### Exploitability and conditions

- **Exploitable if**: Critical slots are zero on-chain and `lazyInitialize` is callable.
- **Window**: Until first successful initialization. After that, only governance setters can change (except `VE_TOKEN`, immutable post‑init).
- **Production note**: Deployment scripts appear to initialize promptly and assert invariants. The risk reappears for any new deployments, re‑deployments, or re‑proxying unless initialization is atomic and access‑controlled.

---

### Concrete attack paths

- **Registry: Oracle aggregator takeover**
  - Preconditions: `dolomiteMigrator() == 0` and `oracleAggregator() == 0`.
  - Action: Attacker calls `lazyInitialize(attackerEOA, attackerAggregator)`.
  - Result: Vesters, admin, GMX/GLV/Pendle oracles read attacker‑controlled prices/decimals.

- **Registry: Migrator drain**
  - After setting self as migrator, attacker calls `migrate(amount)` on deployed vault migrators that have custody during operations; tokens are transferred to `msg.sender`.

- **Vester: VE token and discount calculator hijack**
  - Preconditions: `VE_TOKEN == 0` on a vester proxy.
  - Action: Attacker calls `lazyInitialize(attackerDiscountCalc, attackerVeToken)`.
  - Result: Permanent VE token lock to attacker contract; reward siphoning via approvals; near‑zero payments via extreme discounts.

---

### Why `lazyInitialize` must be removed or protected

- **Permissionless one‑time init is unsafe for critical config**: Creates a race window where any EOA can become the effective admin.
- **Single‑use guard is insufficient**: Prevents double‑init but does not prevent malicious first init.
- **Missing interface checks**: Malicious contracts can pass non‑zero checks and then lie or steal.
- **Irreversibility**: For vesters, `VE_TOKEN` is immutable post‑init; recovery requires migration/re‑deploy.

---

### Recommendations

- **Code-level hardening**
  - Replace permissionless `lazyInitialize` with an owner‑gated initializer and call it atomically at deployment via `upgradeToAndCall`.
  - Gate with `onlyDolomiteMarginOwner` or proxy admin; combine bootstrap and parameter setting in a single `initialize(...)` call.
  - Add interface sanity checks in setters:
    - Registry: `oracleAggregator` must pass `staticcall` checks for `getPrice(address)` and `getDecimalsByToken(address)`; revert on failure.
    - Registry: `dolomiteMigrator` should pass a lightweight interface/version check.
    - Vester: `discountCalculator` should `staticcall` `calculateDiscount(...)` with sentinel inputs and bounded result.
    - Vester: enforce owner‑only initialization of `VE_TOKEN`; if retained, perform interface checks and revert otherwise.
  - Tighten discount bounds: Consider configurable max discount < 100% or pricing sanity windows.
  - Minimize allowance risk: Approve exact amounts immediately before external call and reset to zero after (note: does not neutralize a malicious VE token—access control is the fix).

- **Deployment and operations**
  - Initialize in the same transaction as proxy deployment using `upgradeToAndCall`, not a follow‑up call.
  - Enforce on‑chain invariants: non‑zero, expected addresses, and interface checks.
  - Audit all live proxies across networks; immediately initialize any with unset slots or deprecate them.
  - Maintain least‑privilege allowances for DAO/vesters, especially in V2 where rewards pull from `dao()`.

- **Monitoring and detection**
  - Alerts for `DolomiteMigratorSet`, `OracleAggregatorSet`, `VeTokenSet`, `DiscountCalculatorSet` to unknown addresses.
  - On‑chain canaries for price deviations and decimals inconsistencies from the aggregator.
  - Runtime assertions in consumers (e.g., price range checks, decimals sanity checks) to fail safe on anomalies.

---

### Severity
- **Critical** for any environment where a proxy can be observed uninitialized (global price feed compromise, migrator abuse, permanent vester corruption).
- **High** residual risk for future deployments if not made atomic and access‑controlled.

---

### Appendix: Key code references

```solidity
// Registry: lazy init (permissionless, single-use)
function lazyInitialize(address _dolomiteMigrator, address _oracleAggregator) external {
    Require.that(
        address(dolomiteMigrator()) == address(0) && address(oracleAggregator()) == address(0),
        _FILE,
        "Already initialized"
    );
    _ownerSetDolomiteMigrator(_dolomiteMigrator);
    _ownerSetOracleAggregator(_oracleAggregator);
}
```

```solidity
// Migrator gating: registry-controlled authority
function _requireOnlyMigrator(address _from) internal view {
    Require.that(
        _from == address(DOLOMITE_REGISTRY.dolomiteMigrator()),
        _FILE,
        "Caller is not migrator",
        _from
    );
}
```

```solidity
// Price consumption via registry aggregator
uint256 rewardPriceAdj = _getRewardPriceAdj(_nftId, _duration, _veTokenId, _veLockEndTime);
uint256 paymentPrice = DOLOMITE_REGISTRY.oracleAggregator().getPrice(address(PAYMENT_TOKEN)).value;
uint256 paymentAmount = _oTokenAmount * rewardPriceAdj / paymentPrice;
```

```solidity
// Vester: lazy init (permissionless, single-use; VE_TOKEN immutable post-init)
function lazyInitialize(address _discountCalculator, address _veToken) external {
    Require.that(address(VE_TOKEN) == address(0), _FILE, "veToken already initialized");
    VE_TOKEN = IVeToken(_veToken);
    emit VeTokenSet(_veToken);

    _ownerSetDiscountCalculator(_discountCalculator);
}
```

```solidity
// Vester: approval + external call to VE token (abuse if VE_TOKEN is malicious)
REWARD_TOKEN.safeApprove(address(VE_TOKEN), position.oTokenAmount);
if (_veTokenId == type(uint256).max) {
    _veTokenId = VE_TOKEN.create_lock_for(position.oTokenAmount, _veLockEndTime - block.timestamp, msg.sender);
} else {
    VE_TOKEN.increase_amount(_veTokenId, position.oTokenAmount);
}
```

