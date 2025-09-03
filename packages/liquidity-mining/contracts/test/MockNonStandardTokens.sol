// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IERC20Like {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address owner) external view returns (uint256);
}

contract MockNoReturnERC20 {
    string public name = "MockNoReturn";
    string public symbol = "MNRT";
    uint8 public decimals = 18;
    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function transfer(address to, uint256 amount) external {
        require(balanceOf[msg.sender] >= amount, "Insufficient");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        // no return value
    }
}

contract MockFalseReturnERC20 {
    string public name = "MockFalseReturn";
    string public symbol = "MFRT";
    uint8 public decimals = 18;
    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        if (balanceOf[msg.sender] < amount) {
            return false;
        }
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return false; // always false to simulate non-standard token
    }
}

contract MockFeeOnTransferERC20 {
    string public name = "MockFeeOnTransfer";
    string public symbol = "MFOT";
    uint8 public decimals = 18;
    mapping(address => uint256) public balanceOf;
    uint256 public feeBps = 500; // 5%

    function setFeeBps(uint256 _feeBps) external { feeBps = _feeBps; }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient");
        uint256 fee = amount * feeBps / 10000;
        uint256 received = amount - fee;
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += received;
        // fee burned
        return true;
    }
}

contract MaliciousReentrantVault {
    address public target;
    bool public shouldReenter;

    function setTarget(address _target) external { target = _target; }
    function setShouldReenter(bool _flag) external { shouldReenter = _flag; }

    function pullTokensFromVault(uint256 /* amount */) external {
        if (shouldReenter && target != address(0)) {
            // Try to reenter deposit on the target emitter
            (bool ok,) = target.call(abi.encodeWithSignature("deposit(uint256,uint256,uint256)", 0, 0, 1));
            ok; // ignore
        }
    }
}

