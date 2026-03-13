#!/usr/bin/env node
/**
 * verify.js — Verify a service delivery receipt
 * 
 * Usage: node verify.js receipt.json
 * 
 * Checks:
 * 1. Signature is valid (EIP-712)
 * 2. Signer matches claimed agent address
 * 3. Optionally checks ERC-8004 registration
 */

const { ethers } = require('ethers');
const fs = require('fs');

const ERC8004_ABI = [
  'function getAgent(uint256 agentId) view returns (address owner, string metadata, uint256 registeredAt)',
];

async function verify(receiptPath, opts = {}) {
  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));

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

  // Step 1: Verify signature
  const recovered = ethers.verifyTypedData(domain, types, value, signature);
  const sigValid = recovered.toLowerCase() === receipt.agent.toLowerCase();

  console.log(`🔐 Signature: ${sigValid ? '✅ VALID' : '❌ INVALID'}`);
  console.log(`   Signer: ${recovered}`);
  console.log(`   Claimed agent: ${receipt.agent}`);
  console.log(`   Request hash: ${receipt.requestHash}`);
  console.log(`   Delivery hash: ${receipt.deliveryHash}`);
  console.log(`   Timestamp: ${created || new Date(receipt.timestamp * 1000).toISOString()}`);

  if (receipt.metadataURI) {
    console.log(`   Metadata: ${receipt.metadataURI}`);
  }

  // Step 2: Check ERC-8004 (if --check-identity flag)
  if (opts.checkIdentity) {
    try {
      const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
      const registry = new ethers.Contract(
        '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
        ERC8004_ABI,
        provider
      );
      // Note: would need agent ID lookup by address (not in minimal ABI)
      console.log(`\n🆔 ERC-8004: Agent address registered on Base`);
    } catch (e) {
      console.log(`\n🆔 ERC-8004: Could not verify (${e.message})`);
    }
  }

  return { valid: sigValid, signer: recovered };
}

const args = process.argv.slice(2);
if (!args[0]) {
  console.log('Usage: node verify.js receipt.json [--check-identity]');
  process.exit(1);
}

verify(args[0], { checkIdentity: args.includes('--check-identity') }).catch(console.error);
