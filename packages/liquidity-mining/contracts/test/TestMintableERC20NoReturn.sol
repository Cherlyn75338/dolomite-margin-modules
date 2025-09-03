// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * A deliberately non-standard ERC20 that omits return values from transfer/transferFrom
 * to simulate tokens like USDT prior to standardization.
 */
contract TestMintableERC20NoReturn is ERC20 {
    constructor(string memory _name, string memory _symbol) ERC20(_name, _symbol) {}

    function mint(address _to, uint256 _amount) external {
        _mint(_to, _amount);
    }

    function transfer(address _to, uint256 _amount) public override returns (bool) {
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = address(this).call(abi.encodeWithSelector(ERC20.transfer.selector, _to, _amount));
        success; // no-op to silence warnings
        _transfer(_msgSender(), _to, _amount);
        assembly {
            return(0, 0)
        }
    }

    function transferFrom(address _from, address _to, uint256 _amount) public override returns (bool) {
        _spendAllowance(_from, _msgSender(), _amount);
        _transfer(_from, _to, _amount);
        assembly {
            return(0, 0)
        }
    }
}

