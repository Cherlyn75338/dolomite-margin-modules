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
 * @title   TestUSDTLike
 * @author  Dolomite
 *
 * @notice  ERC20 that reverts when changing a non-zero allowance to a non-zero allowance, mimicking USDT behavior.
 */
contract TestUSDTLike is ERC20 {
    mapping(address => mapping(address => uint256)) private _allowances;

    constructor() ERC20("USDT-Like", "USDTL") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function approve(address spender, uint256 amount) public override returns (bool) {
        address owner = _msgSender();
        uint256 current = _allowances[owner][spender];
        if (current != 0 && amount != 0) {
            revert("USDT: approve from non-zero to non-zero");
        }
        _approve(owner, spender, amount);
        _allowances[owner][spender] = amount;
        return true;
    }

    function allowance(address owner, address spender) public view override returns (uint256) {
        return _allowances[owner][spender];
    }
}

