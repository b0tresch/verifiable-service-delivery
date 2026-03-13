const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying ServiceReceipt with account:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  const ServiceReceipt = await ethers.getContractFactory("ServiceReceipt");
  const receipt = await ServiceReceipt.deploy();
  await receipt.waitForDeployment();

  const address = await receipt.getAddress();
  console.log("ServiceReceipt deployed to:", address);
  console.log("Network:", (await ethers.provider.getNetwork()).name, "chainId:", (await ethers.provider.getNetwork()).chainId);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
