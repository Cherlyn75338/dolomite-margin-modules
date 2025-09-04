// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.9;

interface IGLPVaultV2Minimal {
    function executeDepositIntoVault(address from, uint256 amount) external;
}

contract TestGmxRewardsRouterV2Reentrant {
    address public targetVault;

    function setTarget(address _target) external {
        targetVault = _target;
    }

    // Called by vault during signal flow in tests; reenter into executeDepositIntoVault
    function signalTransfer(address /*receiver*/ ) external {
        if (targetVault != address(0)) {
            IGLPVaultV2Minimal(targetVault).executeDepositIntoVault(msg.sender, 1);
        }
        revert("reentered");
    }
}

