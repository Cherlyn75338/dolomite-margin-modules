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
 * @title   FeeOnTransferERC20
 * @author  Dolomite
 *
 * @notice  Simple fee-on-transfer ERC20 used for testing partial transfer behavior.
 */
contract FeeOnTransferERC20 is ERC20 {

    // fee in basis points (1% = 100)
    uint256 public immutable feeBps;
    address public immutable feeReceiver;

    constructor(string memory _name, string memory _symbol, uint256 _feeBps, address _feeReceiver)
    ERC20(_name, _symbol) {
        feeBps = _feeBps;
        feeReceiver = _feeReceiver;
        _mint(msg.sender, 1e36);
    }

    function _transfer(address from, address to, uint256 amount) internal override {
        if (feeBps == 0 || amount == 0) {
            super._transfer(from, to, amount);
            return;
        }
        uint256 fee = (amount * feeBps) / 10_000;
        uint256 sendAmount = amount - fee;
        if (fee > 0) {
            super._transfer(from, feeReceiver, fee);
        }
        super._transfer(from, to, sendAmount);
    }
}

