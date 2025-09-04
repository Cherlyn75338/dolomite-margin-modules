// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract LocalTestToken is ERC20 {
    constructor() ERC20("Test", "TST") {}

    function addBalance(address _to, uint256 _amount) external {
        _mint(_to, _amount);
    }
}

