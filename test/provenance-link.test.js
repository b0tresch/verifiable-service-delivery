const { expect } = require("chai");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

describe("provenance-link", function () {
  const projectDir = path.join(__dirname, "..");
  const demoReceipt = path.join(projectDir, "demo-receipt.json");
  const provenanceOut = path.join(projectDir, "test-provenance.json");

  before(function () {
    // Ensure demo receipt exists
    if (!fs.existsSync(demoReceipt)) {
      this.skip("No demo-receipt.json found — run demo.js first");
    }
  });

  after(function () {
    if (fs.existsSync(provenanceOut)) {
      fs.unlinkSync(provenanceOut);
    }
  });

  describe("demo-receipt.json integrity", function () {
    let receipt;

    before(function () {
      receipt = JSON.parse(fs.readFileSync(demoReceipt, "utf8"));
    });

    it("should have required fields", function () {
      expect(receipt).to.have.property("agent");
      expect(receipt).to.have.property("requestHash");
      expect(receipt).to.have.property("deliveryHash");
      expect(receipt).to.have.property("timestamp");
      expect(receipt).to.have.property("signature");
    });

    it("should have valid agent address", function () {
      expect(receipt.agent).to.match(/^0x[a-fA-F0-9]{40}$/);
    });

    it("should have valid hashes", function () {
      expect(receipt.requestHash).to.match(/^0x[a-fA-F0-9]{64}$/);
      expect(receipt.deliveryHash).to.match(/^0x[a-fA-F0-9]{64}$/);
    });

    it("should have EIP-712 signature", function () {
      expect(receipt.signature).to.match(/^0x[a-fA-F0-9]+$/);
      expect(receipt.signature.length).to.equal(132); // 65 bytes = 130 hex + 0x
    });

    it("should have on-chain reference", function () {
      expect(receipt).to.have.property("txHash");
      expect(receipt.txHash).to.match(/^0x[a-fA-F0-9]{64}$/);
    });
  });

  describe("provenance-link output", function () {
    let provenance;

    before(function () {
      const provenanceFile = path.join(projectDir, "demo-receipt-provenance.json");
      if (!fs.existsSync(provenanceFile)) {
        this.skip("No provenance file — run provenance-link.js first");
      }
      provenance = JSON.parse(fs.readFileSync(provenanceFile, "utf8"));
    });

    it("should have correct type and version", function () {
      expect(provenance.type).to.equal("provenance-link");
      expect(provenance.version).to.equal("1.0");
    });

    it("should contain receipt reference", function () {
      expect(provenance.receipt).to.have.property("agent");
      expect(provenance.receipt).to.have.property("requestHash");
      expect(provenance.receipt).to.have.property("deliveryHash");
      expect(provenance.receipt).to.have.property("txHash");
    });

    it("should contain identity reference", function () {
      expect(provenance.identity.standard).to.equal("ERC-8004");
      expect(provenance.identity.agentId).to.equal(16843);
      expect(provenance.identity.chain).to.equal("base");
    });

    it("should reference correct chains", function () {
      expect(provenance.chain.receipt).to.equal("monad_testnet");
      expect(provenance.chain.identity).to.equal("base_mainnet");
    });

    it("should have checkpoint if available", function () {
      if (provenance.checkpoint) {
        expect(provenance.checkpoint).to.have.property("merkleRoot");
        expect(provenance.checkpoint).to.have.property("fileCount");
        expect(provenance.checkpoint.merkleRoot).to.match(/^0x[a-fA-F0-9]{64}$/);
        expect(provenance.checkpoint.fileCount).to.be.greaterThan(0);
      }
    });

    it("should have creation timestamp", function () {
      expect(provenance).to.have.property("created");
      expect(new Date(provenance.created).getTime()).to.be.greaterThan(0);
    });
  });

  describe("EIP-712 signature verification", function () {
    it("should verify receipt signature matches agent", function () {
      const { ethers } = require("ethers");
      const receipt = JSON.parse(fs.readFileSync(demoReceipt, "utf8"));

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

      const domain = receipt.domain || {
        name: "ServiceReceipt",
        version: "1",
        chainId: receipt.chainId || 10143,
      };
      const { signature, domain: _d, created, receiptId, txHash, blockNumber, contract, network, chainId, ...value } = receipt;
      const recovered = ethers.verifyTypedData(domain, types, value, signature);
      expect(recovered.toLowerCase()).to.equal(receipt.agent.toLowerCase());
    });
  });
});
