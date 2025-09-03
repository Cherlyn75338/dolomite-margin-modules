// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IStorageVault } from "../interfaces/IStorageVault.sol";

/**
 * @title MaliciousVault
 * @notice A vault that can reenter a target contract during pullTokensFromVault for testing reentrancy resistance.
 */
contract MaliciousVault is IStorageVault {
    IERC20 public immutable token;
    address public target;
    bytes public callData;

    constructor(IERC20 _token) {
        token = _token;
    }

    function setReenterTarget(address _target, bytes calldata _callData) external {
        target = _target;
        callData = _callData;
    }

    function pullTokensFromVault(uint256 _amount) external override {
        if (target != address(0) && callData.length > 0) {
            // Attempt reentrancy
            // solhint-disable-next-line avoid-low-level-calls
            (bool ok,) = target.call(callData);
            require(ok, "Reenter failed");
        }
        require(token.transfer(msg.sender, _amount), "Vault transfer failed");
    }
}

