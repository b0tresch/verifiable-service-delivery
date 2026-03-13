#!/usr/bin/env node
/**
 * demo.js — End-to-end demo of Verifiable Agent Service Delivery
 * 
 * Flow: Request → Work → Sign Receipt → Submit On-Chain → Verify
 * 
 * Usage: PRIVATE_KEY=0x... node scripts/demo.js
 */

const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Config
const MONAD_RPC = "https://testnet-rpc.monad.xyz";
const CONTRACT_ADDRESS = "0x2e8ddB16971b8825d556031688eF1F41fE9B886e";
const ABI = [
  "function submitReceipt(address requester, bytes32 requestHash, bytes32 deliveryHash, string metadataURI) returns (uint256)",
  "function receipts(uint256) view returns (address agent, address requester, bytes32 requestHash, bytes32 deliveryHash, uint256 timestamp, string metadataURI)",
  "function getAgentReceiptCount(address) view returns (uint256)",
  "function getAgentReceiptIds(address) view returns (uint256[])",
  "event ReceiptSubmitted(uint256 indexed receiptId, address indexed agent, address indexed requester, bytes32 requestHash, bytes32 deliveryHash, string metadataURI)"
];

// EIP-712 types for off-chain signature
const DOMAIN = {
  name: "ServiceReceipt",
  version: "1",
  chainId: 10143, // Monad testnet
};

const RECEIPT_TYPES = {
  Receipt: [
    { name: "agent", type: "address" },
    { name: "requester", type: "address" },
    { name: "requestHash", type: "bytes32" },
    { name: "deliveryHash", type: "bytes32" },
    { name: "timestamp", type: "uint256" },
    { name: "metadataURI", type: "string" },
  ],
};

async function main() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  Verifiable Agent Service Delivery — Live Demo      ║");
  console.log("║  The Synthesis Hackathon 2026                       ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  // Load wallet
  const walletPath = path.join(process.env.HOME, ".evm-wallet.json");
  const walletData = JSON.parse(fs.readFileSync(walletPath, "utf8"));
  const provider = new ethers.JsonRpcProvider(MONAD_RPC);
  const wallet = new ethers.Wallet(walletData.privateKey, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet);

  console.log(`Agent: ${wallet.address}`);
  console.log(`Network: Monad Testnet (chainId: 10143)`);
  console.log(`Contract: ${CONTRACT_ADDRESS}\n`);

  // === STEP 1: Service Request ===
  console.log("━━━ Step 1: Service Request ━━━");
  const serviceRequest = {
    type: "on-chain-analysis",
    description: "Analyze BTC whale movements for the past 7 days",
    requester: "0x0000000000000000000000000000000000000001", // Demo requester
    timestamp: Math.floor(Date.now() / 1000),
  };
  const requestHash = ethers.keccak256(
    ethers.toUtf8Bytes(JSON.stringify(serviceRequest))
  );
  console.log(`Request: "${serviceRequest.description}"`);
  console.log(`Request hash: ${requestHash}\n`);

  // === STEP 2: Work Execution ===
  console.log("━━━ Step 2: Work Execution ━━━");
  const deliveryOutput = {
    analysis: "BTC whale accumulation detected: 12,450 BTC moved off exchanges in past 7 days",
    dataPoints: 168,
    confidence: 0.87,
    timestamp: Math.floor(Date.now() / 1000),
    agent: wallet.address,
  };
  const deliveryHash = ethers.keccak256(
    ethers.toUtf8Bytes(JSON.stringify(deliveryOutput))
  );
  console.log(`Delivery: "${deliveryOutput.analysis}"`);
  console.log(`Delivery hash: ${deliveryHash}\n`);

  // === STEP 3: Sign Receipt (EIP-712) ===
  console.log("━━━ Step 3: Sign Receipt (EIP-712) ━━━");
  const receiptData = {
    agent: wallet.address,
    requester: serviceRequest.requester,
    requestHash,
    deliveryHash,
    timestamp: Math.floor(Date.now() / 1000),
    metadataURI: "",
  };

  const signature = await wallet.signTypedData(DOMAIN, RECEIPT_TYPES, receiptData);
  console.log(`Signature: ${signature.slice(0, 20)}...${signature.slice(-8)}`);

  // Verify locally
  const recovered = ethers.verifyTypedData(DOMAIN, RECEIPT_TYPES, receiptData, signature);
  console.log(`Verified signer: ${recovered}`);
  console.log(`Matches agent: ${recovered.toLowerCase() === wallet.address.toLowerCase() ? "✅ YES" : "❌ NO"}\n`);

  // === STEP 4: Submit On-Chain ===
  console.log("━━━ Step 4: Submit On-Chain ━━━");
  const tx = await contract.submitReceipt(
    serviceRequest.requester,
    requestHash,
    deliveryHash,
    ""
  );
  console.log(`TX submitted: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`TX confirmed in block: ${receipt.blockNumber}`);

  // Parse event
  const log = receipt.logs[0];
  const parsed = contract.interface.parseLog({ topics: log.topics, data: log.data });
  const receiptId = parsed.args[0];
  console.log(`Receipt ID: ${receiptId}\n`);

  // === STEP 5: Verify On-Chain ===
  console.log("━━━ Step 5: Verify On-Chain ━━━");
  const onChain = await contract.receipts(receiptId);
  console.log(`On-chain agent: ${onChain.agent}`);
  console.log(`On-chain requester: ${onChain.requester}`);
  console.log(`On-chain request hash: ${onChain.requestHash}`);
  console.log(`On-chain delivery hash: ${onChain.deliveryHash}`);
  console.log(`On-chain timestamp: ${new Date(Number(onChain.timestamp) * 1000).toISOString()}`);

  const totalReceipts = await contract.getAgentReceiptCount(wallet.address);
  console.log(`\nAgent's total receipts: ${totalReceipts}`);

  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║  ✅ Service delivery verified end-to-end!            ║");
  console.log("║                                                      ║");
  console.log("║  The agent proved:                                   ║");
  console.log("║  1. WHO it is (wallet address, ERC-8004 #16843)      ║");
  console.log("║  2. WHAT was requested (request hash on-chain)       ║");
  console.log("║  3. WHAT was delivered (delivery hash on-chain)      ║");
  console.log("║  4. WHEN it happened (block timestamp)               ║");
  console.log("║  5. Signature validity (EIP-712 typed data)          ║");
  console.log("╚══════════════════════════════════════════════════════╝");

  // Save receipt JSON
  const fullReceipt = {
    receiptId: Number(receiptId),
    ...receiptData,
    signature,
    txHash: tx.hash,
    blockNumber: receipt.blockNumber,
    contract: CONTRACT_ADDRESS,
    network: "monad_testnet",
    chainId: 10143,
  };
  const outPath = path.join(__dirname, "..", "demo-receipt.json");
  fs.writeFileSync(outPath, JSON.stringify(fullReceipt, null, 2));
  console.log(`\nFull receipt saved to: ${outPath}`);
}

main().catch((err) => {
  console.error("Demo failed:", err.message);
  process.exit(1);
});
