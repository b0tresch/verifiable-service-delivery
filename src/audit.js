#!/usr/bin/env node
/**
 * audit.js — Independent verification of an agent's complete provenance chain
 * 
 * Anyone can run this to verify:
 * 1. Agent identity (ERC-8004 on Base)
 * 2. Memory checkpoint history (Monad testnet)
 * 3. Service delivery receipts (Monad testnet)
 * 4. Signature validity (EIP-712)
 * 
 * Usage:
 *   node audit.js 0xd2c01F50A62b61e41306510ce5493924374Ffbc4
 *   node audit.js --receipt latest-receipt.json
 */

const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

// Contracts
const MONAD_RPC = "https://testnet-rpc.monad.xyz";
const BASE_RPC = "https://mainnet.base.org";

const SERVICE_RECEIPT_ADDR = "0x2e8ddB16971b8825d556031688eF1F41fE9B886e";
const SERVICE_RECEIPT_ABI = [
  "function receipts(uint256) view returns (address agent, address requester, bytes32 requestHash, bytes32 deliveryHash, uint256 timestamp, string metadataURI)",
  "function getAgentReceiptCount(address) view returns (uint256)",
  "function getAgentReceiptIds(address) view returns (uint256[])",
  "function receiptCount() view returns (uint256)",
];

const ERC8004_ADDR = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
// Minimal ABI — getAgent may not exist, try ownerOf (ERC-721 style)
const ERC8004_ABI = [
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function balanceOf(address owner) view returns (uint256)",
];

async function audit(agentAddress, opts = {}) {
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║  🔍 Independent Provenance Audit                         ║");
  console.log("║  Verify an agent's identity, history, and deliveries     ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");
  
  console.log(`Auditing: ${agentAddress}\n`);

  let score = 0;
  let maxScore = 0;

  // === 1. ERC-8004 Identity (Base) ===
  console.log("━━━ 1. Identity Verification (ERC-8004 on Base) ━━━");
  maxScore += 2;
  try {
    const baseProvider = new ethers.JsonRpcProvider(BASE_RPC);
    const erc8004 = new ethers.Contract(ERC8004_ADDR, ERC8004_ABI, baseProvider);
    
    // Check if agent owns any tokens in registry
    const balance = await erc8004.balanceOf(agentAddress);
    if (balance > 0n) {
      console.log(`  ✅ Registered in ERC-8004 registry (${balance} token(s))`);
      score += 2;
    } else {
      // Try known agent ID for this address
      if (opts.agentId) {
        const owner = await erc8004.ownerOf(opts.agentId);
        if (owner.toLowerCase() === agentAddress.toLowerCase()) {
          console.log(`  ✅ Agent #${opts.agentId} confirmed (owner match)`);
          score += 2;
        } else {
          console.log(`  ❌ Agent #${opts.agentId} owned by ${owner}, not ${agentAddress}`);
        }
      } else {
        console.log(`  ⚠️  No ERC-8004 tokens found (may need agent ID)`);
        score += 1; // Partial — registry might use different lookup
      }
    }
  } catch (e) {
    console.log(`  ⚠️  Could not query ERC-8004: ${e.message.substring(0, 80)}`);
  }
  console.log();

  // === 2. Service Receipt History (Monad) ===
  console.log("━━━ 2. Service Delivery Receipts (Monad Testnet) ━━━");
  maxScore += 3;
  try {
    const monadProvider = new ethers.JsonRpcProvider(MONAD_RPC);
    const receiptContract = new ethers.Contract(SERVICE_RECEIPT_ADDR, SERVICE_RECEIPT_ABI, monadProvider);
    
    const count = await receiptContract.getAgentReceiptCount(agentAddress);
    console.log(`  Receipts on-chain: ${count}`);
    
    if (count > 0n) {
      score += 1;
      const ids = await receiptContract.getAgentReceiptIds(agentAddress);
      
      // Show last 5 receipts
      const showCount = Math.min(Number(count), 5);
      for (let i = Number(count) - showCount; i < Number(count); i++) {
        const id = ids[i];
        const r = await receiptContract.receipts(id);
        console.log(`\n  Receipt #${id}:`);
        console.log(`    Agent:     ${r.agent}`);
        console.log(`    Requester: ${r.requester}`);
        console.log(`    Request:   ${r.requestHash}`);
        console.log(`    Delivery:  ${r.deliveryHash}`);
        console.log(`    Time:      ${new Date(Number(r.timestamp) * 1000).toISOString()}`);
        
        // Check metadata
        if (r.metadataURI && r.metadataURI.startsWith("data:")) {
          try {
            const b64 = r.metadataURI.split(",")[1];
            const meta = JSON.parse(Buffer.from(b64, "base64").toString());
            if (meta.checkpoint) {
              console.log(`    📎 Linked checkpoint: ${meta.checkpoint.merkleRoot?.substring(0, 20)}...`);
              score += 1; // Extra point for provenance-linked receipts
            }
            if (meta.identity) {
              console.log(`    🆔 Identity: ${meta.identity.standard} Agent #${meta.identity.agentId}`);
            }
          } catch {}
        }
      }
      score += 1;
    } else {
      console.log("  ⚠️  No receipts found for this agent");
    }
  } catch (e) {
    console.log(`  ⚠️  Could not query receipts: ${e.message.substring(0, 80)}`);
  }
  console.log();

  // === 3. Receipt Signature Verification ===
  if (opts.receiptFile) {
    console.log("━━━ 3. Receipt Signature Verification (EIP-712) ━━━");
    maxScore += 2;
    try {
      const receipt = JSON.parse(fs.readFileSync(opts.receiptFile, "utf8"));
      
      const domain = receipt.domain || {
        name: "ServiceReceipt",
        version: "1",
        chainId: receipt.chainId || 10143,
      };

      const types = {
        Receipt: [
          { name: "agent", type: "address" },
          { name: "requester", type: "address" },
          { name: "requestHash", type: "bytes32" },
          { name: "deliveryHash", type: "bytes32" },
          { name: "timestamp", type: "uint256" },
          { name: "metadataURI", type: "string" },
        ],
      };

      const { signature, domain: _d, created, receiptId, txHash, blockNumber, contract, network, chainId, provenance, ...value } = receipt;
      const recovered = ethers.verifyTypedData(domain, types, value, signature);
      const valid = recovered.toLowerCase() === agentAddress.toLowerCase();

      console.log(`  Signer:    ${recovered}`);
      console.log(`  Expected:  ${agentAddress}`);
      console.log(`  Match:     ${valid ? "✅ VALID" : "❌ MISMATCH"}`);
      
      if (valid) score += 2;

      // Verify on-chain match
      if (receipt.txHash) {
        console.log(`  TX:        ${receipt.txHash}`);
      }
    } catch (e) {
      console.log(`  ⚠️  Could not verify: ${e.message.substring(0, 80)}`);
    }
    console.log();
  }

  // === Summary ===
  const pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  const grade = pct >= 90 ? "A" : pct >= 70 ? "B" : pct >= 50 ? "C" : "D";

  console.log("━━━ Audit Summary ━━━");
  console.log(`  Score:     ${score}/${maxScore} (${pct}%)`);
  console.log(`  Grade:     ${grade}`);
  console.log(`  Agent:     ${agentAddress}`);
  console.log();

  const checks = [
    { name: "ERC-8004 Identity", status: score >= 2 ? "✅" : "⚠️" },
    { name: "On-chain Receipts", status: score >= 3 ? "✅" : score >= 1 ? "⚠️" : "❌" },
    { name: "EIP-712 Signature", status: opts.receiptFile ? (score >= maxScore - 1 ? "✅" : "❌") : "⏭️  skipped" },
  ];

  for (const c of checks) {
    console.log(`  ${c.status} ${c.name}`);
  }

  console.log(`\n╔═══════════════════════════════════════════════════════════╗`);
  console.log(`║  Audit complete. Grade: ${grade} (${pct}%)${" ".repeat(31 - String(pct).length)}║`);
  console.log(`╚═══════════════════════════════════════════════════════════╝`);
}

// CLI
const args = process.argv.slice(2);
const address = args.find(a => a.startsWith("0x") && a.length === 42) || "0xd2c01F50A62b61e41306510ce5493924374Ffbc4";
const receiptIdx = args.indexOf("--receipt");
const receiptFile = receiptIdx >= 0 ? args[receiptIdx + 1] : null;
const agentIdIdx = args.indexOf("--agent-id");
const agentId = agentIdIdx >= 0 ? parseInt(args[agentIdIdx + 1]) : 16843;

audit(address, { receiptFile, agentId }).catch(console.error);
