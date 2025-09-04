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

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";


/**
 * @title   NoReturnERC20
 * @author  Dolomite (test only)
 * @notice  ERC20-like token whose transfer/transferFrom do not return a boolean
 */
contract NoReturnERC20 {
    string public name = "NoReturn";
    string public symbol = "NRT";
    uint8 public decimals = 18;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address _to, uint256 _amount) external {
        balanceOf[_to] += _amount;
        emit Transfer(address(0), _to, _amount);
    }

    function approve(address _spender, uint256 _amount) external returns (bool) {
        allowance[msg.sender][_spender] = _amount;
        emit Approval(msg.sender, _spender, _amount);
        return true;
    }

    function transfer(address _to, uint256 _amount) external {
        _transfer(msg.sender, _to, _amount);
    }

    function transferFrom(address _from, address _to, uint256 _amount) external {
        uint256 a = allowance[_from][msg.sender];
        require(a >= _amount, "allowance");
        allowance[_from][msg.sender] = a - _amount;
        _transfer(_from, _to, _amount);
    }

    function _transfer(address _from, address _to, uint256 _amount) internal {
        require(balanceOf[_from] >= _amount, "balance");
        balanceOf[_from] -= _amount;
        balanceOf[_to] += _amount;
        emit Transfer(_from, _to, _amount);
    }

    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);
}


/**
 * @title   FalseReturnERC20
 * @author  Dolomite (test only)
 * @notice  ERC20-like token that returns false on transfer
 */
contract FalseReturnERC20 is IERC20 {
    string public name = "FalseReturn";
    string public symbol = "FLT";
    uint8 public override decimals = 18;

    mapping(address => uint256) public override balanceOf;
    mapping(address => mapping(address => uint256)) public override allowance;

    function totalSupply() external pure override returns (uint256) { return type(uint256).max; }

    function mint(address _to, uint256 _amount) external {
        balanceOf[_to] += _amount;
        emit Transfer(address(0), _to, _amount);
    }

    function approve(address _spender, uint256 _amount) external override returns (bool) {
        allowance[msg.sender][_spender] = _amount;
        emit Approval(msg.sender, _spender, _amount);
        return true;
    }

    function transfer(address _to, uint256 _amount) external override returns (bool) {
        _transfer(msg.sender, _to, _amount);
        return false; // intentionally false
    }

    function transferFrom(address _from, address _to, uint256 _amount) external override returns (bool) {
        uint256 a = allowance[_from][msg.sender];
        require(a >= _amount, "allowance");
        allowance[_from][msg.sender] = a - _amount;
        _transfer(_from, _to, _amount);
        return false; // intentionally false
    }

    function _transfer(address _from, address _to, uint256 _amount) internal {
        require(balanceOf[_from] >= _amount, "balance");
        balanceOf[_from] -= _amount;
        balanceOf[_to] += _amount;
        emit Transfer(_from, _to, _amount);
    }
}

