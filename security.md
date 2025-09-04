### Multi-Reward Emitter Critical Accounting Vulnerability: Missing Reward-Debt Initialization on First Deposit

**Severity**: Critical

**Affected component**: `packages/liquidity-mining/contracts/EmitterMultipleRewardTokens.sol`

**Related components**: `packages/liquidity-mining/contracts/MintableStorageVault.sol`, `packages/liquidity-mining/contracts/Emitter.sol` (single-reward baseline)

**CWE**: CWE-665 (Improper Initialization) / Accounting logic flaw

---

### Executive summary

- **What**: The multi-reward emitter does not initialize per-token `rewardDebts` for a user on their first deposit. The subsequent withdraw/claim path calculates `pending` from zero debt, paying the user for historical accrual they did not earn, across every configured reward token.
- **Impact**: With the provided `MintableStorageVault`, the contract mints and transfers these excess rewards, causing over-minting (unbounded inflation vs intended schedule). With a finite-reserve vault implementation, this logic would drain stored rewards and harm other users.
- **Exploit simplicity**: Low. Steps are a first deposit followed by `withdraw(..., 0)` (claim). No special sequencing, MEV, or reentrancy needed.
- **Scope**: Per affected pool and for each configured reward token. A single action can skim retroactive accrual for all reward tokens at once.
- **Status**: The repository marks the multi-reward emitter as not production-ready in tests, but the code-level issue stands and is exploitable if deployed/authorized.

---

### Technical background: per-share reward accounting

The emitter tracks per-pool cumulative indices `accRewardTokenPerShares[token]` and per-user balances and reward debts:

- `pool.accRewardTokenPerShares[token]` grows over time while rewards accrue and `pool.totalPar > 0`.
- `user.amount` is the user’s staked balance (in par units) for a given market.
- `user.rewardDebts[token]` represents the checkpoint of `amount * accPerShare[token]` at the last accounting update for that user.

Rewards due at any checkpoint are computed as:

`pending = user.amount * pool.accRewardTokenPerShares[token] / SCALE - user.rewardDebts[token]`.

To prevent retroactive payouts, a correct implementation must set `rewardDebts[token] = user.amount * accPerShare[token] / SCALE` after each balance-changing operation, including the user’s first deposit.

---

### Root cause (code-cited): debt not initialized on first deposit

In `deposit`, the emitter updates the pool, increases the pool total and the user amount, and then conditionally pays and sets debts only if the user had a prior balance (`cachedAmount > 0`). For a first-time depositor (`cachedAmount == 0`), the entire loop is skipped, leaving all `rewardDebts[token]` at the default value of zero.

```131:149:packages/liquidity-mining/contracts/EmitterMultipleRewardTokens.sol
        uint256 cachedAmount = user.amount;
        updatePool(_marketId);
        pool.totalPar += changeAccountPar.value;
        user.amount += changeAccountPar.value;

        uint256 len = _rewardTokens.length();
        if (cachedAmount > 0) {
            for (uint256 i; i < len; i++) {
                RewardToken memory rewardToken = rewardTokenInfo[_rewardTokens.at(i)];
                uint256 pending =
                    (cachedAmount * pool.accRewardTokenPerShares[rewardToken.token] / _SCALE)
                        - user.rewardDebts[rewardToken.token];
                user.rewardDebts[rewardToken.token] =
                    user.amount * pool.accRewardTokenPerShares[rewardToken.token] / _SCALE;

                IStorageVault(rewardToken.tokenStorageVault).pullTokensFromVault(pending);
                IERC20(rewardToken.token).transfer(msg.sender, pending);
            }
        }
```

Because there is no `else` path or unconditional debt initialization after increasing `user.amount`, `user.rewardDebts[token]` remains zero after the first deposit for each reward token. This mis-initialization is the root cause of the retroactive payout.

---

### Consequence in withdraw/claim path: retroactive payout from zero debt

The `withdraw` path repeats the same conditional logic, assuming debts were already initialized. On the first claim after the first deposit, `cachedAmount > 0` and `user.rewardDebts[token] == 0`, so `pending` equals the full historical accrual represented by `accRewardTokenPerShares[token]` times the user’s amount.

```206:219:packages/liquidity-mining/contracts/EmitterMultipleRewardTokens.sol
        uint256 len = _rewardTokens.length();
        if (cachedAmount > 0) {
            for (uint256 i; i < len; i++) {
                RewardToken memory rewardToken = rewardTokenInfo[_rewardTokens.at(i)];
                uint256 pending =
                    (cachedAmount * pool.accRewardTokenPerShares[rewardToken.token] / _SCALE)
                        - user.rewardDebts[rewardToken.token];
                user.rewardDebts[rewardToken.token] =
                    user.amount * pool.accRewardTokenPerShares[rewardToken.token] / _SCALE;

                IStorageVault(rewardToken.tokenStorageVault).pullTokensFromVault(pending);
                IERC20(rewardToken.token).transfer(msg.sender, pending);
            }
        }
```

The first time this executes for a fresh user, `pending = cachedAmount * accPerShare[token] - 0`, which pays for all historical emissions since the pool’s accrual began or last reset, not just since the user’s deposit.

Note: `emergencyWithdraw` resets `user.amount` and all `user.rewardDebts[token]` to zero, which is expected, but unrelated to the missing initialization on first deposit.

```239:245:packages/liquidity-mining/contracts/EmitterMultipleRewardTokens.sol
        user.amount = 0;
        uint256 len = _rewardTokens.length();
        for (uint256 i; i < len; i++) {
            RewardToken memory rewardToken = rewardTokenInfo[_rewardTokens.at(i)];
            user.rewardDebts[rewardToken.token] = 0;
        }
```

---

### How `accRewardTokenPerShares` grows (why “historical accrual” exists)

`updatePool` increases `accRewardTokenPerShares[token]` proportionally to elapsed time and emission rate whenever supply is non-zero. Two early `return` statements inside the loop can prematurely stop updates for later tokens, but this is orthogonal to the debt-initialization bug.

```270:296:packages/liquidity-mining/contracts/EmitterMultipleRewardTokens.sol
    function updatePool(uint256 _marketId) public {
        PoolInfo storage pool = poolInfo[_marketId];
        uint256 supply = pool.totalPar;

        uint256 len = _rewardTokens.length();
        for (uint256 i; i < len; i++) {
            RewardToken memory rewardToken = rewardTokenInfo[_rewardTokens.at(i)];

            if (block.timestamp <= pool.lastRewardTimes[rewardToken.token]) {
                return;
            }

            if(supply == 0) {
                pool.lastRewardTimes[rewardToken.token] = block.timestamp;
                return;
            }

            if (rewardToken.isAccruing) {
                uint256 reward =
                    rewardTokenPerSecond * pool.allocPoint * (block.timestamp - pool.lastRewardTimes[rewardToken.token])
                        / totalAllocPoint;
                pool.accRewardTokenPerShares[rewardToken.token]
                    = pool.accRewardTokenPerShares[rewardToken.token] + (reward * _SCALE / supply);
                pool.lastRewardTimes[rewardToken.token] = block.timestamp;
            }
        }
    }
```

---

### Correct pattern (single-reward baseline)

The single-reward emitter correctly resets/initializes `rewardDebt` and sets it after every deposit, including the first deposit. This prevents retroactive overpayment.

```115:126:packages/liquidity-mining/contracts/Emitter.sol
        updatePool(_marketId);
        // Reset reward debt in the case of new campaign
        if (user.lastUpdateTime < startTime) {
            user.rewardDebt = 0;
        }

        if (user.amount > 0) {
            uint256 pending = user.amount * pool.accOARBPerShare / _SCALE - user.rewardDebt;
            oARB.mint(pending);
            IERC20(address(oARB)).safeTransfer(msg.sender, pending);
        }
```

```140:144:packages/liquidity-mining/contracts/Emitter.sol
        pool.totalPar += changeAccountPar.value;
        user.amount += changeAccountPar.value;
        user.rewardDebt = user.amount * pool.accOARBPerShare / _SCALE;
        user.lastUpdateTime = block.timestamp;
```

---

### Payout source is unconstrained (with minting vault)

The `MintableStorageVault` mints and transfers the requested `_amount` to the caller if the caller is a Dolomite global operator. The multi-reward emitter must be a global operator for normal operation and, once authorized, can mint whatever its logic requests (including overpayments from the bug).

```59:62:packages/liquidity-mining/contracts/MintableStorageVault.sol
    function pullTokensFromVault(uint256 _amount) external onlyDolomiteMarginGlobalOperator(msg.sender) {
        oARB.mint(_amount);
        IERC20(address(oARB)).transfer(msg.sender, _amount);
    }
```

---

### Test-suite note on deployment status

The repository’s multi-reward tests explicitly mark the suite as skipped and state this emitter contract is not in production. This is a repository-level note only; it does not change code-level exploitability.

```41:42:packages/liquidity-mining/test/EmitterMultipleRewardTokens.ts
// Emitter contract is not in use in production. These tests don't all pass
xdescribe('EmitterMultipleRewardTokens', () => {
```

---

### Exploitability analysis

- **Preconditions**:
  - `pool.accRewardTokenPerShares[token] > 0` for at least one configured reward token. This requires historical periods with `pool.totalPar > 0` and `rewardToken.isAccruing == true`.
  - The emitter is authorized as a Dolomite “global operator” for the vault(s) so it can call `pullTokensFromVault` (required for normal operation in any case).

- **Attack steps (single address, any supported market)**:
  1. Call `deposit(fromAccountNumber, marketId, amountWei)` as a first-time depositor.
     - Effect: `user.amount` increases; `user.rewardDebts[token]` stays at zero for all reward tokens.
  2. Immediately call `withdraw(marketId, 0)` to “claim” without withdrawing principal.
     - Effect: For each token, `pending = user.amount * accRewardTokenPerShares[token] - 0` is paid.
  3. Optionally withdraw principal later; the windfall is already realized.

- **Why this works**: The first deposit leaves debts uninitialized. The first subsequent accounting event (withdraw/claim or second deposit) computes `pending` from zero debt and pays out historical accrual encoded in `accRewardTokenPerShares`.

- **Multi-token compounding**: The loop pays per token in a single call. One action skims across all configured reward tokens simultaneously, subject to each token’s `accRewardTokenPerShares[token]`.

- **Large vs. small pools**:
  - Smaller historical supply → larger `accRewardTokenPerShares` growth for a given emission → larger windfall for a given user amount.
  - Larger historical supply → slower `acc` growth; attacker can scale the windfall by depositing a larger `amountWei`. Payout is linear in `user.amount` and `acc`.

- **Number of users**: Irrelevant to exploitability. Only prior non-zero supply and time passage matter for `acc`.

---

### Impact

- **With `MintableStorageVault` (as in this repo)**:
  - Over-minting/inflation beyond intended emissions. This does not directly steal from other users’ pending balances but violates token economics and emission schedules.

- **With a finite-balance vault (alternative implementation)**:
  - Early overpayments would drain the vault’s reserves, potentially leaving later claimants with nothing until replenished.

- **Protocol-level**:
  - Emission schedule integrity compromised; accounting invariants broken.
  - Governance-facing risk if mint authority is indirectly exercised via this emitter logic.

---

### Severity rationale

- Unbounded, protocol-authorized mint/transfer of rewards due to a logic error, triggered by any user with a minimal first deposit and a zero-amount withdraw.
- A single user can claim a one-time windfall per pool per reward token. In aggregate, multiple first-time users can repeatedly exploit the same logic.
- No dependency on reentrancy, oracles, or MEV ordering.

Result: **Critical**.

---

### Recommendations (code-level fixes)

1. In `deposit`, after updating `user.amount`, initialize per-token debts for all configured reward tokens regardless of `cachedAmount`.
   - Keep “pay pending” guarded by `if (cachedAmount > 0)`.
   - But always run a second loop to set:
     - `user.rewardDebts[token] = user.amount * pool.accRewardTokenPerShares[token] / _SCALE` for every token.

2. Mirror the single-reward emitter pattern:
   - Update pool → (pay pending if prior amount > 0) → mutate balances → set reward debt to the new `amount * acc`.

3. Add targeted tests:
   - “First deposit then `withdraw(0)`” must pay only emissions since the deposit block.
   - “First deposit then second deposit” must not pay retroactive accrual.

4. Optional hardening and cleanup:
   - Consider a per-user campaign reset flag (e.g., `lastUpdateTime`) akin to the single-reward emitter if campaigns can restart.
   - Fix `updatePool` early-return behavior inside the per-token loop to avoid skipping later tokens. For example, convert early returns to `continue` where appropriate.

---

### Risk monitoring and detection (operations)

- Alert on anomalous mint volumes from vaults relative to configured emission rates.
- Flag first-time depositors whose first claim produces unusually high rewards per unit staked.
- Correlate `Withdraw` events with zero withdrawal amounts immediately following first deposits.

---

### Appendix: additional authoritative code citations

- Multi-reward acc-per-share growth and early-returns in the per-token loop:

```270:296:packages/liquidity-mining/contracts/EmitterMultipleRewardTokens.sol
    function updatePool(uint256 _marketId) public {
        PoolInfo storage pool = poolInfo[_marketId];
        uint256 supply = pool.totalPar;

        uint256 len = _rewardTokens.length();
        for (uint256 i; i < len; i++) {
            RewardToken memory rewardToken = rewardTokenInfo[_rewardTokens.at(i)];

            if (block.timestamp <= pool.lastRewardTimes[rewardToken.token]) {
                return;
            }

            if(supply == 0) {
                pool.lastRewardTimes[rewardToken.token] = block.timestamp;
                return;
            }

            if (rewardToken.isAccruing) {
                uint256 reward =
                    rewardTokenPerSecond * pool.allocPoint * (block.timestamp - pool.lastRewardTimes[rewardToken.token])
                        / totalAllocPoint;
                pool.accRewardTokenPerShares[rewardToken.token]
                    = pool.accRewardTokenPerShares[rewardToken.token] + (reward * _SCALE / supply);
                pool.lastRewardTimes[rewardToken.token] = block.timestamp;
            }
        }
    }
```

- Single-reward emitter’s correct debt update on deposit:

```140:144:packages/liquidity-mining/contracts/Emitter.sol
        pool.totalPar += changeAccountPar.value;
        user.amount += changeAccountPar.value;
        user.rewardDebt = user.amount * pool.accOARBPerShare / _SCALE;
        user.lastUpdateTime = block.timestamp;
```

- Vault mint-and-transfer on pull (no in-protocol cap):

```59:62:packages/liquidity-mining/contracts/MintableStorageVault.sol
    function pullTokensFromVault(uint256 _amount) external onlyDolomiteMarginGlobalOperator(msg.sender) {
        oARB.mint(_amount);
        IERC20(address(oARB)).transfer(msg.sender, _amount);
    }
```

- Test disclaimer (non-production note):

```41:42:packages/liquidity-mining/test/EmitterMultipleRewardTokens.ts
// Emitter contract is not in use in production. These tests don't all pass
xdescribe('EmitterMultipleRewardTokens', () => {
```

---

### One-paragraph conclusion

`EmitterMultipleRewardTokens` fails to initialize per-token `rewardDebts` on the first deposit, causing the first subsequent accounting step to pay `amount * accPerShare[token]` for every configured token, i.e., retroactive rewards the user did not earn. With the provided minting vault, this manifests as protocol-authorized over-minting beyond the intended schedule. The fix is straightforward: always set per-token reward debts after balance updates on deposit (and maintain the standard pay-then-set-debt sequence), plus consider cleaning up the early-return behavior in `updatePool`.

