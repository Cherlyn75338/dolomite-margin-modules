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

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20Mintable } from "../interfaces/IERC20Mintable.sol";


/**
 * @title   NonCompliantMintableERC20
 * @author  Dolomite (test-only)
 *
 * @notice ERC20 that implements mint/burn for tests, but has a non-compliant transfer implementation
 *         that ALWAYS returns false and does not move balances. Used to demonstrate contracts that do
 *         not check the return value of ERC20.transfer.
 */
contract NonCompliantMintableERC20 is ERC20, IERC20Mintable {

    constructor() ERC20("NonCompliant Token", "BAD") {} // solhint-disable-line

    function mint(uint256 _amount) external override {
        _mint(msg.sender, _amount);
    }

    function burn(uint256 _amount) external override {
        _burn(msg.sender, _amount);
    }

    // Intentionally non-compliant: does not move balances, always returns false
    function transfer(address, uint256) public override returns (bool) {
        return false;
    }
}

