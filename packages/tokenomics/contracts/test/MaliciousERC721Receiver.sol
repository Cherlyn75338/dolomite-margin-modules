// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

interface IVotingEscrowMinimal {
    function withdraw(uint256 _tokenId) external;
    function merge(uint256 _from, uint256 _to) external;
    function split(uint256 _from, uint256 _amount) external returns (uint256);
}

contract MaliciousERC721Receiver is IERC721Receiver {
    enum AttackType { None, Withdraw, MergeSelf, SplitSmall }

    address public immutable ve;
    AttackType public attackType;
    uint256 public reenterTokenId;
    bool public hasReentered;

    constructor(address _ve) {
        ve = _ve;
    }

    function setAttack(AttackType _attackType, uint256 _tokenId) external {
        attackType = _attackType;
        reenterTokenId = _tokenId;
        hasReentered = false;
    }

    function onERC721Received(
        address /*operator*/,
        address /*from*/,
        uint256 tokenId,
        bytes calldata /*data*/
    ) external override returns (bytes4) {
        if (!hasReentered) {
            hasReentered = true;
            if (attackType == AttackType.Withdraw) {
                // try reentrant withdraw on received token or supplied id
                uint256 id = reenterTokenId == 0 ? tokenId : reenterTokenId;
                // ignore failure
                try IVotingEscrowMinimal(ve).withdraw(id) {} catch {}
            } else if (attackType == AttackType.MergeSelf) {
                // attempt merging token into itself or provided id
                uint256 id = reenterTokenId == 0 ? tokenId : reenterTokenId;
                try IVotingEscrowMinimal(ve).merge(id, id) {} catch {}
            } else if (attackType == AttackType.SplitSmall) {
                // attempt splitting minimal amount
                try IVotingEscrowMinimal(ve).split(tokenId, 1) returns (uint256) {
                } catch {}
            }
        }
        return IERC721Receiver.onERC721Received.selector;
    }
}

