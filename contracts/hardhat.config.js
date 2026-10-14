require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config({ path: ".env" });

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    arc: {
      url: process.env.ARC_RPC_URL || "",
      chainId: Number(process.env.ARC_CHAIN_ID) || 5042002,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    arcMainnet: {
      url: process.env.ARC_MAINNET_RPC_URL || "https://rpc.mainnet.arc.io",
      chainId: Number(process.env.ARC_MAINNET_CHAIN_ID || 5042),
      accounts: process.env.MAINNET_PRIVATE_KEY ? [process.env.MAINNET_PRIVATE_KEY] : [],
      gasPrice: 20000000000, // 20 Gwei (Arc Mainnet minimum)
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};
