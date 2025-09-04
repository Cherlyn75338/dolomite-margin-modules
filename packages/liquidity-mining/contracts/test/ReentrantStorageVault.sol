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

import { IStorageVault } from "../interfaces/IStorageVault.sol";


/**
 * @title   ReentrantStorageVault
 * @author  Dolomite (test only)
 *
 * @notice  Test vault that can invoke a callback on a target after "pullTokensFromVault"
 */
contract ReentrantStorageVault is IStorageVault {

    address public immutable token;
    address public callbackTarget;
    bytes public callbackData;

    constructor(address _token) {
        token = _token;
    }

    function setCallback(address _target, bytes calldata _data) external {
        callbackTarget = _target;
        callbackData = _data;
    }

    function pullTokensFromVault(uint256 _amount) external override {
        // If a callback is configured, invoke it to simulate reentrancy
        if (callbackTarget != address(0) && callbackData.length > 0) {
            // solhint-disable-next-line avoid-low-level-calls
            (bool ok,) = callbackTarget.call(callbackData);
            require(ok, "reentrant-callback-failed");
        }

        // Transfer pre-minted tokens from this vault to caller
        // Using minimal interface to avoid SafeERC20 requirement in test mock
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(bytes4(keccak256("transfer(address,uint256)")), msg.sender, _amount)
        );
        require(success && (data.length == 0 || abi.decode(data, (bool))), "vault-transfer-failed");
    }
}

