// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title NonStandardERC20
 * @notice ERC20 that returns false on transfer/transferFrom instead of reverting to emulate non-standard tokens.
 *         It also does NOT update balances on transfer/transferFrom when returning false.
 *         Intended for testing receivers that do not use SafeERC20 or check return values.
 */
contract NonStandardERC20 is ERC20 {
    constructor(
        string memory _name,
        string memory _symbol,
        address _initialHolder,
        uint256 _initialSupply
    ) ERC20(_name, _symbol) {
        _mint(_initialHolder, _initialSupply);
    }

    function transfer(address /*recipient*/, uint256 /*amount*/) public override returns (bool) {
        // Do not change balances; just return false to simulate non-standard failure without revert
        return false;
    }

    function transferFrom(address /*sender*/, address /*recipient*/, uint256 /*amount*/) public override returns (bool) {
        // Do not change balances; just return false to simulate non-standard failure without revert
        return false;
    }
}

