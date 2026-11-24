// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title SettlementAnchor
/// @notice Deployed on RL1. Right after a settlement is confirmed on the L2, the bank's gateway
///         records it here: L2 transaction hash, L2 block number and L2 block hash, plus the
///         business reference. This gives every settlement an RL1 record within one RL1 block,
///         independent of how often the rollup's batcher publishes its data. On a Regulated
///         Layer One with immediate finality, that record is final on inclusion.
contract SettlementAnchor {
    struct Record {
        uint64 l2Block;
        bytes32 l2BlockHash;
        bytes32 ref;
        uint64 anchoredAt;
    }

    address public immutable operator;
    uint256 public immutable l2ChainId;
    mapping(bytes32 => Record) public records; // L2 tx hash -> record

    event Anchored(bytes32 indexed l2TxHash, uint256 indexed l2Block, bytes32 l2BlockHash, bytes32 indexed ref);

    error NotOperator();
    error AlreadyAnchored(bytes32 l2TxHash);

    constructor(address operator_, uint256 l2ChainId_) {
        operator = operator_;
        l2ChainId = l2ChainId_;
    }

    function anchor(bytes32 l2TxHash, uint64 l2Block, bytes32 l2BlockHash, bytes32 ref) external {
        if (msg.sender != operator) revert NotOperator();
        if (records[l2TxHash].anchoredAt != 0) revert AlreadyAnchored(l2TxHash);
        records[l2TxHash] = Record(l2Block, l2BlockHash, ref, uint64(block.timestamp));
        emit Anchored(l2TxHash, l2Block, l2BlockHash, ref);
    }
}
