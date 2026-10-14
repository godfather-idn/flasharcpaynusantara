import { ref, type Ref } from "vue";
import { createPublicClient, createWalletClient, custom, http, parseGwei } from "viem";
import { AppKit } from "@circle-fin/app-kit";
import { ViemAdapter } from "@circle-fin/adapter-viem-v2";
import { getArcChain } from "./useArcChain";

/**
 * Check if device is mobile
 */
const isMobile = () => {
  if (typeof window === "undefined") return false;

  const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
  const isMobileDevice = /android|ipad|iphone|ipod/i.test(userAgent);
  console.log("isMobile check:", { userAgent, isMobileDevice });
  return isMobileDevice;
};

/**
 * Check if running in MetaMask browser
 */
const isMetaMaskBrowser = () => {
  if (typeof window === "undefined") return false;

  const userAgent = navigator.userAgent;
  // Only detect actual MetaMask mobile browser, not desktop extension
  const isMMBrowser = /MetaMaskMobile/i.test(userAgent);
  console.log("isMetaMaskBrowser check:", { userAgent, isMMBrowser });
  return isMMBrowser;
};

/**
 * Open wallet app on mobile
 */
const openWalletApp = (walletType: "metamask" | "trust" | "coinbase" = "metamask") => {
  if (typeof window === "undefined") return;

  const currentUrl = window.location.href;
  let deepLink = "";

  switch (walletType) {
    case "metamask":
      // Try multiple approaches for MetaMask
      // 1. Universal link (Branch.io)
      // 2. Custom scheme (if app is installed)
      // 3. Store link (fallback)
      deepLink = `https://metamask.app.link/dapp/${currentUrl}`;
      break;
    case "trust":
      // Trust Wallet deep link
      deepLink = `https://link.trustwallet.com/dapp?url=${encodeURIComponent(currentUrl)}`;
      break;
    case "coinbase":
      // Coinbase Wallet deep link
      deepLink = `https://go.cb-w.com/dapp?uri=${encodeURIComponent(currentUrl)}`;
      break;
  }

  console.log("Opening wallet app:", { walletType, deepLink });

  // Use window.open instead of window.location.href to avoid intent issues
  try {
    window.open(deepLink, "_blank");
  } catch (error) {
    console.error("Failed to open wallet app:", error);
    // Fallback to direct navigation
    window.location.href = deepLink;
  }
};

/**
 * Safely get the Ethereum provider from window
 */
const getEthereumProvider = () => {
  if (typeof window === "undefined") return null;
  
  // Try different ways to get the provider
  let provider = (window as any).ethereum || 
                   (window as any).web3?.currentProvider ||
                   (window as any).web3?.givenProvider;
  
  // MetaMask browser specific check
  if (!provider && isMetaMaskBrowser()) {
    // In MetaMask browser, provider might be injected differently
    provider = (window as any).ethereum;
  }
  
  return provider;
};

export const useArcAppKit = () => {
  const chain = getArcChain();
  const usdcAddress = import.meta.env.VITE_USDC_CONTRACT_ADDRESS;
  const flashArcPayAddress = import.meta.env.VITE_FLASH_ARC_PAY_ADDRESS;

  let appKit: AppKit | null = null;
  let walletClient: any = null;
  let publicClient: any = null;
  let viemAdapter: ViemAdapter | null = null;

  const isConnected = ref(false);
  const account = ref<`0x${string}` | null>(null);
  const balance = ref<bigint>(0n);

  /**
   * Initialize the Arc App Kit with wallet and public clients
   */
  const initializeAppKit = async () => {
    const provider = getEthereumProvider();
    
    if (!provider) {
      console.error("No wallet provider found");
      return null;
    }

    try {
      // Get accounts first
      const accounts = await provider.request({ method: "eth_accounts" });
      console.log("Accounts:", accounts);
      
      if (!accounts || accounts.length === 0) {
        throw new Error("No accounts found");
      }
      
      // Create public client using RPC directly (more reliable)
      publicClient = createPublicClient({
        chain,
        transport: http(import.meta.env.VITE_ARC_RPC_URL || "https://rpc.mainnet.arc.io"),
      });

      // Create wallet client - skip chain validation for now
      walletClient = createWalletClient({
        account: accounts[0] as `0x${string}`,
        chain,
        transport: custom(provider),
      });

      // Don't use ViemAdapter for now - it requires getPublicClient/getWalletClient functions
      // We'll use viem clients directly
      viemAdapter = null;
      appKit = null;

      return appKit;
    } catch (error) {
      console.error("Failed to initialize App Kit:", error);
      return null;
    }
  };

  /**
   * Add Arc Network (Testnet or Mainnet) to MetaMask
   */
  const addArcNetwork = async () => {
    if (typeof window === "undefined") {
      return false;
    }

    try {
      const provider = (window as any).ethereum || (window as any).web3?.currentProvider;

      if (!provider) {
        return false;
      }

      const chainId = Number(import.meta.env.VITE_ARC_CHAIN_ID || 5042);
      const chainIdHex = "0x" + chainId.toString(16);
      const isMainnet = chainId === 5042;

      // Try to switch to the network first (in case it's already added)
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: chainIdHex }],
        });
        return true;
      } catch (switchError: any) {
        // This error code indicates that the chain has not been added to MetaMask
        if (switchError.code === 4902) {
          // Add the network
          await provider.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: chainIdHex,
                chainName: isMainnet ? "Arc Mainnet" : "Arc Testnet",
                nativeCurrency: {
                  name: "USD Coin",
                  symbol: "USDC",
                  decimals: 6,
                },
                rpcUrls: [import.meta.env.VITE_ARC_RPC_URL || (isMainnet ? "https://rpc.mainnet.arc.io" : "https://rpc.testnet.arc.io")],
                blockExplorerUrls: [import.meta.env.VITE_ARC_EXPLORER_URL || (isMainnet ? "https://explorer.arc.io" : "https://explorer.testnet.arc.io")],
              },
            ],
          });
          return true;
        } else {
          throw switchError;
        }
      }
    } catch (error) {
      console.error("Failed to add/switch Arc network:", error);
      return false;
    }
  };

  /**
   * Check if wallet is available
   */
  const checkWalletAvailability = async () => {
    if (typeof window === "undefined") {
      throw new Error("No wallet provider found. Please install MetaMask or another Web3 wallet.");
    }

    // Check if mobile
    if (isMobile() && !isMetaMaskBrowser()) {
      throw new Error("Mobile device detected. Please use a wallet app with dApp browser support (MetaMask, Trust Wallet, etc.)");
    }

    try {
      // Get the ethereum provider safely
      const provider = getEthereumProvider();
      
      if (!provider) {
        throw new Error("No wallet provider found. Please install MetaMask or another Web3 wallet.");
      }

      // Just check if wallet is available, don't request accounts yet
      const accounts = await provider.request({ method: "eth_accounts" });
      return accounts.length > 0;
    } catch (error) {
      throw new Error("Failed to check wallet availability");
    }
  };

  /**
   * Connect wallet
   */
  const connectWallet = async () => {
    try {
      const provider = getEthereumProvider();
      
      if (!provider) {
        throw new Error("No wallet provider found. Please install MetaMask or another Web3 wallet.");
      }

      // Check wallet availability first
      const hasAccounts = await checkWalletAvailability();
      
      if (!hasAccounts) {
        // Request accounts if none available
        await provider.request({ method: "eth_requestAccounts" });
      }

      // Automatically add/switch to Arc Network (Testnet or Mainnet)
      await addArcNetwork();

      if (!walletClient) {
        await initializeAppKit();
      }

      if (!walletClient) {
        throw new Error("Failed to initialize wallet client");
      }

      const [address] = await walletClient.getAddresses();
      account.value = address;
      isConnected.value = true;

      // Fetch balance
      await fetchBalance();

      return address;
    } catch (error: any) {
      console.error("Failed to connect wallet:", error);
      // Don't throw error, just log it so UI can show connect button
      isConnected.value = false;
      throw error; // Re-throw to let UI handle the error message
    }
  };

  /**
   * Disconnect wallet
   */
  const disconnectWallet = () => {
    account.value = null;
    isConnected.value = false;
    balance.value = 0n;
    appKit = null;
    walletClient = null;
    publicClient = null;
    viemAdapter = null;
  };

  /**
   * Fetch USDC balance (6 decimals)
   */
  const fetchBalance = async () => {
    if (!publicClient || !account.value || !usdcAddress) {
      console.log("Missing required data for fetchBalance:", {
        hasPublicClient: !!publicClient,
        hasAccount: !!account.value,
        hasUsdcAddress: !!usdcAddress,
        account: account.value,
        usdcAddress: usdcAddress,
      });
      return 0n;
    }

    try {
      console.log("Fetching USDC balance for:", account.value, "from contract:", usdcAddress);
      
      const balanceResult = await publicClient.readContract({
        address: usdcAddress as `0x${string}`,
        abi: [
          {
            constant: true,
            inputs: [{ name: "_owner", type: "address" }],
            name: "balanceOf",
            outputs: [{ name: "balance", type: "uint256" }],
            type: "function",
          },
        ],
        functionName: "balanceOf",
        args: [account.value],
      });

      console.log("Raw balance:", balanceResult);
      balance.value = balanceResult as bigint;
      console.log("Formatted balance:", balance.value.toString());
      return balanceResult;
    } catch (error) {
      console.error("Failed to fetch balance:", error);
      return 0n;
    }
  };

  /**
   * Send USDC payment using App Kit
   * @param to Recipient address
   * @param amount Amount in USDC (6 decimals)
   */
  const sendUSDC = async (to: `0x${string}`, amount: bigint) => {
    if (!walletClient || !usdcAddress) {
      throw new Error("Wallet client not initialized or USDC address not set");
    }

    try {
      // Direct ERC20 transfer using wallet client with Arc Mainnet gas overrides
      const hash = await walletClient.writeContract({
        address: usdcAddress as `0x${string}`,
        abi: [
          {
            constant: false,
            inputs: [
              { name: "_to", type: "address" },
              { name: "_value", type: "uint256" },
            ],
            name: "transfer",
            outputs: [{ name: "", type: "bool" }],
            type: "function",
          },
        ],
        functionName: "transfer",
        args: [to, amount],
        // Arc Mainnet compliance: enforce minimum 20 Gwei gas fee
        maxFeePerGas: parseGwei("20"),
        maxPriorityFeePerGas: parseGwei("2"),
      });

      // Refresh balance after transaction
      await fetchBalance();

      return hash;
    } catch (error) {
      console.error("Failed to send USDC:", error);
      throw error;
    }
  };

  /**
   * Get unified balance across chains using App Kit
   */
  const getUnifiedBalance = async () => {
    if (!publicClient || !account.value || !usdcAddress) {
      throw new Error("Public client not initialized or account not connected");
    }

    try {
      // For now, return the balance on the current chain
      // AppKit unified balance would be implemented based on SDK documentation
      return await fetchBalance();
    } catch (error) {
      console.error("Failed to get unified balance:", error);
      throw error;
    }
  };

  /**
   * Bridge USDC from another chain using App Kit
   * @param fromChain Source chain ID
   * @param amount Amount to bridge
   */
  const bridgeUSDC = async (fromChain: number, amount: bigint) => {
    // Bridge functionality would be implemented based on AppKit SDK documentation
    throw new Error("Bridge functionality not yet implemented");
  };

  /**
   * Pay merchant through FlashArcPay contract
   * @param merchant Merchant address
   * @param orderId Order ID (string)
   * @param amount Amount in USDC (6 decimals)
   */
  const payMerchant = async (
    merchant: `0x${string}`,
    orderId: string,
    amount: bigint
  ) => {
    if (!walletClient || !flashArcPayAddress || !usdcAddress) {
      throw new Error("Wallet client not initialized or contract address not set");
    }

    try {
      console.log("Executing payMerchant with params:", { merchant, orderId, amount: amount.toString() });
      
      // Check current allowance
      const currentAllowance = await publicClient.readContract({
        address: usdcAddress as `0x${string}`,
        abi: [
          {
            constant: true,
            inputs: [
              { name: "_owner", type: "address" },
              { name: "_spender", type: "address" },
            ],
            name: "allowance",
            outputs: [{ name: "", type: "uint256" }],
            type: "function",
          },
        ],
        functionName: "allowance",
        args: [account.value, flashArcPayAddress as `0x${string}`],
      }) as bigint;

      console.log("Current allowance:", currentAllowance.toString(), "Required:", amount.toString());

      // Approve USDC if allowance is insufficient
      if (currentAllowance < amount) {
        console.log("Approving USDC transfer...");
        const approveHash = await walletClient.writeContract({
          address: usdcAddress as `0x${string}`,
          abi: [
            {
              constant: false,
              inputs: [
                { name: "spender", type: "address" },
                { name: "amount", type: "uint256" },
              ],
              name: "approve",
              outputs: [{ name: "", type: "bool" }],
              type: "function",
            },
          ],
          functionName: "approve",
          args: [flashArcPayAddress as `0x${string}`, amount],
          // Arc Mainnet compliance: enforce minimum 20 Gwei gas fee
          maxFeePerGas: parseGwei("20"),
          maxPriorityFeePerGas: parseGwei("2"),
        });

        console.log("Approval hash:", approveHash);

        // Wait for approval confirmation
        const receipt = await publicClient.waitForTransactionReceipt({ hash: approveHash });
        console.log("Approval receipt:", receipt);

        if (receipt.status !== "success") {
          throw new Error("USDC approval failed");
        }
      }

      // Execute payment
      const hash = await walletClient.writeContract({
        address: flashArcPayAddress as `0x${string}`,
        abi: [
          {
            inputs: [
              { name: "merchant", type: "address" },
              { name: "orderId", type: "string" },
              { name: "amount", type: "uint256" },
            ],
            name: "payMerchant",
            outputs: [],
            stateMutability: "nonpayable",
            type: "function",
          },
        ],
        functionName: "payMerchant",
        args: [merchant, orderId, amount],
        // Arc Mainnet compliance: enforce minimum 20 Gwei gas fee
        maxFeePerGas: parseGwei("20"),
        maxPriorityFeePerGas: parseGwei("2"),
      });

      console.log("Payment hash:", hash);

      // Refresh balance after transaction
      await fetchBalance();

      return hash;
    } catch (error) {
      console.error("Failed to pay merchant:", error);
      throw error;
    }
  };

  /**
   * Listen to PaymentProcessed event from FlashArcPay contract
   * @param merchant Merchant address to filter events
   * @param callback Callback function when event is emitted
   */
  const listenToPaymentEvent = (
    merchant: `0x${string}`,
    callback: (event: any) => void
  ) => {
    if (!publicClient || !flashArcPayAddress) {
      console.error("Public client not initialized or contract address not set");
      return () => {};
    }

    let pollingInterval: ReturnType<typeof setInterval> | null = null;
    let lastProcessedBlock: bigint | null = null;

    // Initialize with current block to avoid large range
    const initializeBlock = async () => {
      try {
        lastProcessedBlock = await publicClient.getBlockNumber();
        console.log("Initialized event listener at block:", lastProcessedBlock?.toString());
      } catch (error) {
        console.error("Failed to get initial block:", error);
      }
    };

    // Start event watching
    try {
      const unwatch = publicClient.watchContractEvent({
        address: flashArcPayAddress as `0x${string}`,
        abi: [
          {
            anonymous: false,
            inputs: [
              { indexed: true, name: "merchant", type: "address" },
              { indexed: true, name: "payer", type: "address" },
              { indexed: true, name: "orderHash", type: "bytes32" },
              { name: "orderId", type: "string" },
              { name: "amount", type: "uint256" },
              { name: "timestamp", type: "uint256" },
            ],
            name: "PaymentProcessed",
            type: "event",
          },
        ],
        eventName: "PaymentProcessed",
        args: {
          merchant,
        },
        onLogs: (logs: any[]) => {
          logs.forEach(callback);
        },
      });

      // Initialize block before starting polling
      initializeBlock();

      // Fallback polling every 5 seconds (reduced to avoid rate limiting)
      pollingInterval = setInterval(async () => {
        try {
          const currentBlock = await publicClient.getBlockNumber();
          
          // Only poll if we have initialized and there are new blocks
          if (lastProcessedBlock && currentBlock > lastProcessedBlock) {
            // Limit range to avoid RPC errors (max 1000 blocks per request)
            const fromBlock = lastProcessedBlock + 1n;
            const toBlock = currentBlock;
            
            // If range is too large, break it into smaller chunks
            if (toBlock - fromBlock > 1000n) {
              console.log("Range too large, polling recent blocks only");
              // Only check last 100 blocks to be safe
              const safeFromBlock = toBlock - 100n;
              const logs = await publicClient.getLogs({
                address: flashArcPayAddress as `0x${string}`,
                event: {
                  type: "event",
                  name: "PaymentProcessed",
                  inputs: [
                    { indexed: true, name: "merchant", type: "address" },
                    { indexed: true, name: "payer", type: "address" },
                    { indexed: true, name: "orderHash", type: "bytes32" },
                    { name: "orderId", type: "string" },
                    { name: "amount", type: "uint256" },
                    { name: "timestamp", type: "uint256" },
                  ],
                },
                args: {
                  merchant,
                },
                fromBlock: safeFromBlock,
                toBlock: toBlock,
              });

              logs.forEach(callback);
              lastProcessedBlock = toBlock;
            } else {
              const logs = await publicClient.getLogs({
                address: flashArcPayAddress as `0x${string}`,
                event: {
                  type: "event",
                  name: "PaymentProcessed",
                  inputs: [
                    { indexed: true, name: "merchant", type: "address" },
                    { indexed: true, name: "payer", type: "address" },
                    { indexed: true, name: "orderHash", type: "bytes32" },
                    { name: "orderId", type: "string" },
                    { name: "amount", type: "uint256" },
                    { name: "timestamp", type: "uint256" },
                  ],
                },
                args: {
                  merchant,
                },
                fromBlock: fromBlock,
                toBlock: toBlock,
              });

              logs.forEach(callback);
              lastProcessedBlock = toBlock;
            }
          }
        } catch (error) {
          console.error("Polling error:", error);
          // Reset lastProcessedBlock on error to retry
          if (lastProcessedBlock) {
            lastProcessedBlock = null;
          }
        }
      }, 2500);

      return () => {
        unwatch();
        if (pollingInterval) {
          clearInterval(pollingInterval);
        }
      };
    } catch (error) {
      console.error("Failed to listen to payment event:", error);
      return () => {};
    }
  };

  return {
    // State
    isConnected,
    account,
    balance,
    chain,
    usdcAddress,
    flashArcPayAddress,

    // Methods
    initializeAppKit,
    connectWallet,
    disconnectWallet,
    fetchBalance,
    sendUSDC,
    getUnifiedBalance,
    bridgeUSDC,
    payMerchant,
    listenToPaymentEvent,
    addArcNetwork,
    openWalletApp,
    isMobile,
    isMetaMaskBrowser,
  };
};
