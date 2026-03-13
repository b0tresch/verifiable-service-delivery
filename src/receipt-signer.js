#!/usr/bin/env node
/**
 * receipt-signer.js — Create signed service delivery receipts
 * 
 * Usage:
 *   node receipt-signer.js --request "analyze BTC whale movements" \
 *     --delivery /path/to/output.json \
 *     --requester 0x1234... \
 *     --metadata-uri ipfs://Qm...
 */

const { ethers } = require('ethers');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Load wallet
const WALLET_PATH = path.join(process.env.HOME, '.evm-wallet.json');

function loadWallet() {
  const data = JSON.parse(fs.readFileSync(WALLET_PATH, 'utf8'));
  return new ethers.Wallet(data.privateKey);
}

function hashContent(content) {
  if (fs.existsSync(content)) {
    const buf = fs.readFileSync(content);
    return ethers.keccak256(buf);
  }
  return ethers.keccak256(ethers.toUtf8Bytes(content));
}

async function createReceipt(opts) {
  const wallet = loadWallet();
  
  const requestHash = hashContent(opts.request);
  const deliveryHash = hashContent(opts.delivery);
  const timestamp = Math.floor(Date.now() / 1000);

  // EIP-712 typed data for the receipt
  const domain = {
    name: 'ServiceReceipt',
    version: '1',
    chainId: opts.chainId || 84532, // Base Sepolia default
  };

  const types = {
    Receipt: [
      { name: 'agent', type: 'address' },
      { name: 'requester', type: 'address' },
      { name: 'requestHash', type: 'bytes32' },
      { name: 'deliveryHash', type: 'bytes32' },
      { name: 'timestamp', type: 'uint256' },
      { name: 'metadataURI', type: 'string' },
    ],
  };

  const value = {
    agent: wallet.address,
    requester: opts.requester || ethers.ZeroAddress,
    requestHash,
    deliveryHash,
    timestamp,
    metadataURI: opts.metadataURI || '',
  };

  const signature = await wallet.signTypedData(domain, types, value);

  const receipt = {
    ...value,
    signature,
    domain,
    created: new Date(timestamp * 1000).toISOString(),
  };

  return receipt;
}

async function verifyReceipt(receiptJson) {
  const receipt = typeof receiptJson === 'string' 
    ? JSON.parse(fs.readFileSync(receiptJson, 'utf8'))
    : receiptJson;

  const types = {
    Receipt: [
      { name: 'agent', type: 'address' },
      { name: 'requester', type: 'address' },
      { name: 'requestHash', type: 'bytes32' },
      { name: 'deliveryHash', type: 'bytes32' },
      { name: 'timestamp', type: 'uint256' },
      { name: 'metadataURI', type: 'string' },
    ],
  };

  const { signature, domain, created, ...value } = receipt;
  const recovered = ethers.verifyTypedData(domain, types, value, signature);

  return {
    valid: recovered.toLowerCase() === receipt.agent.toLowerCase(),
    signer: recovered,
    claimedAgent: receipt.agent,
  };
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  
  if (args[0] === 'verify') {
    const result = await verifyReceipt(args[1]);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Parse flags
  const opts = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace('--', '');
    opts[key] = args[i + 1];
  }

  if (!opts.request || !opts.delivery) {
    console.log('Usage: node receipt-signer.js --request "description" --delivery /path/or/text [--requester 0x...] [--metadata-uri ipfs://...]');
    console.log('       node receipt-signer.js verify receipt.json');
    process.exit(1);
  }

  const receipt = await createReceipt({
    request: opts.request,
    delivery: opts.delivery,
    requester: opts.requester,
    metadataURI: opts['metadata-uri'],
    chainId: opts['chain-id'] ? parseInt(opts['chain-id']) : undefined,
  });

  const outPath = opts.output || 'receipt.json';
  fs.writeFileSync(outPath, JSON.stringify(receipt, null, 2));
  console.log(`✅ Receipt signed and saved to ${outPath}`);
  console.log(`   Agent: ${receipt.agent}`);
  console.log(`   Request hash: ${receipt.requestHash}`);
  console.log(`   Delivery hash: ${receipt.deliveryHash}`);
}

main().catch(console.error);
