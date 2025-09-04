// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// A USDT-like token that reverts when changing allowance from non-zero to non-zero
contract TestNonStandardUSDT is ERC20 {
    uint8 private _decimals;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _decimals = decimals_;
        _mint(msg.sender, 1_000_000_000 ether);
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function approve(address spender, uint256 amount) public override returns (bool) {
        uint256 current = allowance(msg.sender, spender);
        if (current != 0 && amount != 0) {
            revert("USDT: APPROVE_NON_ZERO_TO_NON_ZERO");
        }
        return super.approve(spender, amount);
    }
}

