// SPDX-License-Identifier: GPL-3.0-or-later
/*

    Copyright 2025 Dolomite

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

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";


/**
 * @title   FeeOnTransferToken
 * @author  Dolomite (test helper)
 *
 * @notice  Simple ERC20 that charges a transfer fee sent to a configurable treasury. Used for testing
 *          fee-on-transfer behavior against integrations that assume exact amounts.
 */
contract FeeOnTransferToken is ERC20 {

    uint8 immutable private _decimals;
    address public treasury;
    uint256 public feeBps; // fee in basis points (1e4 = 100%)

    constructor(string memory name_, string memory symbol_, uint8 decimals_, address _treasury, uint256 _feeBps)
        ERC20(name_, symbol_)
    {
        require(_treasury != address(0), "treasury=0");
        require(_feeBps <= 10000, "fee too high");
        _decimals = decimals_;
        treasury = _treasury;
        feeBps = _feeBps;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setFeeBps(uint256 _feeBps) external {
        require(_feeBps <= 10000, "fee too high");
        feeBps = _feeBps;
    }

    function setTreasury(address _treasury) external {
        require(_treasury != address(0), "treasury=0");
        treasury = _treasury;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0) && feeBps != 0) {
            uint256 fee = (value * feeBps) / 10000;
            uint256 amountAfterFee = value - fee;
            super._update(from, treasury, fee);
            super._update(from, to, amountAfterFee);
        } else {
            super._update(from, to, value);
        }
    }
}

