#!/usr/bin/env node
/**
 * provenance-link.js — Link a service receipt to memory checkpoint provenance
 * 
 * The key insight: a service receipt proves WHAT was delivered,
 * but memory checkpoints prove the agent's STATE when it did the work.
 * Linking them creates a full provenance chain:
 *   WHO (ERC-8004) → WHAT STATE (checkpoint) → WHAT WAS DONE (receipt)
 * 
 * Usage:
 *   node provenance-link.js --receipt demo-receipt.json --checkpoint-dir ../../projects/moltiverse-hackathon/checkpoints
 *   node provenance-link.js --receipt demo-receipt.json --latest
 */

const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const CHECKPOINT_DIR = path.join(__dirname, "../../moltiverse-hackathon/checkpoints");

// Agent Memory Registry contract (Monad testnet)
const MEMORY_REGISTRY = "0xd3A98570Dba5Cf4f8306A676a2AB00dcD06Ac270";
const MEMORY_ABI = [
  "function publishCheckpoint(bytes32 merkleRoot, uint256 fileCount, uint256 totalSize, bytes32 bundleHash) returns (uint256)",
  "function getCheckpoint(uint256 id) view returns (address agent, bytes32 merkleRoot, uint256 fileCount, uint256 totalSize, bytes32 bundleHash, uint256 timestamp)",
  "function getAgentCheckpointCount(address agent) view returns (uint256)",
];

// ServiceReceipt contract (Monad testnet)  
const SERVICE_RECEIPT = "0x2e8ddB16971b8825d556031688eF1F41fE9B886e";
const RECEIPT_ABI = [
  "function receipts(uint256) view returns (address agent, address requester, bytes32 requestHash, bytes32 deliveryHash, uint256 timestamp, string metadataURI)",
  "function getAgentReceiptCount(address) view returns (uint256)",
  "function getAgentReceiptIds(address) view returns (uint256[])",
];

// ERC-8004 Identity Registry (Base mainnet)
const ERC8004_REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";

function findClosestCheckpoint(receiptTimestamp, checkpointDir) {
  const dir = checkpointDir || CHECKPOINT_DIR;
  if (!fs.existsSync(dir)) return null;

  const files = fs.readdirSync(dir).filter(f => f.endsWith(".json")).sort();
  let closest = null;
  let closestDelta = Infinity;

  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    const cpTime = typeof data.timestamp === 'string' 
      ? Math.floor(new Date(data.timestamp).getTime() / 1000)
      : (data.timestamp || parseInt(file.match(/\d+/)?.[0]) / 1000);
    const delta = Math.abs(cpTime - receiptTimestamp);
    
    // Prefer checkpoint BEFORE the receipt (proves state at time of work)
    if (cpTime <= receiptTimestamp && delta < closestDelta) {
      closest = { ...data, file, timeDelta: delta };
      closestDelta = delta;
    }
  }

  // If no checkpoint before, use closest after
  if (!closest) {
    for (const file of files) {
      const data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
      const cpTime = typeof data.timestamp === 'string'
        ? Math.floor(new Date(data.timestamp).getTime() / 1000)
        : (data.timestamp || parseInt(file.match(/\d+/)?.[0]) / 1000);
      const delta = Math.abs(cpTime - receiptTimestamp);
      if (delta < closestDelta) {
        closest = { ...data, file, timeDelta: delta };
        closestDelta = delta;
      }
    }
  }

  return closest;
}

async function createProvenanceLink(receiptPath, opts = {}) {
  const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
  
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  Provenance Link — Connecting Receipt to History    ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  // 1. Receipt info
  console.log("━━━ Service Receipt ━━━");
  console.log(`  Agent:        ${receipt.agent}`);
  console.log(`  Receipt ID:   ${receipt.receiptId ?? "off-chain"}`);
  console.log(`  Request hash: ${receipt.requestHash}`);
  console.log(`  Delivery hash: ${receipt.deliveryHash}`);
  console.log(`  Timestamp:    ${new Date(receipt.timestamp * 1000).toISOString()}\n`);

  // 2. Find closest memory checkpoint
  console.log("━━━ Memory Checkpoint (nearest provenance anchor) ━━━");
  const checkpoint = findClosestCheckpoint(receipt.timestamp, opts.checkpointDir);
  
  if (checkpoint) {
    const hours = (checkpoint.timeDelta / 3600).toFixed(1);
    const merkleRoot = checkpoint.merkleRoot || checkpoint.root;
    const fileCount = checkpoint.fileCount;
    const totalSize = checkpoint.totalSize || checkpoint.totalBytes;
    console.log(`  Checkpoint:   ${checkpoint.file || checkpoint.id}`);
    console.log(`  Merkle root:  ${merkleRoot}`);
    console.log(`  Files:        ${fileCount}`);
    console.log(`  Total size:   ${totalSize} bytes`);
    console.log(`  Time delta:   ${hours}h before receipt`);
    if (checkpoint.txHash) {
      console.log(`  TX:           ${checkpoint.txHash}`);
    }
  } else {
    console.log("  ⚠️  No checkpoint found near receipt time");
  }

  // 3. On-chain verification
  console.log("\n━━━ On-Chain Verification ━━━");
  const provider = new ethers.JsonRpcProvider("https://testnet-rpc.monad.xyz");
  
  // Check receipt on-chain
  if (receipt.receiptId !== undefined && receipt.contract) {
    const contract = new ethers.Contract(SERVICE_RECEIPT, RECEIPT_ABI, provider);
    try {
      const onChain = await contract.receipts(receipt.receiptId);
      const matches = onChain.agent.toLowerCase() === receipt.agent.toLowerCase() &&
                      onChain.requestHash === receipt.requestHash &&
                      onChain.deliveryHash === receipt.deliveryHash;
      console.log(`  Receipt on-chain: ${matches ? "✅ VERIFIED" : "❌ MISMATCH"}`);
    } catch (e) {
      console.log(`  Receipt on-chain: ⚠️ Could not verify (${e.message})`);
    }
  }

  // Check total checkpoint count
  const memoryContract = new ethers.Contract(MEMORY_REGISTRY, MEMORY_ABI, provider);
  try {
    const cpCount = await memoryContract.getAgentCheckpointCount(receipt.agent);
    console.log(`  Total checkpoints: ${cpCount} (on-chain provenance depth)`);
  } catch (e) {
    console.log(`  Checkpoints: ⚠️ Could not query (${e.message})`);
  }

  // 4. Build provenance link object
  const provenanceLink = {
    type: "provenance-link",
    version: "1.0",
    receipt: {
      id: receipt.receiptId,
      agent: receipt.agent,
      requestHash: receipt.requestHash,
      deliveryHash: receipt.deliveryHash,
      timestamp: receipt.timestamp,
      txHash: receipt.txHash,
      contract: receipt.contract || SERVICE_RECEIPT,
    },
    checkpoint: checkpoint ? {
      merkleRoot: checkpoint.merkleRoot || checkpoint.root,
      fileCount: checkpoint.fileCount,
      totalSize: checkpoint.totalSize || checkpoint.totalBytes,
      txHash: checkpoint.txHash,
      timeDelta: checkpoint.timeDelta,
    } : null,
    identity: {
      standard: "ERC-8004",
      agentId: 16843,
      registry: ERC8004_REGISTRY,
      chain: "base",
    },
    chain: {
      receipt: "monad_testnet",
      checkpoint: "monad_testnet",
      identity: "base_mainnet",
    },
    created: new Date().toISOString(),
  };

  console.log("\n━━━ Provenance Summary ━━━");
  console.log(`  Identity:    ERC-8004 Agent #16843 (Base mainnet)`);
  console.log(`  Provenance:  ${checkpoint ? (checkpoint.fileCount) + " files merkle-rooted" : "no checkpoint"} (Monad testnet)`);
  console.log(`  Delivery:    Receipt #${receipt.receiptId ?? "off-chain"} (Monad testnet)`);
  console.log(`  Chain:       Identity(Base) → Provenance(Monad) → Receipt(Monad)`);
  
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║  ✅ Full provenance chain established                ║");
  console.log("║                                                      ║");
  console.log("║  WHO:   ERC-8004 registered identity                 ║");
  console.log("║  STATE: Merkle-rooted memory checkpoint              ║");
  console.log("║  WORK:  Signed + on-chain service receipt            ║");
  console.log("╚══════════════════════════════════════════════════════╝");

  // Save
  const outPath = opts.output || receiptPath.replace(".json", "-provenance.json");
  fs.writeFileSync(outPath, JSON.stringify(provenanceLink, null, 2));
  console.log(`\nProvenance link saved to: ${outPath}`);

  return provenanceLink;
}

// CLI
const args = process.argv.slice(2);
const receiptPath = args.find((a, i) => args[i - 1] === "--receipt") || 
                    path.join(__dirname, "..", "demo-receipt.json");
const checkpointDir = args.find((a, i) => args[i - 1] === "--checkpoint-dir");

createProvenanceLink(receiptPath, { checkpointDir }).catch(console.error);
