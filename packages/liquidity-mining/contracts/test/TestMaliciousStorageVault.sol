// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { IStorageVault } from "../interfaces/IStorageVault.sol";

/**
 * Malicious vault that attempts to reenter target by calling a provided callback
 * whenever pullTokensFromVault is invoked.
 */
contract TestMaliciousStorageVault is IStorageVault {
    address public callbackTarget;
    bytes public callbackData;

    function setCallback(address _target, bytes calldata _data) external {
        callbackTarget = _target;
        callbackData = _data;
    }

    function pullTokensFromVault(uint256) external override {
        if (callbackTarget != address(0)) {
            // solhint-disable-next-line avoid-low-level-calls
            (bool, ) = callbackTarget.call(callbackData);
        }
    }
}

