import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  console.log("Deploying KnowledgeMarket implementation and upgradeable proxy system...");

  // 1. Deploy KnowledgeMarket implementation
  console.log("1. Deploying KnowledgeMarket implementation...");
  const KnowledgeMarket = await ethers.getContractFactory("KnowledgeMarket");
  const knowledgeMarket = await KnowledgeMarket.deploy();
  await knowledgeMarket.waitForDeployment();
  const knowledgeMarketAddress = await knowledgeMarket.getAddress();
  console.log(`   Implementation deployed at: ${knowledgeMarketAddress}`);
  // 2. Deploy KnowledgeMarketProxy
  console.log("2. Deploying KnowledgeMarketProxy...");
  const KnowledgeMarketProxy = await ethers.getContractFactory("KnowledgeMarketProxy");
  const proxy = await KnowledgeMarketProxy.deploy(knowledgeMarketAddress);
  await proxy.waitForDeployment();
  const proxyAddress = await proxy.getAddress();
  console.log(`   Proxy deployed at: ${proxyAddress}`);

  // Initialize Proxy (if not already initialized)
  console.log("Initializing proxy contract...");
  const [owner] = await ethers.getSigners();
  const platformFee = 1200; // 12%
  const treasury = process.env.TREASURY_WALLET || owner.address;

  const proxyAsMarket = await ethers.getContractAt("KnowledgeMarket", proxyAddress);

  try {
    const currentTreasury = await proxyAsMarket.platformTreasury();

    if (currentTreasury === ethers.ZeroAddress) {
      const tx = await proxyAsMarket.initialize(treasury, platformFee);
      await tx.wait();
      console.log("   Proxy initialized successfully.");
    } else {
      console.log("   Proxy already initialized. Skipping initialization.");
    }
  } catch (err: any) {
    console.error("   Failed to check or initialize proxy:", err.message);
  }

  // 3. Deploy ProxyAdmin
  console.log("3. Deploying ProxyAdmin...");
  const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
  const proxyAdmin = await ProxyAdmin.deploy();
  await proxyAdmin.waitForDeployment();
  const proxyAdminAddress = await proxyAdmin.getAddress();
  console.log(`   ProxyAdmin deployed at: ${proxyAdminAddress}`);

  // 4. Transfer proxy admin to ProxyAdmin contract
  console.log("4. Transferring proxy admin to ProxyAdmin contract...");
  // Get proxy instance with the full interface to access changeAdmin method
  const proxyWithInterface = await ethers.getContractAt("KnowledgeMarketProxy", proxyAddress);
  await proxyWithInterface.changeAdmin(proxyAdminAddress);
  console.log(`   Proxy admin transferred to: ${proxyAdminAddress}`);

  console.log("\nDeployment completed successfully!");
  console.log("==============================================");
  console.log(`You can interact with KnowledgeMarket through the proxy at: ${proxyAddress}`);
  console.log(`The actual implementation is at: ${knowledgeMarketAddress}`);
  console.log(`The ProxyAdmin for upgrades is at: ${proxyAdminAddress}`);
  console.log("\nTo verify the contracts on block explorer:");
  console.log(`npx hardhat verify --network [NETWORK] ${knowledgeMarketAddress}`);
  console.log(`npx hardhat verify --network [NETWORK] ${proxyAddress} ${knowledgeMarketAddress}`);
  console.log(`npx hardhat verify --network [NETWORK] ${proxyAdminAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}); 