### Security Report: Uninitialized Per‑Token Reward Debt on First Deposit in `EmitterMultipleRewardTokens`

#### Scope
- **Repository area**: `/packages/liquidity-mining/contracts`
- **Primary target**: `EmitterMultipleRewardTokens.sol`
- **Related components**: `Emitter.sol` (single‑reward baseline), `MintableStorageVault.sol`, `IStorageVault` and reward‑token storage/vault interfaces

---

### Executive Summary
- **Vulnerability**: First‑time depositors in the multi‑reward emitter do not have per‑token reward debt initialized. The next withdraw/claim computes `pending = amount * accPerShare - 0`, paying out all historical accrual (retroactive rewards) for every configured reward token.
- **Impact**: With `MintableStorageVault`, this results in over‑minting/inflation beyond the intended emission schedule. With a finite‑reserve vault implementation (not in this repo), it could drain reward balances.
- **Severity**: Critical.
- **Exploit**: Deposit once into any market with `accRewardTokenPerShares[token] > 0`, then immediately `withdraw(marketId, 0)` to skim all historical accrual across all reward tokens.
- **Fix**: Always set `user.rewardDebts[token] = user.amount * accRewardTokenPerShares[token] / SCALE` for every reward token after updating `user.amount`, irrespective of whether this is the user’s first deposit.

---

### Background: Accounting Model and Intended Invariants

- **Per‑user state**:
  - `user.amount` — the user’s stake/position size.
  - `user.rewardDebts[token]` — the user’s per‑token debt index used to avoid retroactive payments. Intended invariant: after every balance‑changing operation for a user, set `rewardDebts[token] = user.amount * accPerShare[token]`.

- **Per‑pool state**:
  - `pool.accRewardTokenPerShares[token]` — cumulative per‑share index for token `token` (scaled by `_SCALE`), monotonically increasing as rewards accrue while `pool.totalPar > 0` and the campaign is accruing.
  - `pool.totalPar` — aggregate supply underpinning the per‑share accounting.

- **Pending reward formula** (per token):
  - `pending = user.amount * accPerShare[token] / SCALE - user.rewardDebts[token]`.
  - Proper behavior requires initializing `user.rewardDebts[token]` to the current index on a user’s first deposit so that `pending` only captures post‑deposit accrual.

---

### Detailed Vulnerability Description

On deposit in `EmitterMultipleRewardTokens`:

```solidity
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

- **Root of the flaw**: The loop that both pays `pending` and sets `user.rewardDebts[...]` is gated by `if (cachedAmount > 0)`. For a first‑time depositor, `cachedAmount == 0`, so the debt initialization path is entirely skipped. All `user.rewardDebts[token]` remain their default zero after the deposit.

On a later withdraw/claim (including `withdraw(_marketId, 0)`):

```solidity
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

- After the first deposit, `cachedAmount > 0` holds; however, since `user.rewardDebts[token]` was never initialized, it remains `0`.
- As a result, `pending = cachedAmount * accPerShare[token] - 0`, which includes all historical accrual encoded in `accPerShare[token]` from before the user joined.

How the per‑share index grows:

```solidity
// inside updatePool
if (rewardToken.isAccruing) {
    uint256 reward = rewardTokenPerSecond * pool.allocPoint
        * (block.timestamp - pool.lastRewardTimes[rewardToken.token])
        / totalAllocPoint;
    pool.accRewardTokenPerShares[rewardToken.token]
        = pool.accRewardTokenPerShares[rewardToken.token] + (reward * _SCALE / supply);
    pool.lastRewardTimes[rewardToken.token] = block.timestamp;
}
```

- As long as `supply > 0` and accrual is on, `accPerShare[token]` monotonically increases over time. Thus, the first claim after a first deposit obtains a retroactive windfall proportional to the user’s current amount and the full historical index.

---

### Why This Is Vulnerable (Root Cause Analysis)

- **Invariant violation**: The core invariant of MasterChef‑style accounting is: after any balance change, set `rewardDebt := amount * accPerShare`. The multi‑token implementation breaks this on first deposit by conditioning debt initialization on `cachedAmount > 0`.
- **Missing else‑path**: There is no else branch that performs "set debt only" for first‑time depositors.
- **Withdraw path assumes prior init**: The withdraw path computes `pending` using `rewardDebts[token]` as if it were previously initialized, leading to `- 0` behavior at the earliest claim.

Contrast with the single‑reward baseline (`Emitter.sol`), which correctly sets debt for first‑time deposits:

```solidity
// ... after updatePool and amount changes
pool.totalPar += changeAccountPar.value;
user.amount += changeAccountPar.value;
user.rewardDebt = user.amount * pool.accOARBPerShare / _SCALE;
user.lastUpdateTime = block.timestamp;
```

- The single‑token emitter always assigns `user.rewardDebt` after deposit, preventing retroactive payout.

---

### Exploitability and Preconditions

- **Preconditions**:
  - For at least one configured reward token, `pool.accRewardTokenPerShares[token] > 0` (i.e., the pool had non‑zero supply in the past while rewards were accruing).
  - The emitter is authorized as a global operator in the reward vault (`onlyDolomiteMarginGlobalOperator`), which is required for normal operation to pay rewards.

- **Attack steps (no special privileges)**:
  1. Call `deposit(fromAccountNumber, marketId, amountWei)` as a first‑time user (so `cachedAmount == 0`). Debts remain uninitialized.
  2. Immediately call `withdraw(marketId, 0)` to claim without withdrawing principal. Now `cachedAmount > 0` and `rewardDebts[token] == 0`, so:
     - `pending = cachedAmount * accPerShare[token]` is paid out for each reward token.
  3. Optionally keep the stake or withdraw principal; the windfall has already been realized.

- **Multi‑token vector**: The payout loop iterates all configured reward tokens; a single claim captures retroactive accrual for each token simultaneously.

- **Large vs small pools**:
  - In small‑supply periods, `accPerShare` can grow rapidly, amplifying windfalls even for modest deposits.
  - In large‑supply pools, acc growth is slower, but the attacker can scale `user.amount` to increase the payout. The windfall is linear in `user.amount` and `accPerShare`.

---

### Impact Analysis

- **With `MintableStorageVault`**:
  - `pullTokensFromVault(pending)` mints tokens on demand and transfers them to the emitter, which forwards them to the user:

    ```solidity
    function pullTokensFromVault(uint256 _amount)
        external
        onlyDolomiteMarginGlobalOperator(msg.sender)
    {
        oARB.mint(_amount);
        IERC20(address(oARB)).transfer(msg.sender, _amount);
    }
    ```

  - Over‑payments inflate token supply beyond the intended schedule; other users can still claim, but monetary policy/emission schedules are violated.

- **With a finite‑reserve vault (not in this repo)**:
  - Over‑payments reduce vault balances; early attackers can deplete rewards, harming subsequent claimants.

- **Systemic effects**:
  - Tokenomics distortion through unbounded over‑minting.
  - Governance/reputation risk if emissions exceed publicly stated schedules.

---

### Severity Assessment

- **CVSS v3.1 (suggested)**: `AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:N` → High/Critical (≈ 9.1)
  - Network‑exposed, low complexity, no privileges, no user interaction, integrity impact high (over‑minting/inflation), availability/confidentiality unaffected.

---

### Proof‑of‑Concept (Conceptual)

```text
Assume marketId = M, token set = {T1, T2, ..., Tk}
Precondition: accRewardTokenPerShares[Ti] > 0 for some i

1) User U calls deposit(A, M, amountWei = X)  // first time; cachedAmount == 0
   -> user.rewardDebts[Ti] remain 0 for all Ti

2) User U calls withdraw(M, 0)
   -> cachedAmount == X, user.rewardDebts[Ti] == 0
   -> pending_i = X * accRewardTokenPerShares[Ti] / SCALE
   -> vault mints and transfers pending_i for each Ti

Yield: Retroactive payout across all Ti, proportional to X and historical acc indices
```

---

### Additional Independent Issue (Non‑mitigating)

There is an early `return` inside `updatePool`’s per‑token loop that can cause later tokens to be skipped for an invocation (e.g., if `block.timestamp <= lastRewardTimes[token]` or `supply == 0`). This does not fix or mitigate the primary bug, but can skew per‑token update timing fairness. It should be refactored to `continue` per token rather than `return` for the whole function.

---

### Remediation Guidance

- **Required code‑level fix**: Always set per‑token reward debts after updating the user’s amount, regardless of whether this is the first deposit.

Canonical restructuring for deposit (conceptual):

```solidity
function deposit(...) external {
    uint256 cachedAmount = user.amount;
    updatePool(_marketId);

    // ... transfer in and compute changeAccountPar ...
    pool.totalPar += changeAccountPar.value;
    user.amount   += changeAccountPar.value;

    uint256 len = _rewardTokens.length();
    if (cachedAmount > 0) {
        for (uint256 i; i < len; i++) {
            address token = _rewardTokens.at(i);
            uint256 acc   = pool.accRewardTokenPerShares[token];
            uint256 pending = (cachedAmount * acc / _SCALE) - user.rewardDebts[token];
            if (pending > 0) {
                IStorageVault(rewardTokenInfo[token].tokenStorageVault).pullTokensFromVault(pending);
                IERC20(token).transfer(msg.sender, pending);
            }
        }
    }

    // Unconditionally initialize/update debts for all tokens
    for (uint256 i; i < len; i++) {
        address token = _rewardTokens.at(i);
        user.rewardDebts[token] = user.amount * pool.accRewardTokenPerShares[token] / _SCALE;
    }

    emit Deposit(msg.sender, _marketId, _amountWei);
}
```

- **Nice‑to‑have hardening**:
  - Add per‑user campaign reset logic if campaigns can restart (e.g., a `lastUpdateTime` or epoch marker per token) to avoid stale debt states across epochs.
  - In `updatePool`, replace whole‑function `return` inside the per‑token loop with `continue` to avoid skipping subsequent tokens.
  - Guard zero‑value transfers/mints for gas and clarity.
  - Consider explicit `claim()` that mirrors pay‑then‑set‑debt and is safe on first deposit due to the above initialization.

---

### Testing Recommendations

- Unit tests to assert no retroactive capture:
  - First deposit when `accPerShare[token] > 0`, then `withdraw(marketId, 0)` should pay `0` (post‑fix) per token.
  - Deposit → small time accrual → withdraw(0): pays only accrual between deposit and claim.
  - Multi‑token coverage: heterogenous `accPerShare` values and update timings.
  - Emergency withdraw should zero `amount` and `rewardDebts[token]` consistently.

- Regression tests for `updatePool` multi‑token sequencing:
  - Ensure one token’s `lastRewardTime` condition does not prevent updating other tokens.

---

### Operational Mitigations (If Already Deployed)

- Temporarily pause or gate deposit/withdraw paths if a pausable mechanism exists.
- Revoke global‑operator rights from vulnerable emitters to stop further minting until patched.
- If over‑minting occurred, consider governance‑led remediation: supply adjustments, compensation, or clawback mechanisms if feasible.

---

### Deployment Notes

- The repository’s tests indicate `EmitterMultipleRewardTokens` is not used in production (some tests `xdescribe`). Nonetheless, the code is exploitable if deployed and granted operator rights, and should be fixed prior to any deployment.

---

### Appendix: Key Code Excerpts (for reference)

Deposit/withdraw accounting in multi‑reward (buggy on first deposit):

```solidity
uint256 cachedAmount = user.amount;
updatePool(_marketId);
pool.totalPar += changeAccountPar.value;
user.amount += changeAccountPar.value;

uint256 len = _rewardTokens.length();
if (cachedAmount > 0) {
    for (uint256 i; i < len; i++) {
        RewardToken memory rewardToken = rewardTokenInfo[_rewardTokens.at(i)];
        uint256 pending = (cachedAmount * pool.accRewardTokenPerShares[rewardToken.token] / _SCALE)
            - user.rewardDebts[rewardToken.token];
        user.rewardDebts[rewardToken.token] = user.amount * pool.accRewardTokenPerShares[rewardToken.token] / _SCALE;

        IStorageVault(rewardToken.tokenStorageVault).pullTokensFromVault(pending);
        IERC20(rewardToken.token).transfer(msg.sender, pending);
    }
}
```

Single‑reward baseline (correctly initializes debt after deposit):

```solidity
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

// ...
pool.totalPar += changeAccountPar.value;
user.amount += changeAccountPar.value;
user.rewardDebt = user.amount * pool.accOARBPerShare / _SCALE;
user.lastUpdateTime = block.timestamp;
```

Vault mint‑on‑pull behavior (enables over‑minting when logic overpays):

```solidity
function pullTokensFromVault(uint256 _amount) external onlyDolomiteMarginGlobalOperator(msg.sender) {
    oARB.mint(_amount);
    IERC20(address(oARB)).transfer(msg.sender, _amount);
}
```

---

### Conclusion

- **Confirmed vulnerability**: Missing initialization of per‑token `rewardDebts` on a user’s first deposit in `EmitterMultipleRewardTokens`.
- **Effect**: First subsequent claim/withdraw pays `user.amount * accPerShare[token]` for each token, granting retroactive rewards the user did not earn.
- **Risk**: Critical token over‑minting with the provided vault; potential depletion with finite vaults.
- **Action**: Implement unconditional debt initialization after deposit for all tokens, add tests, and refactor `updatePool` loop control.

