import { ethers } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
    console.log("Starting upgrade process...");

    const proxyAddress = process.env.PROXY_ADDRESS; // Address of the proxy contract to upgrade
    const proxyAdminAddress = process.env.PROXY_ADMIN_ADDRESS; // Address of the proxy admin

    if (!proxyAddress || !proxyAdminAddress) {
        console.error("Proxy address and Proxy Admin address must be set in .env file.");
        return;
    }

    // 1. Deploy the new implementation
    console.log("Deploying new KnowledgeMarketV2 implementation...");
    const KnowledgeMarketV2 = await ethers.getContractFactory("KnowledgeMarketV2");
    const knowledgeMarketV2 = await KnowledgeMarketV2.deploy();
    await knowledgeMarketV2.waitForDeployment();
    const newImplAddress = await knowledgeMarketV2.getAddress();
    console.log(`New implementation deployed at: ${newImplAddress}`);

    // 2. Get contract instance
    const proxyAdmin = await ethers.getContractAt("ProxyAdmin", proxyAdminAddress);
    const proxy = await ethers.getContractAt("KnowledgeMarketProxy", proxyAddress);

    // 3. Perform the upgrade
    console.log("Calling ProxyAdmin.upgrade(...)")
    const upgradeTx = await proxyAdmin.upgrade(await proxy.getAddress(), newImplAddress);
    await upgradeTx.wait();
    console.log("Proxy upgraded successfully!");
    console.log(`New implementation at: ${newImplAddress}`);
    
}

main().catch((err) => {
    console.error("Error during upgrade process:", err);
    process.exit(1);
});