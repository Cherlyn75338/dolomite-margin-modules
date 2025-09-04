// SPDX-License-Identifier: GPL-3.0-or-later
/*

    Copyright 2023 Dolomite

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.

*/

pragma solidity ^0.8.9;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { EmitterMultipleRewardTokens } from "../EmitterMultipleRewardTokens.sol";
import { IStorageVault } from "../interfaces/IStorageVault.sol";


/**
 * @title   TestEmitterMultipleRewardTokensHarness
 * @author  Dolomite (test-only)
 *
 * @notice Exposes internal state mutation helpers and a reward payout harness for testing.
 */
contract TestEmitterMultipleRewardTokensHarness is EmitterMultipleRewardTokens {

    constructor(
        address _dolomiteMargin,
        address _dolomiteRegistry,
        uint256 _rewardTokenPerSecond,
        uint256 _startTime
    ) EmitterMultipleRewardTokens(_dolomiteMargin, _dolomiteRegistry, _rewardTokenPerSecond, _startTime) {}

    function harnessSetPoolTotalPar(uint256 _marketId, uint256 _totalPar) external {
        poolInfo[_marketId].totalPar = _totalPar;
    }

    function harnessSetUserAmount(uint256 _marketId, address _user, uint256 _amount) external {
        userInfo[_marketId][_user].amount = _amount;
    }

    function harnessSetUserRewardDebt(uint256 _marketId, address _user, address _token, uint256 _debt) external {
        userInfo[_marketId][_user].rewardDebts[_token] = _debt;
    }

    function harnessSetPoolAccPerShare(uint256 _marketId, address _token, uint256 _acc) external {
        poolInfo[_marketId].accRewardTokenPerShares[_token] = _acc;
    }

    function harnessPayRewardForToken(uint256 _marketId, address _token) external {
        uint256 cachedAmount = userInfo[_marketId][msg.sender].amount;
        if (cachedAmount == 0) return;
        RewardToken memory rewardToken = rewardTokenInfo[_token];
        uint256 pending =
            (cachedAmount * poolInfo[_marketId].accRewardTokenPerShares[_token] / 1e18)
                - userInfo[_marketId][msg.sender].rewardDebts[_token];
        userInfo[_marketId][msg.sender].rewardDebts[_token] =
            userInfo[_marketId][msg.sender].amount * poolInfo[_marketId].accRewardTokenPerShares[_token] / 1e18;

        IStorageVault(rewardToken.tokenStorageVault).pullTokensFromVault(pending);
        IERC20(rewardToken.token).transfer(msg.sender, pending);
    }
}

