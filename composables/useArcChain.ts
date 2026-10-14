import { defineChain } from "viem";

export const getArcChain = () => {
  const chainId = Number(import.meta.env.VITE_ARC_CHAIN_ID || 5042);
  const rpcUrl = import.meta.env.VITE_ARC_RPC_URL || "https://rpc.mainnet.arc.io";
  const explorerUrl = import.meta.env.VITE_ARC_EXPLORER_URL || "https://explorer.arc.io";

  return defineChain({
    id: chainId,
    name: "Arc Network",
    nativeCurrency: { decimals: 6, name: "USD Coin", symbol: "USDC" },
    rpcUrls: { default: { http: [rpcUrl] } },
    blockExplorers: {
      default: { name: "Arc Explorer", url: explorerUrl },
    },
  });
};
