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

/**
 * @title   MockDolomiteMargin
 * @author  Dolomite (test-only)
 *
 * @notice Minimal mock for OnlyDolomiteMargin access control. Supports owner() and getIsGlobalOperator.
 */
contract MockDolomiteMargin {
    address public immutable owner;
    mapping(address => bool) public isGlobalOperator;

    constructor(address _owner) {
        owner = _owner;
    }

    function getIsGlobalOperator(address _who) external view returns (bool) {
        return isGlobalOperator[_who];
    }

    function ownerSetGlobalOperator(address _who, bool _isOperator) external {
        require(msg.sender == owner, "only owner");
        isGlobalOperator[_who] = _isOperator;
    }
}

