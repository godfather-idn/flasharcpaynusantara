const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("Deploying FlashArcPay contract...");

  // Get the USDC contract address from environment variables
  const usdcAddress = process.env.USDC_CONTRACT_ADDRESS;
  
  if (!usdcAddress) {
    throw new Error("USDC_CONTRACT_ADDRESS not set in environment variables");
  }

  console.log("USDC Token Address:", usdcAddress);

  // Deploy the contract
  const FlashArcPay = await hre.ethers.getContractFactory("FlashArcPay");
  const flashArcPay = await FlashArcPay.deploy(usdcAddress);
  
  await flashArcPay.waitForDeployment();
  
  const deployedAddress = await flashArcPay.getAddress();
  
  console.log("FlashArcPay deployed to:", deployedAddress);
  console.log("Transaction hash:", flashArcPay.deploymentTransaction()?.hash);

  // Update the root .env file with the deployed contract address
  const rootEnvPath = path.join(__dirname, "../.env");
  
  if (fs.existsSync(rootEnvPath)) {
    let envContent = fs.readFileSync(rootEnvPath, "utf8");
    
    // Update or add VITE_FLASH_ARC_PAY_ADDRESS
    const addressRegex = /^VITE_FLASH_ARC_PAY_ADDRESS=.*$/m;
    const newAddressLine = `VITE_FLASH_ARC_PAY_ADDRESS="${deployedAddress}"`;
    
    if (addressRegex.test(envContent)) {
      envContent = envContent.replace(addressRegex, newAddressLine);
    } else {
      envContent += `\n${newAddressLine}`;
    }
    
    fs.writeFileSync(rootEnvPath, envContent);
    console.log("Updated root .env file with deployed contract address");
  } else {
    console.warn("Root .env file not found. Please manually add:");
    console.log(`VITE_FLASH_ARC_PAY_ADDRESS="${deployedAddress}"`);
  }

  // Verify deployment
  console.log("\nVerifying deployment...");
  const usdcToken = await flashArcPay.usdcToken();
  console.log("Contract USDC token address:", usdcToken);
  
  if (usdcToken.toLowerCase() !== usdcAddress.toLowerCase()) {
    throw new Error("Deployment verification failed: USDC address mismatch");
  }
  
  console.log("Deployment verified successfully!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
