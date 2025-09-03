// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * ERC20 that takes a fee on transfer. Fee basis points set at deploy.
 */
contract TestMintableFeeOnTransferERC20 is ERC20 {
    uint256 public immutable feeBps; // out of 10_000

    constructor(string memory _name, string memory _symbol, uint256 _feeBps) ERC20(_name, _symbol) {
        feeBps = _feeBps;
    }

    function mint(address _to, uint256 _amount) external {
        _mint(_to, _amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0) && feeBps > 0) {
            uint256 fee = (value * feeBps) / 10_000;
            uint256 sendAmount = value - fee;
            super._update(from, address(this), fee);
            super._update(from, to, sendAmount);
        } else {
            super._update(from, to, value);
        }
    }
}

