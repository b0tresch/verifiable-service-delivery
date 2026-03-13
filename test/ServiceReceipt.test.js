const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ServiceReceipt", function () {
  let receipt;
  let agent, requester, other;

  beforeEach(async function () {
    [agent, requester, other] = await ethers.getSigners();
    const ServiceReceipt = await ethers.getContractFactory("ServiceReceipt");
    receipt = await ServiceReceipt.deploy();
    await receipt.waitForDeployment();
  });

  describe("submitReceipt", function () {
    it("should submit a receipt and increment count", async function () {
      const requestHash = ethers.keccak256(ethers.toUtf8Bytes("analyze BTC whales"));
      const deliveryHash = ethers.keccak256(ethers.toUtf8Bytes("report-output-v1"));

      const tx = await receipt.connect(agent).submitReceipt(
        requester.address,
        requestHash,
        deliveryHash,
        "ipfs://QmTest123"
      );
      await tx.wait();

      expect(await receipt.receiptCount()).to.equal(1);
    });

    it("should store correct receipt data", async function () {
      const requestHash = ethers.keccak256(ethers.toUtf8Bytes("audit skill"));
      const deliveryHash = ethers.keccak256(ethers.toUtf8Bytes("audit-report"));

      await receipt.connect(agent).submitReceipt(
        requester.address,
        requestHash,
        deliveryHash,
        "https://example.com/receipt.json"
      );

      const r = await receipt.receipts(0);
      expect(r.agent).to.equal(agent.address);
      expect(r.requester).to.equal(requester.address);
      expect(r.requestHash).to.equal(requestHash);
      expect(r.deliveryHash).to.equal(deliveryHash);
      expect(r.metadataURI).to.equal("https://example.com/receipt.json");
    });

    it("should emit ReceiptSubmitted event", async function () {
      const requestHash = ethers.keccak256(ethers.toUtf8Bytes("request"));
      const deliveryHash = ethers.keccak256(ethers.toUtf8Bytes("delivery"));

      await expect(
        receipt.connect(agent).submitReceipt(
          requester.address,
          requestHash,
          deliveryHash,
          ""
        )
      )
        .to.emit(receipt, "ReceiptSubmitted")
        .withArgs(0, agent.address, requester.address, requestHash, deliveryHash, "");
    });
  });

  describe("queries", function () {
    beforeEach(async function () {
      const rh1 = ethers.keccak256(ethers.toUtf8Bytes("req1"));
      const dh1 = ethers.keccak256(ethers.toUtf8Bytes("del1"));
      const rh2 = ethers.keccak256(ethers.toUtf8Bytes("req2"));
      const dh2 = ethers.keccak256(ethers.toUtf8Bytes("del2"));

      await receipt.connect(agent).submitReceipt(requester.address, rh1, dh1, "uri1");
      await receipt.connect(agent).submitReceipt(other.address, rh2, dh2, "uri2");
      await receipt.connect(other).submitReceipt(requester.address, rh1, dh1, "uri3");
    });

    it("should return correct agent receipt IDs", async function () {
      const ids = await receipt.getAgentReceiptIds(agent.address);
      expect(ids.length).to.equal(2);
      expect(ids[0]).to.equal(0);
      expect(ids[1]).to.equal(1);
    });

    it("should return correct requester receipt IDs", async function () {
      const ids = await receipt.getRequesterReceiptIds(requester.address);
      expect(ids.length).to.equal(2);
      expect(ids[0]).to.equal(0);
      expect(ids[1]).to.equal(2);
    });

    it("should return correct agent receipt count", async function () {
      expect(await receipt.getAgentReceiptCount(agent.address)).to.equal(2);
      expect(await receipt.getAgentReceiptCount(other.address)).to.equal(1);
    });

    it("should return empty for unknown addresses", async function () {
      const unknown = ethers.Wallet.createRandom().address;
      const ids = await receipt.getAgentReceiptIds(unknown);
      expect(ids.length).to.equal(0);
      expect(await receipt.getAgentReceiptCount(unknown)).to.equal(0);
    });
  });

  describe("multiple agents", function () {
    it("should track receipts independently per agent", async function () {
      const rh = ethers.keccak256(ethers.toUtf8Bytes("same-request"));
      const dh = ethers.keccak256(ethers.toUtf8Bytes("same-delivery"));

      await receipt.connect(agent).submitReceipt(requester.address, rh, dh, "a");
      await receipt.connect(other).submitReceipt(requester.address, rh, dh, "b");

      expect(await receipt.getAgentReceiptCount(agent.address)).to.equal(1);
      expect(await receipt.getAgentReceiptCount(other.address)).to.equal(1);
      expect(await receipt.receiptCount()).to.equal(2);
    });
  });
});
