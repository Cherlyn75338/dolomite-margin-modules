Great auditors don’t just look for what’s broken — they look for what works too well.

A lot of auditors focus on identifying mistakes in code — reverts, missing checks, typos. These are essential, but deeper vulnerabilities often live in code that behaves as designed — just not as safely assumed.

## 🧠 Mindset Shift

Your role is not to scan for generic bugs.

Your role is to:

- Think like an adversary with intimate knowledge of Dolomite account semantics and these vesting/emissions flows.
- Read every contract and function in `/packages/liquidity-mining/contracts` thoroughly, including storage slot usage and price math.
- Understand intended token economics and authority flows, then find ways to subvert incentives or invariants without violating explicit checks.

## 🔍 Methodology (tailored to this repo)

### Enumerate Entry Points (per contract)

- Emitter: deposit, withdraw, emergencyWithdraw, updatePool, admin pool/campaign setters.
- EmitterMultipleRewardTokens: same as above plus reward token management.
- RewardsDistributor: claim, handler root setters, owner token set.
- Vesters:
  - V1: vest, closePositionAndBuyTokens, forceClosePosition, emergencyWithdraw, owner setters.
  - V2: vest, extendDurationForPosition, closePositionAndBuyTokens, forceClosePosition, emergencyWithdraw, level request/handler updates/ETH withdraw, owner setters.
  - ExternalVesterV1: vest, vestInstantly, closePositionAndBuyTokens, forceClosePosition (public), emergencyWithdraw, owner deposit/withdraw and setters.
  - GravitaExternalVesterImplementationV2: shutdown admin functions.
- Tokens/Vaults: OARB, ExternalOARB, MineralToken, MintableStorageVault.
- Proxy: UpgradeableProxy upgrade functions.

### Trace Execution Flows

For each entry point, trace through:

- Account mutations via `AccountActionLib` (transfer/deposit/withdraw) and `IDolomiteStructs` semantics.
- Reward accrual math: per-share accumulators, `rewardDebt` usage, campaign resets.
- Vesting position lifecycle: NFT mint/burn, `promisedTokens`, “close window” and taxes, price read (`getMarketPrice`) and cost math.
- External calls: ERC20 transfers, storage vault pulls/mints, handler functions.
- Identify all authority checks: `OnlyDolomiteMargin` owner/global operator, Ownable handlers, custom `onlyHandler`.

### Hunt by Intent (focus areas)

Look for enabling conditions:

- Reentrancy and external calls
  - EmitterMultipleRewardTokens paying via `IStorageVault.pullTokensFromVault` and ERC20 transfer during state updates.
  - Vesters calling ERC20 transfers and Dolomite actions without reentrancy guard (e.g., `emergencyWithdraw`).
- Access Control/Authority Drift
  - Who can mint/burn `oARB` and when? Are handlers/global operators tightly scoped?
  - RewardsDistributor handlers can set roots; VesterV2 handlers can withdraw ETH and set levels.
  - ExternalVesterV1 public `forceClosePosition`.
- Upgradeability and Storage Slots
  - EIP-1967 slot usage across {V1, V2, ExternalV1} and proxy. Any slot collisions? Immutable slots in V2 (e.g., `O_TOKEN_SLOT`) rely on prior state.
  - UpgradeableProxy lacks UUPS proxiable checks/rollback — admin must be disciplined.
- Economic/Oracle Risk
  - Vesters compute costs from `getMarketPrice`. Can ARB/WETH/PAIR prices be manipulated intra-tx? Are these TWAPs? Look for single-block manipulation vectors.
  - Discount calculators: validate bounds and extreme cases (max duration leads to 100% discount).
- Emissions Math/Accounting
  - Verify `accPerShare`/`rewardDebt` correctness across deposits, withdraws, `emergencyWithdraw`.
  - In `EmitterMultipleRewardTokens.updatePool`, identify early-return bug blocking accrual updates for later tokens.
  - Campaign reset semantics in `Emitter.ownerCreateNewCampaign` potentially invalidating pending rewards.
- Token Semantics
  - Approvals in `ExternalVesterV1._depositIntoDolomite`: `safeApprove` pattern for non-standard tokens (USDT).
  - `MineralToken` transfer gating; implications on integrations.

## 🎯 Exploit Categories (Solidity-focused)

- Reentrancy (ERC20 transfers, vault pulls)
- Access Control Gaps (owner/handler/global-operator misuse)
- Upgradeability/Storage Collisions (EIP-1967 manual slots)
- Oracle/Price Manipulation (cost calculation, discount application)
- Emission Accounting Bugs (accumulator math, pool update ordering)
- Approval/Allowance Issues (`safeApprove` vs `increaseAllowance`)
- Time/Block Assumptions (startTime resets, close windows)
- Economic Attacks (discount extremes, campaign resets)
- Precision/Rounding (integer division in pricing and accrual)
- Denial of Service (approval patterns, public expiry griefing)

## ✅ Deliverables

For each entry point:

- Impact category (e.g., Emissions Logic, Access Control, Reentrancy, Oracle Risk)
- Exploit path with specific function and line references
- Example scenario (tx sequence where applicable)
- Mitigations aligned to:
  - Minimal privilege and handler/owner hygiene
  - Safer math and per-token accrual
  - Defense-in-depth: `nonReentrant` where prudent, eventing, timelocks, staged upgrades, migration playbooks

## 🧵 Final Advice

Don’t just read the code — challenge it.

- Where are assumptions about Dolomite prices or token semantics not formally enforced?
- Where are owner/handler/global-operator powers “too effective”?
- Where does “works as coded” allow harmful outcomes (e.g., campaign resets, early-return accrual bug, 100% discount extremes)?

