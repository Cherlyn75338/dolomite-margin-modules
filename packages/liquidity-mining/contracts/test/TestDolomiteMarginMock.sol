// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.9;

import { IDolomiteStructs } from "@dolomite-exchange/modules-base/contracts/protocol/interfaces/IDolomiteStructs.sol";

/**
 * @title   TestDolomiteMarginMock
 * @notice  Minimal mock implementing the subset of DolomiteMargin used by EmitterMultipleRewardTokens
 */
contract TestDolomiteMarginMock {
    using _ParLib for IDolomiteStructs.Par;

    // owner (governance) for administrative actions
    address public owner;

    // operator permissions
    mapping(address => bool) private _globalOperatorMap;

    // balances for (owner, number, marketId) in wei and par (kept equal 1:1 for simplicity)
    mapping(address => mapping(uint256 => mapping(uint256 => int256))) private _weiBalances; // signed

    constructor(address _owner) {
        owner = _owner;
    }

    // ================ Admin ================

    function ownerSetGlobalOperator(address operator, bool approved) external {
        require(msg.sender == owner, "not owner");
        _globalOperatorMap[operator] = approved;
    }

    function setAccountWei(address accountOwner, uint256 accountNumber, uint256 marketId, int256 amountWei) external {
        require(msg.sender == owner, "not owner");
        _weiBalances[accountOwner][accountNumber][marketId] = amountWei;
    }

    // ================ Views ================

    function getIsGlobalOperator(address operator) external view returns (bool) {
        return _globalOperatorMap[operator];
    }

    function getAccountWei(IDolomiteStructs.AccountInfo calldata account, uint256 marketId)
        external
        view
        returns (IDolomiteStructs.Wei memory)
    {
        int256 bal = _weiBalances[account.owner][account.number][marketId];
        if (bal >= 0) {
            return IDolomiteStructs.Wei({ sign: true, value: uint256(bal) });
        } else {
            return IDolomiteStructs.Wei({ sign: false, value: uint256(-bal) });
        }
    }

    function getAccountPar(IDolomiteStructs.AccountInfo calldata account, uint256 marketId)
        external
        view
        returns (IDolomiteStructs.Par memory)
    {
        int256 bal = _weiBalances[account.owner][account.number][marketId];
        if (bal >= 0) {
            return IDolomiteStructs.Par({ sign: true, value: uint128(uint256(bal)) });
        } else {
            return IDolomiteStructs.Par({ sign: false, value: uint128(uint256(-bal)) });
        }
    }

    // ================ Core ================

    function operate(IDolomiteStructs.AccountInfo[] calldata accounts, IDolomiteStructs.ActionArgs[] calldata actions)
        external
    {
        // Handle only Transfer actions with amount denominated in Wei
        for (uint256 i = 0; i < actions.length; i++) {
            IDolomiteStructs.ActionArgs calldata a = actions[i];
            require(a.actionType == IDolomiteStructs.ActionType.Transfer, "unsupported action");

            IDolomiteStructs.AccountInfo calldata from = accounts[a.accountId];
            IDolomiteStructs.AccountInfo calldata to = accounts[a.otherAccountId];

            require(a.amount.denomination == IDolomiteStructs.AssetDenomination.Wei, "only wei denom");

            if (a.amount.ref == IDolomiteStructs.AssetReference.Delta) {
                // subtract from 'from', add to 'to'
                _weiBalances[from.owner][from.number][a.primaryMarketId] -= int256(a.amount.value);
                _weiBalances[to.owner][to.number][a.primaryMarketId] += int256(a.amount.value);
            } else {
                // Target reference: set 'to' to target and move delta from 'from'
                int256 currentTo = _weiBalances[to.owner][to.number][a.primaryMarketId];
                int256 target = int256(a.amount.value) * (a.amount.sign ? int256(1) : int256(-1));
                int256 delta = target - currentTo;
                _weiBalances[to.owner][to.number][a.primaryMarketId] = target;
                _weiBalances[from.owner][from.number][a.primaryMarketId] -= delta;
            }
        }
    }
}

library _ParLib {
    function isPositive(IDolomiteStructs.Par memory p) internal pure returns (bool) {
        return p.sign && p.value > 0;
    }
    function isZero(IDolomiteStructs.Par memory p) internal pure returns (bool) {
        return p.value == 0;
    }
}

