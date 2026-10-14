<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from "vue";
import { useArcAppKit } from "~/composables/useArcAppKit";
import { usePaymentHistory, type PaymentEvent, type StatsData } from "~/composables/usePaymentHistory";
import { ArrowLeft, DollarSign, Calendar, TrendingUp, ExternalLink, RefreshCw, Wallet, Search, X, Filter, Eye, EyeOff } from "lucide-vue-next";

const router = useRouter();

const { connectWallet, isConnected, account, balance, isMobile, openWalletApp, isMetaMaskBrowser, disconnectWallet, fetchBalance } = useArcAppKit();
const { initializeClient, getCustomerHistory, calculateStats, watchNewPayments } = usePaymentHistory();

// Determine network type (mainnet or testnet)
const chainId = Number(import.meta.env.VITE_ARC_CHAIN_ID || 5042);
const isMainnet = computed(() => chainId === 5042);
const networkName = computed(() => isMainnet.value ? "Arc Mainnet" : "Arc Testnet");

// State
const loading = ref(false);
const loadingMore = ref(false);
const error = ref("");
const transactions = ref<PaymentEvent[]>([]);
const stats = ref<StatsData>({
  total: 0n,
  today: 0n,
  count: 0,
  todayCount: 0,
});
const currentFromBlock = ref<bigint | null>(null);
const hasMore = ref(true);
const statUpdateAnimation = ref<string | null>(null);
const loadingProgress = ref<string>("Initializing...");

// Cache key and duration (5 minutes)
const CACHE_KEY = (address: string) => `payment_history_${address.toLowerCase()}`;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

/**
 * Get cached transactions from localStorage
 */
const getCachedTransactions = (address: string): { transactions: PaymentEvent[], timestamp: number } | null => {
  try {
    const cached = localStorage.getItem(CACHE_KEY(address));
    if (!cached) return null;

    const data = JSON.parse(cached);
    const now = Date.now();

    // Check if cache is still valid
    if (now - data.timestamp > CACHE_DURATION) {
      localStorage.removeItem(CACHE_KEY(address));
      return null;
    }

    // Convert strings back to BigInt
    const transactions = data.transactions.map((tx: any) => ({
      ...tx,
      amount: BigInt(tx.amount),
      timestamp: BigInt(tx.timestamp),
      blockNumber: BigInt(tx.blockNumber),
    }));

    return { transactions, timestamp: data.timestamp };
  } catch (error) {
    console.error("Failed to read cache:", error);
    return null;
  }
};

/**
 * Save transactions to cache
 */
const saveCachedTransactions = (address: string, transactions: PaymentEvent[]) => {
  try {
    // Convert BigInt to string for JSON serialization
    const serializableTransactions = transactions.map(tx => ({
      ...tx,
      amount: tx.amount.toString(),
      timestamp: tx.timestamp.toString(),
      blockNumber: tx.blockNumber.toString(),
    }));

    const data = {
      transactions: serializableTransactions,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_KEY(address), JSON.stringify(data));
  } catch (error) {
    console.error("Failed to save cache:", error);
  }
};

/**
 * Clear cache for specific address
 */
const clearCache = (address: string) => {
  try {
    localStorage.removeItem(CACHE_KEY(address));
  } catch (error) {
    console.error("Failed to clear cache:", error);
  }
};

// Filter and search state
const showFilters = ref(false);
const searchQuery = ref("");
const dateFrom = ref("");
const dateTo = ref("");
const statusFilter = ref<"all" | "success" | "failed">("all");

// Privacy mode state
const hideBalance = ref(false);

// Wallet connection error
const connectionError = ref("");
const isMobileDevice = ref(false);

// Wallet modal state
const showWalletModal = ref(false);

// Instructions accordion state
const showInstructions = ref(false);

// Cleanup function for event watcher
let unwatch: (() => void) | null = null;

// Check if mobile on mount
onMounted(async () => {
  isMobileDevice.value = isMobile();
  
  // If in MetaMask browser, try to connect automatically
  if (isMetaMaskBrowser()) {
    try {
      await connectWallet();
    } catch (error) {
      console.error("Failed to connect wallet:", error);
    }
  }
});

// Connect wallet and load history
onMounted(async () => {
  try {
    await connectWallet();
    if (account.value) {
      await loadHistory();
    }
  } catch (error: any) {
    console.error("Failed to connect wallet:", error);
    connectionError.value = error.message || "Failed to connect wallet";
  }

  // Add scroll listener for infinite scroll
  window.addEventListener('scroll', handleScroll);
});

// Cleanup on unmount
onUnmounted(() => {
  if (unwatch) {
    unwatch();
  }
  window.removeEventListener('scroll', handleScroll);
});

/**
 * Load customer payment history
 */
const loadHistory = async (forceRefresh: boolean = false) => {
  if (!account.value) {
    error.value = "Please connect your wallet first";
    return;
  }

  loading.value = true;
  error.value = "";
  loadingProgress.value = "Checking cache...";

  try {
    // Try to load from cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = getCachedTransactions(account.value);
      if (cached) {
        loadingProgress.value = "Loading from cache...";
        transactions.value = cached.transactions;
        stats.value = calculateStats(transactions.value);
        // Assume there might be more data if cache exists
        hasMore.value = true;

        // Start watching for new payments
        startWatching();

        loadingProgress.value = "Complete";
        loading.value = false;
        return;
      }
    }

    // Initialize public client
    const publicClient = initializeClient();

    loadingProgress.value = "Fetching current block number...";
    // Get current block number
    const currentBlock = await publicClient.getBlockNumber();

    loadingProgress.value = "Fetching complete transaction history...";
    // Fetch from genesis block (0) to get complete history (Blockscout API has no rate limit)
    const fromBlock = 0n;

    currentFromBlock.value = fromBlock;

    // Fetch with high limit to capture all transactions
    transactions.value = await getCustomerHistory(
      account.value,
      fromBlock,
      currentBlock,
      1000 // High limit to capture all transactions
    );

    loadingProgress.value = "Calculating statistics...";
    // Calculate stats
    stats.value = calculateStats(transactions.value);

    // Save to cache
    saveCachedTransactions(account.value, transactions.value);

    // No more data since we started from block 0
    hasMore.value = false;

    loadingProgress.value = "Setting up real-time updates...";
    // Start watching for new payments
    startWatching();

    loadingProgress.value = "Complete";
  } catch (err: any) {
    console.error("Failed to load history:", err);
    error.value = err.message || "Failed to load payment history";
  } finally {
    loading.value = false;
  }
};

/**
 * Load more transactions (infinite scroll - load older transactions)
 */
const loadMore = async () => {
  if (loadingMore.value || !hasMore.value || !account.value) return;

  loadingMore.value = true;

  try {
    // Since we're using Blockscout API and fetching from block 0, no more to load
    hasMore.value = false;
  } catch (err: any) {
    console.error("Failed to load more:", err);
  } finally {
    loadingMore.value = false;
  }
};

/**
 * Handle scroll event for infinite scroll
 */
const handleScroll = () => {
  const scrollTop = window.scrollY;
  const windowHeight = window.innerHeight;
  const documentHeight = document.documentElement.scrollHeight;

  // Load more when user is near bottom (200px from bottom)
  if (scrollTop + windowHeight >= documentHeight - 200) {
    loadMore();
  }
};

/**
 * Start watching for new payments
 */
const startWatching = () => {
  if (!account.value) return;

  unwatch = watchNewPayments(account.value, "customer", (event) => {
    // Add new transaction to the top of the list
    transactions.value.unshift(event);

    // Keep all transactions (no limit, since we're lazy loading older ones)
    // Only limit to prevent memory issues (keep last 500)
    if (transactions.value.length > 500) {
      transactions.value = transactions.value.slice(0, 500);
    }

    // Recalculate stats
    const oldStats = { ...stats.value };
    stats.value = calculateStats(transactions.value);

    // Update cache with new transaction
    if (account.value) {
      saveCachedTransactions(account.value, transactions.value);
    }

    // Trigger animation for changed stats
    if (stats.value.total !== oldStats.total) {
      statUpdateAnimation.value = 'total';
      setTimeout(() => statUpdateAnimation.value = null, 500);
    }
    if (stats.value.today !== oldStats.today) {
      statUpdateAnimation.value = 'today';
      setTimeout(() => statUpdateAnimation.value = null, 500);
    }
    if (stats.value.count !== oldStats.count) {
      statUpdateAnimation.value = 'count';
      setTimeout(() => statUpdateAnimation.value = null, 500);
    }
    if (stats.value.todayCount !== oldStats.todayCount) {
      statUpdateAnimation.value = 'todayCount';
      setTimeout(() => statUpdateAnimation.value = null, 500);
    }
  });
};

/**
 * Handle wallet connection
 */
const handleConnectWallet = async () => {
  try {
    connectionError.value = "";
    await connectWallet();
    if (account.value) {
      await loadHistory();
    }
  } catch (error: any) {
    console.error("Failed to connect wallet:", error);
    connectionError.value = error.message || "Failed to connect wallet";
  }
};

/**
 * Handle wallet selection from modal
 */
const handleWalletSelect = async (walletType: string, openInApp: boolean) => {
  try {
    connectionError.value = "";
    
    switch (walletType) {
      case "metamask":
        if (isMobileDevice.value && !isMetaMaskBrowser()) {
          // Mobile: always need to open MetaMask (either app or browser)
          openWalletApp("metamask");
        } else {
          // Desktop or already in MetaMask browser: connect directly
          await handleConnectWallet();
        }
        break;
      case "walletconnect":
        connectionError.value = "WalletConnect integration coming soon. Please use MetaMask for now.";
        break;
      case "coinbase":
        if (isMobileDevice.value && !isMetaMaskBrowser()) {
          // Mobile: always need to open Coinbase
          openWalletApp("coinbase");
        } else {
          // Desktop: connect directly
          await handleConnectWallet();
        }
        break;
      case "binance":
        connectionError.value = "Binance Wallet integration coming soon. Please use MetaMask for now.";
        break;
      default:
        await handleConnectWallet();
    }
  } catch (error: any) {
    console.error("Failed to connect wallet:", error);
    connectionError.value = error.message || "Failed to connect wallet";
  }
};

/**
 * Format address for display
 */
const formatAddress = (address: string) => {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

/**
 * Format USDC amount (6 decimals)
 */
const formatUSDC = (amount: bigint) => {
  return (Number(amount) / 1000000).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

/**
 * Format balance for display
 */
const formatBalance = (balance: bigint) => {
  return (Number(balance) / 1000000).toFixed(2);
};

/**
 * Get masked balance for privacy
 */
const getMaskedBalance = (balance: bigint) => {
  const formatted = formatBalance(balance);
  return '•••• USDC';
};

/**
 * Toggle balance visibility
 */
const toggleBalanceVisibility = () => {
  hideBalance.value = !hideBalance.value;
};

/**
 * Format timestamp
 */
const formatTimestamp = (timestamp: bigint) => {
  const date = new Date(Number(timestamp) * 1000);
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/**
 * Navigate to receipt page
 */
const viewReceipt = (txHash: string) => {
  router.push(`/receipt?txHash=${txHash}`);
};

/**
 * Refresh history (force refresh from blockchain)
 */
const refreshHistory = async () => {
  // Clear cache for current address
  if (account.value) {
    clearCache(account.value);
  }
  // Force refresh by passing true
  await loadHistory(true);
};

/**
 * Filter transactions based on search and filters
 */
const filteredTransactions = computed(() => {
  let filtered = [...transactions.value];

  // Search by order ID
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    filtered = filtered.filter(tx => 
      tx.orderId.toLowerCase().includes(query) ||
      tx.transactionHash.toLowerCase().includes(query)
    );
  }

  // Filter by date range
  if (dateFrom.value) {
    const fromDate = new Date(dateFrom.value).getTime();
    filtered = filtered.filter(tx => {
      const txDate = Number(tx.timestamp) * 1000;
      return txDate >= fromDate;
    });
  }

  if (dateTo.value) {
    const toDate = new Date(dateTo.value).getTime();
    // Set to end of day
    const endOfDay = toDate + 24 * 60 * 60 * 1000 - 1;
    filtered = filtered.filter(tx => {
      const txDate = Number(tx.timestamp) * 1000;
      return txDate <= endOfDay;
    });
  }

  // Filter by status
  if (statusFilter.value !== "all") {
    // For now, all blockchain transactions are success
    // If filtering for failed, return empty array
    if (statusFilter.value === "failed") {
      filtered = [];
    }
    // If filtering for success, keep all (since all are success)
    // This logic can be enhanced in the future if status tracking is added
  }

  return filtered.sort((a, b) => Number(b.timestamp - a.timestamp));
});

/**
 * Clear all filters
 */
const clearFilters = () => {
  searchQuery.value = "";
  dateFrom.value = "";
  dateTo.value = "";
  statusFilter.value = "all";
};

/**
 * Get filtered stats
 */
const filteredStats = computed(() => {
  return calculateStats(filteredTransactions.value);
});

/**
 * Get display stats (respecting privacy mode)
 */
const displayStats = computed(() => {
  if (hideBalance.value) {
    return {
      total: 0n,
      today: 0n,
      count: filteredStats.value.count,
      todayCount: filteredStats.value.todayCount,
    };
  }
  return filteredStats.value;
});
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 p-4">
    <div class="max-w-6xl mx-auto">
      <!-- Header with Integrated Wallet Info -->
      <div class="bg-white/5 backdrop-blur-lg rounded-xl px-4 py-3 mb-6 border-b border-white/20">
        <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <!-- Left: Title & Back -->
          <div class="flex flex-col items-start sm:flex-row sm:items-center gap-2 sm:gap-3">
            <button
              @click="router.push('/')"
              class="flex items-center gap-2 text-white hover:text-purple-200 transition-colors whitespace-nowrap"
            >
              <ArrowLeft :size="20" />
              <span class="text-sm font-medium">Back to Home</span>
            </button>
            <h1 class="text-xl lg:text-2xl font-bold text-white">Customer Payment History</h1>
          </div>

          <!-- Center: Wallet Status (when connected) -->
          <div v-if="isConnected" class="flex flex-wrap items-center justify-center gap-3 bg-white/10 rounded-xl sm:rounded-full px-5 py-2">
            <div class="flex items-center gap-2">
              <div class="w-2 h-2 rounded-full bg-green-500"></div>
              <span class="text-green-400 text-xs font-medium">Connected</span>
            </div>
            <div class="hidden sm:block h-4 w-px bg-white/20"></div>
            <div class="text-right flex items-center gap-2">
              <p class="text-purple-300 text-xs">Balance</p>
              <button
                @click="toggleBalanceVisibility"
                class="text-purple-400 hover:text-purple-300 transition-colors"
                title="Toggle balance visibility"
              >
                <EyeOff v-if="hideBalance" :size="14" />
                <Eye v-else :size="14" />
              </button>
              <p class="text-white font-semibold text-sm" :class="{ 'blur-sm': hideBalance }">
                {{ hideBalance ? getMaskedBalance(balance) : formatBalance(balance) }} USDC
              </p>
            </div>
            <div class="hidden sm:block h-4 w-px bg-white/20"></div>
            <div class="text-purple-200 text-xs font-mono w-full sm:w-auto text-center">
              {{ formatAddress(account || "") }}
            </div>
          </div>

          <!-- Right: Actions -->
          <div class="flex items-center gap-2">
            <button
              v-if="isConnected"
              @click="disconnectWallet"
              class="bg-red-600/20 hover:bg-red-600/40 text-red-400 hover:text-red-300 font-medium py-2 px-4 rounded-full transition-all duration-300 flex items-center gap-2 text-xs border border-red-500/30 whitespace-nowrap"
              title="Disconnect Wallet"
            >
              <Wallet :size="14" />
              <span class="inline">Disconnect</span>
            </button>
            <button
              @click="refreshHistory"
              :disabled="loading"
              class="bg-purple-600/20 hover:bg-purple-600/40 text-purple-400 hover:text-purple-300 font-medium py-2 px-4 rounded-full transition-all duration-300 flex items-center gap-2 text-xs border border-purple-500/30 disabled:opacity-50 whitespace-nowrap"
              title="Refresh History"
            >
              <RefreshCw :size="14" :class="{ 'animate-spin': loading }" />
              <span class="inline">Refresh</span>
            </button>
          </div>
        </div>

        <!-- Mobile Connection (when not connected) -->
        <div v-if="!isConnected" class="mt-3 flex items-center justify-center gap-3">
          <div class="w-2 h-2 rounded-full bg-red-500"></div>
          <span class="text-red-400 text-sm">Not Connected</span>
          <button
            @click="showWalletModal = true"
            class="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-full transition-colors flex items-center gap-2 text-xs"
          >
            <Wallet :size="14" />
            Connect Wallet
          </button>
        </div>
      </div>

      <!-- Instructions for wallet connection - Collapsible -->
      <div v-if="!isConnected" class="bg-blue-500/20 border border-blue-500 rounded-xl p-4 mb-6">
        <button
          @click="showInstructions = !showInstructions"
          class="w-full flex items-center justify-between text-left"
        >
          <h3 class="text-white font-semibold flex items-center gap-2">
            <Wallet :size="20" />
            {{ isMobileDevice ? 'Mobile Wallet Instructions' : 'Desktop Wallet Instructions' }}
          </h3>
          <span class="text-white text-2xl transition-transform" :class="{ 'rotate-180': showInstructions }">
            ▼
          </span>
        </button>

        <div v-show="showInstructions" class="mt-3 transition-all">
          <ol v-if="!isMobileDevice" class="text-white text-sm space-y-2 list-decimal list-inside leading-relaxed">
            <li>Install a Web3 wallet extension (MetaMask, Coinbase Wallet, etc.)</li>
            <li>Open the wallet extension and <strong>unlock</strong> it with your password</li>
            <li>Make sure at least one account is visible and unlocked</li>
            <li>Click the <strong>"Connect Wallet"</strong> button above</li>
            <li>Select your preferred wallet from the popup menu</li>
            <li>Approve the connection request in your wallet</li>
            <li>The app will automatically add {{ networkName }} to your wallet</li>
          </ol>
          <ol v-else class="text-white text-sm space-y-2 list-decimal list-inside leading-relaxed">
            <li>Install a Web3 wallet app (MetaMask, Coinbase Wallet, Trust Wallet, etc.)</li>
            <li>Open the wallet app and set up your account</li>
            <li>Click the <strong>"Connect Wallet"</strong> button above</li>
            <li>Select your preferred wallet from the popup menu</li>
            <li>You'll be redirected to MetaMask browser with this dApp loaded</li>
            <li>Approve the connection in the wallet</li>
            <li>The app will automatically add {{ networkName }} to your wallet</li>
          </ol>
        </div>
      </div>

      <!-- Connection Error -->
      <div
        v-if="connectionError"
        class="bg-red-500/20 border border-red-500 rounded-xl p-4 mb-6"
      >
        <p class="text-white">{{ connectionError }}</p>
      </div>

      <!-- Error Message -->
      <div v-if="error" class="bg-red-500/20 border border-red-500 rounded-xl p-4 mb-6">
        <p class="text-white">{{ error }}</p>
      </div>

      <!-- Connection Error -->
      <div
        v-if="connectionError"
        class="bg-red-500/20 border border-red-500 rounded-xl p-4 mb-6"
      >
        <p class="text-white">{{ connectionError }}</p>
      </div>

      <!-- Filters Section -->
      <div v-if="isConnected" class="bg-white/10 backdrop-blur-lg rounded-xl p-4 mb-6 border border-white/20">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-bold text-white flex items-center gap-2">
            <Filter :size="20" />
            Filters
          </h3>
          <button
            @click="showFilters = !showFilters"
            class="text-purple-200 hover:text-white transition-colors"
          >
            {{ showFilters ? 'Hide' : 'Show' }}
          </button>
        </div>

        <div v-if="showFilters" class="space-y-4">
          <!-- Search -->
          <div class="flex gap-2">
            <div class="flex-1 relative">
              <Search :size="20" class="absolute left-3 top-1/2 transform -translate-y-1/2 text-purple-300" />
              <input
                v-model="searchQuery"
                type="text"
                placeholder="Search by Order ID or Tx Hash"
                class="w-full bg-white/10 border border-white/20 rounded-lg pl-10 pr-4 py-2 text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <button
              v-if="searchQuery"
              @click="searchQuery = ''"
              class="text-purple-400 hover:text-white transition-colors"
            >
              <X :size="20" />
            </button>
          </div>

          <!-- Date Range -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-purple-200 text-sm mb-1">From Date</label>
              <input
                v-model="dateFrom"
                type="date"
                class="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div>
              <label class="block text-purple-200 text-sm mb-1">To Date</label>
              <input
                v-model="dateTo"
                type="date"
                class="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          <!-- Status Filter -->
          <div>
            <label class="block text-purple-200 text-sm mb-1">Status</label>
            <select
              v-model="statusFilter"
              class="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              style="background-color: rgba(255, 255, 255, 0.1); color: white;"
            >
              <option value="all" style="background-color: #1f2937; color: white;">All Status</option>
              <option value="success" style="background-color: #1f2937; color: white;">Success</option>
              <option value="failed" style="background-color: #1f2937; color: white;">Failed</option>
            </select>
          </div>

          <!-- Clear Filters -->
          <button
            @click="clearFilters"
            class="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
          >
            Clear All Filters
          </button>
        </div>
      </div>

      <!-- Stats Cards -->
      <div v-if="isConnected && !loading" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <!-- Total Spent -->
        <div 
          :class="[
            'bg-gradient-to-br from-green-500/20 to-green-600/20 backdrop-blur-lg rounded-xl p-6 border border-green-500/30 transition-all duration-300',
            statUpdateAnimation === 'total' ? 'scale-105 brightness-110' : ''
          ]"
        >
          <div class="flex items-center gap-3 mb-2">
            <DollarSign :size="24" class="text-green-400" />
            <span class="text-green-200 text-sm font-medium">Total Spent</span>
          </div>
          <p class="text-3xl font-bold text-white">{{ hideBalance ? '••••' : formatUSDC(displayStats.total) }} USDC</p>
        </div>

        <!-- Today's Spent -->
        <div 
          :class="[
            'bg-gradient-to-br from-blue-500/20 to-blue-600/20 backdrop-blur-lg rounded-xl p-6 border border-blue-500/30 transition-all duration-300',
            statUpdateAnimation === 'today' ? 'scale-105 brightness-110' : ''
          ]"
        >
          <div class="flex items-center gap-3 mb-2">
            <Calendar :size="24" class="text-blue-400" />
            <span class="text-blue-200 text-sm font-medium">Today's Spent</span>
          </div>
          <p class="text-3xl font-bold text-white">{{ hideBalance ? '••••' : formatUSDC(displayStats.today) }} USDC</p>
        </div>

        <!-- Total Transactions -->
        <div 
          :class="[
            'bg-gradient-to-br from-purple-500/20 to-purple-600/20 backdrop-blur-lg rounded-xl p-6 border border-purple-500/30 transition-all duration-300',
            statUpdateAnimation === 'count' ? 'scale-105 brightness-110' : ''
          ]"
        >
          <div class="flex items-center gap-3 mb-2">
            <TrendingUp :size="24" class="text-purple-400" />
            <span class="text-purple-200 text-sm font-medium">Total Transactions</span>
          </div>
          <p class="text-3xl font-bold text-white">{{ filteredStats.count }}</p>
        </div>

        <!-- Today's Transactions -->
        <div 
          :class="[
            'bg-gradient-to-br from-orange-500/20 to-orange-600/20 backdrop-blur-lg rounded-xl p-6 border border-orange-500/30 transition-all duration-300',
            statUpdateAnimation === 'todayCount' ? 'scale-105 brightness-110' : ''
          ]"
        >
          <div class="flex items-center gap-3 mb-2">
            <Calendar :size="24" class="text-orange-400" />
            <span class="text-orange-200 text-sm font-medium">Today's Transactions</span>
          </div>
          <p class="text-3xl font-bold text-white">{{ filteredStats.todayCount }}</p>
        </div>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="bg-white/10 backdrop-blur-lg rounded-xl p-8 border border-white/20">
        <div class="flex flex-col items-center justify-center gap-4">
          <RefreshCw :size="32" class="text-purple-400 animate-spin" />
          <span class="text-white">{{ loadingProgress }}</span>
          <p class="text-purple-200 text-sm">Loading complete transaction history...</p>
        </div>
      </div>

      <!-- Transaction List -->
      <div v-else-if="isConnected && filteredTransactions.length > 0" class="bg-white/10 backdrop-blur-lg rounded-xl border border-white/20 overflow-hidden">
        <div class="p-6 border-b border-white/20">
          <h2 class="text-xl font-bold text-white">
            Recent Transactions
            <span v-if="filteredTransactions.length !== transactions.length" class="text-purple-200 text-sm ml-2">
              ({{ filteredTransactions.length }} of {{ transactions.length }})
            </span>
          </h2>
        </div>
        
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead class="bg-white/5">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-purple-200 uppercase tracking-wider">Order ID</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-purple-200 uppercase tracking-wider">Amount</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-purple-200 uppercase tracking-wider">Merchant</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-purple-200 uppercase tracking-wider">Timestamp</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-purple-200 uppercase tracking-wider">Status</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-purple-200 uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-white/10">
              <tr
                v-for="tx in filteredTransactions"
                :key="tx.transactionHash"
                class="hover:bg-white/5 transition-colors"
              >
                <td class="px-6 py-4 whitespace-nowrap text-sm text-white">
                  {{ tx.orderId }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-white font-medium">
                  {{ formatUSDC(tx.amount) }} USDC
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-purple-200">
                  {{ formatAddress(tx.merchant) }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-purple-200">
                  {{ formatTimestamp(tx.timestamp) }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-400">
                    Success
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm">
                  <button
                    @click="viewReceipt(tx.transactionHash)"
                    class="text-purple-400 hover:text-purple-300 transition-colors flex items-center gap-1"
                  >
                    <ExternalLink :size="16" />
                    View Receipt
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Load More Indicator -->
        <div v-if="loadingMore" class="flex items-center justify-center p-4">
          <RefreshCw :size="24" class="text-purple-400 animate-spin" />
          <span class="ml-3 text-white">Loading more transactions...</span>
        </div>

        <!-- No More Data Indicator -->
        <div v-else-if="!hasMore && transactions.length > 0" class="text-center p-4 text-purple-200">
          No more transactions to load
        </div>
      </div>

      <!-- Empty State -->
      <div v-else-if="isConnected && filteredTransactions.length === 0" class="bg-white/10 backdrop-blur-lg rounded-xl p-12 border border-white/20 text-center">
        <DollarSign :size="48" class="text-purple-400 mx-auto mb-4" />
        <h3 class="text-xl font-bold text-white mb-2">No Payments Found</h3>
        <p class="text-purple-200">{{ transactions.length === 0 ? 'Make your first payment to see your transaction history here.' : 'Try adjusting your filters to see more transactions.' }}</p>
      </div>

      <!-- Not Connected State -->
      <div v-else class="bg-white/10 backdrop-blur-lg rounded-xl p-12 border border-white/20 text-center">
        <Wallet :size="48" class="text-purple-400 mx-auto mb-4" />
        <h3 class="text-xl font-bold text-white mb-2">Connect Your Wallet</h3>
        <p class="text-purple-200">Connect your wallet to view your payment history.</p>
      </div>
    </div>

    <!-- Wallet Connect Modal -->
    <WalletConnectModal
      :is-open="showWalletModal"
      :is-mobile="isMobileDevice"
      @close="showWalletModal = false"
      @select-wallet="handleWalletSelect"
    />
  </div>
</template>
