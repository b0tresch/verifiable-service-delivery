// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ServiceReceipt
 * @notice On-chain registry of signed service delivery receipts for autonomous agents.
 * @dev Agents submit receipts proving work was done. Anyone can verify.
 *      Designed to complement ERC-8004 identity and memory checkpoints.
 */
contract ServiceReceipt {
    struct Receipt {
        address agent;          // Agent that performed the work
        address requester;      // Who requested the service
        bytes32 requestHash;    // Hash of the original request
        bytes32 deliveryHash;   // Hash of the delivered output
        uint256 timestamp;      // When receipt was submitted
        string metadataURI;     // IPFS/HTTP link to full receipt details
    }

    /// @notice All receipts, indexed by receipt ID
    mapping(uint256 => Receipt) public receipts;
    
    /// @notice Receipt count (also next receipt ID)
    uint256 public receiptCount;

    /// @notice Receipts by agent address
    mapping(address => uint256[]) public agentReceipts;
    
    /// @notice Receipts by requester address
    mapping(address => uint256[]) public requesterReceipts;

    event ReceiptSubmitted(
        uint256 indexed receiptId,
        address indexed agent,
        address indexed requester,
        bytes32 requestHash,
        bytes32 deliveryHash,
        string metadataURI
    );

    /**
     * @notice Submit a service delivery receipt
     * @param requester Address of the service requester
     * @param requestHash Keccak256 of the original service request
     * @param deliveryHash Keccak256 of the delivered output
     * @param metadataURI Link to detailed receipt (IPFS preferred)
     * @return receiptId The ID of the newly created receipt
     */
    function submitReceipt(
        address requester,
        bytes32 requestHash,
        bytes32 deliveryHash,
        string calldata metadataURI
    ) external returns (uint256 receiptId) {
        receiptId = receiptCount++;
        
        receipts[receiptId] = Receipt({
            agent: msg.sender,
            requester: requester,
            requestHash: requestHash,
            deliveryHash: deliveryHash,
            timestamp: block.timestamp,
            metadataURI: metadataURI
        });

        agentReceipts[msg.sender].push(receiptId);
        requesterReceipts[requester].push(receiptId);

        emit ReceiptSubmitted(
            receiptId,
            msg.sender,
            requester,
            requestHash,
            deliveryHash,
            metadataURI
        );
    }

    /**
     * @notice Get all receipt IDs for an agent
     */
    function getAgentReceiptIds(address agent) external view returns (uint256[] memory) {
        return agentReceipts[agent];
    }

    /**
     * @notice Get all receipt IDs for a requester
     */
    function getRequesterReceiptIds(address requester) external view returns (uint256[] memory) {
        return requesterReceipts[requester];
    }

    /**
     * @notice Get receipt count for an agent (reputation signal)
     */
    function getAgentReceiptCount(address agent) external view returns (uint256) {
        return agentReceipts[agent].length;
    }
}
