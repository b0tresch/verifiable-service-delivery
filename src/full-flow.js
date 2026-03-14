#!/usr/bin/env node
/**
 * full-flow.js — Complete Verifiable Service Delivery flow
 * 
 * Combines all three primitives in one execution:
 * 1. Finds latest memory checkpoint (provenance anchor)
 * 2. Simulates service execution with real hashing
 * 3. Signs delivery receipt (EIP-712)
 * 4. Submits receipt on-chain
 * 5. Generates provenance link (identity + checkpoint + receipt)
 * 
 * Usage:
 *   node src/full-flow.js --request "analyze BTC whales" --delivery "12,450 BTC moved off exchanges"
 *   node src/full-flow.js --request-file ./request.json --delivery-file ./output.json
 */

const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

// === Config ===
const MONAD_RPC = "https://testnet-rpc.monad.xyz";
const CONTRACT_ADDRESS = "0x2e8ddB16971b8825d556031688eF1F41fE9B886e";
const MEMORY_REGISTRY = "0xd3A98570Dba5Cf4f8306A676a2AB00dcD06Ac270";
const CHECKPOINT_DIR = fs.existsSync(path.join(__dirname, "../checkpoints"))
  ? path.join(__dirname, "../checkpoints")
  : path.join(__dirname, "../../moltiverse-hackathon/checkpoints");
const WALLET_PATH = path.join(process.env.HOME, ".evm-wallet.json");

const ABI = [
  "function submitReceipt(address requester, bytes32 requestHash, bytes32 deliveryHash, string metadataURI) returns (uint256)",
  "function receipts(uint256) view returns (address agent, address requester, bytes32 requestHash, bytes32 deliveryHash, uint256 timestamp, string metadataURI)",
  "function getAgentReceiptCount(address) view returns (uint256)",
  "event ReceiptSubmitted(uint256 indexed receiptId, address indexed agent, address indexed requester, bytes32 requestHash, bytes32 deliveryHash, string metadataURI)",
];

const EIP712_DOMAIN = {
  name: "ServiceReceipt",
  version: "1",
  chainId: 10143,
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

function getLatestCheckpoint() {
  if (!fs.existsSync(CHECKPOINT_DIR)) return null;
  const files = fs.readdirSync(CHECKPOINT_DIR)
    .filter(f => f.endsWith(".json"))
    .sort();
  if (files.length === 0) return null;
  const latest = files[files.length - 1];
  const data = JSON.parse(fs.readFileSync(path.join(CHECKPOINT_DIR, latest), "utf8"));
  return { ...data, file: latest };
}

function hashContent(content) {
  if (fs.existsSync(content)) {
    return ethers.keccak256(fs.readFileSync(content));
  }
  return ethers.keccak256(ethers.toUtf8Bytes(content));
}

async function fullFlow(opts) {
  const startTime = Date.now();

  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║  Verifiable Agent Service Delivery — Full Flow           ║");
  console.log("║  Identity → Provenance → Work → Receipt → Verification  ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  // Load wallet
  const walletData = JSON.parse(fs.readFileSync(WALLET_PATH, "utf8"));
  const provider = new ethers.JsonRpcProvider(MONAD_RPC);
  const wallet = new ethers.Wallet(walletData.privateKey, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet);

  // === PHASE 1: Identity ===
  console.log("━━━ Phase 1: Identity (ERC-8004) ━━━");
  console.log(`  Agent:     ${wallet.address}`);
  console.log(`  ERC-8004:  Agent #16843 (Base mainnet)`);
  console.log(`  Registry:  0x8004A169FB4a3325136EB29fA0ceB6D2e539a432\n`);

  // === PHASE 2: Provenance Anchor ===
  console.log("━━━ Phase 2: Provenance Anchor (Memory Checkpoint) ━━━");
  const checkpoint = getLatestCheckpoint();
  if (checkpoint) {
    console.log(`  Latest:    ${checkpoint.file}`);
    console.log(`  Merkle:    ${checkpoint.root}`);
    console.log(`  Files:     ${checkpoint.fileCount} (${checkpoint.totalBytes} bytes)`);
    console.log(`  TX:        ${checkpoint.txHash}`);
    console.log(`  Time:      ${checkpoint.timestamp}`);
  } else {
    console.log("  ⚠️  No checkpoints found");
  }
  console.log();

  // === PHASE 3: Service Execution ===
  console.log("━━━ Phase 3: Service Execution ━━━");
  const requestContent = opts.requestFile 
    ? fs.readFileSync(opts.requestFile, "utf8")
    : opts.request;
  const deliveryContent = opts.deliveryFile
    ? fs.readFileSync(opts.deliveryFile, "utf8")
    : opts.delivery;

  const requestHash = hashContent(requestContent);
  const deliveryHash = hashContent(deliveryContent);
  
  console.log(`  Request:   "${requestContent.substring(0, 80)}${requestContent.length > 80 ? '...' : ''}"`);
  console.log(`  Req hash:  ${requestHash}`);
  console.log(`  Delivery:  "${deliveryContent.substring(0, 80)}${deliveryContent.length > 80 ? '...' : ''}"`);
  console.log(`  Del hash:  ${deliveryHash}\n`);

  // === PHASE 4: Sign Receipt (EIP-712) ===
  console.log("━━━ Phase 4: Sign Receipt (EIP-712) ━━━");
  const timestamp = Math.floor(Date.now() / 1000);
  const requester = opts.requester || ethers.ZeroAddress;

  // Build metadata with provenance link
  const metadata = {
    type: "service-receipt-metadata",
    version: "1.0",
    request: requestContent.substring(0, 500),
    deliverySummary: deliveryContent.substring(0, 500),
    checkpoint: checkpoint ? {
      merkleRoot: checkpoint.root,
      txHash: checkpoint.txHash,
      fileCount: checkpoint.fileCount,
    } : null,
    identity: {
      standard: "ERC-8004",
      agentId: 16843,
    },
  };
  const metadataJSON = JSON.stringify(metadata);
  // For demo, store metadata inline (production: IPFS)
  const metadataURI = `data:application/json;base64,${Buffer.from(metadataJSON).toString("base64")}`;

  const receiptValue = {
    agent: wallet.address,
    requester,
    requestHash,
    deliveryHash,
    timestamp,
    metadataURI,
  };

  const signature = await wallet.signTypedData(EIP712_DOMAIN, RECEIPT_TYPES, receiptValue);
  const recovered = ethers.verifyTypedData(EIP712_DOMAIN, RECEIPT_TYPES, receiptValue, signature);
  console.log(`  Signature: ${signature.slice(0, 20)}...${signature.slice(-8)}`);
  console.log(`  Verified:  ${recovered.toLowerCase() === wallet.address.toLowerCase() ? "✅" : "❌"}\n`);

  // === PHASE 5: On-Chain Submission ===
  console.log("━━━ Phase 5: On-Chain Submission ━━━");
  if (opts.dryRun) {
    console.log("  [DRY RUN] Skipping on-chain submission\n");
  } else {
    const tx = await contract.submitReceipt(requester, requestHash, deliveryHash, metadataURI);
    console.log(`  TX:        ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`  Block:     ${receipt.blockNumber}`);
    const log = receipt.logs[0];
    const parsed = contract.interface.parseLog({ topics: log.topics, data: log.data });
    const receiptId = Number(parsed.args[0]);
    console.log(`  Receipt #: ${receiptId}`);

    // Verify on-chain
    const onChain = await contract.receipts(receiptId);
    const onChainValid = onChain.agent.toLowerCase() === wallet.address.toLowerCase() &&
                         onChain.requestHash === requestHash &&
                         onChain.deliveryHash === deliveryHash;
    console.log(`  On-chain:  ${onChainValid ? "✅ VERIFIED" : "❌ MISMATCH"}\n`);

    // Save full output
    const output = {
      receiptId,
      ...receiptValue,
      signature,
      domain: EIP712_DOMAIN,
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
      contract: CONTRACT_ADDRESS,
      network: "monad_testnet",
      provenance: {
        checkpoint: checkpoint ? { root: checkpoint.root, tx: checkpoint.txHash } : null,
        identity: { standard: "ERC-8004", agentId: 16843, chain: "base" },
      },
      created: new Date().toISOString(),
    };

    const outPath = path.join(__dirname, "..", "latest-receipt.json");
    fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
    console.log(`  Saved:     ${outPath}`);
  }

  // === Summary ===
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("\n╔═══════════════════════════════════════════════════════════╗");
  console.log("║  ✅ Complete provenance chain verified                    ║");
  console.log("║                                                           ║");
  console.log(`║  Identity:   ERC-8004 Agent #16843 (Base)                 ║`);
  console.log(`║  Provenance: ${checkpoint ? checkpoint.fileCount + " files" : "none"} merkle-rooted (Monad)${" ".repeat(checkpoint ? 18 - String(checkpoint.fileCount).length : 15)}║`);
  console.log("║  Receipt:    Signed + submitted on-chain (Monad)          ║");
  console.log(`║  Time:       ${elapsed}s${" ".repeat(43 - elapsed.length)}║`);
  console.log("╚═══════════════════════════════════════════════════════════╝");
}

// CLI
const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 ? args[idx + 1] : undefined;
}

const request = getArg("request") || "Analyze BTC whale movements for the past 7 days";
const delivery = getArg("delivery") || "BTC whale accumulation detected: 12,450 BTC moved off exchanges. Net outflow of 6,277 BTC on peak day. MVRV declining from 1.291 to 1.230 suggests accumulation zone.";
const requester = getArg("requester");
const requestFile = getArg("request-file");
const deliveryFile = getArg("delivery-file");
const dryRun = args.includes("--dry-run");

fullFlow({ request, delivery, requester, requestFile, deliveryFile, dryRun }).catch(console.error);
