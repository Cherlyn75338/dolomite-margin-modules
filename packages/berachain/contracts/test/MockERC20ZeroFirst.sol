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
 * @title   MockERC20ZeroFirst
 * @author  Dolomite
 *
 * @notice  ERC20 that reverts when changing a non-zero allowance to another non-zero allowance (zero-first required)
 */
contract MockERC20ZeroFirst is ERC20 {

    constructor(string memory _name, string memory _symbol) ERC20(_name, _symbol) {}

    function mint(address _to, uint256 _amount) external {
        _mint(_to, _amount);
    }

    function approve(address _spender, uint256 _value) public override returns (bool) {
        uint256 current = allowance(_msgSender(), _spender);
        if (current != 0 && _value != 0) {
            revert("ZeroFirst: approve non-zero->non-zero");
        }
        return super.approve(_spender, _value);
    }
}

