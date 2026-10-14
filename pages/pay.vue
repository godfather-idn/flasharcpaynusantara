<script setup lang="ts">
import { ref, onMounted, computed, watch } from "vue";
import { parseUnits } from "viem";
import { useArcAppKit } from "~/composables/useArcAppKit";
import { ArrowLeft, Wallet, CheckCircle2, Loader2, XCircle, DollarSign, Hash, User, Receipt, History, Copy } from "lucide-vue-next";

const router = useRouter();
const route = useRoute();

const {
  connectWallet,
  isConnected,
  account,
  balance,
  payMerchant,
  fetchBalance,
  chain,
  flashArcPayAddress,
  openWalletApp,
  isMobile,
  isMetaMaskBrowser,
} = useArcAppKit();

// Determine network type (mainnet or testnet)
const chainId = Number(import.meta.env.VITE_ARC_CHAIN_ID || 5042);
const isMainnet = computed(() => chainId === 5042);
const networkLabel = computed(() => isMainnet.value ? "Mainnet" : "Testnet");
const networkName = computed(() => isMainnet.value ? "Arc Mainnet" : "Arc Testnet");

// Payment details from URL
const merchantAddress = ref<`0x${string}` | "">("");
const amount = ref("");
const orderId = ref("");

// Payment state
const paymentStatus = ref<"idle" | "processing" | "success" | "error">("idle");
const paymentMessage = ref("");
const transactionHash = ref("");
const isConnecting = ref(false);

// Wallet modal state
const showWalletModal = ref(false);

// Mobile detection
const isMobileDevice = ref(false);

// Instructions accordion state
const showInstructions = ref(false);

watch(isConnected, (newVal) => {
  if (newVal && paymentStatus.value === 'error' && paymentMessage.value.includes('connect wallet')) {
    paymentStatus.value = 'idle';
    paymentMessage.value = '';
  }
});

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    console.error('Failed to copy', err);
  }
};

// Parse URL parameters on mount
onMounted(() => {
  isMobileDevice.value = isMobile();
  
  if (route.query.merchant) {
    merchantAddress.value = route.query.merchant as `0x${string}`;
  }
  if (route.query.amount) {
    amount.value = route.query.amount as string;
  }
  if (route.query.orderId) {
    orderId.value = route.query.orderId as string;
  }

  // Validate parameters
  if (!merchantAddress.value || !amount.value || !orderId.value) {
    paymentStatus.value = "error";
    paymentMessage.value = "Invalid payment parameters. Please scan a valid QR code.";
  }
});

/**
 * Connect wallet
 */
const handleConnectWallet = async () => {
  isConnecting.value = true;
  if (paymentStatus.value === 'error' && paymentMessage.value.includes('connect wallet')) {
    paymentStatus.value = 'idle';
    paymentMessage.value = '';
  }
  try {
    await connectWallet();
    await fetchBalance();
  } catch (error) {
    console.error("Failed to connect wallet:", error);
    paymentStatus.value = "error";
    paymentMessage.value = "Failed to connect wallet. Please try again.";
  } finally {
    isConnecting.value = false;
  }
};

/**
 * Handle wallet selection from modal
 */
const handleWalletSelect = async (walletType: string, openInApp: boolean) => {
  try {
    isConnecting.value = true;
    
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
        paymentStatus.value = "error";
        paymentMessage.value = "WalletConnect integration coming soon. Please use MetaMask for now.";
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
        paymentStatus.value = "error";
        paymentMessage.value = "Binance Wallet integration coming soon. Please use MetaMask for now.";
        break;
      default:
        await handleConnectWallet();
    }
  } catch (error: any) {
    console.error("Failed to connect wallet:", error);
    paymentStatus.value = "error";
    paymentMessage.value = error.message || "Failed to connect wallet. Please try again.";
  } finally {
    isConnecting.value = false;
  }
};

/**
 * Process payment
 */
const handlePayment = async () => {
  if (!isConnected.value || !merchantAddress.value || !amount.value || !orderId.value) {
    return;
  }

  // Validate and parse amount
  const amountNum = parseFloat(amount.value);
  console.log("Amount value:", amount.value, "Parsed:", amountNum);
  
  if (isNaN(amountNum) || amountNum <= 0) {
    paymentStatus.value = "error";
    paymentMessage.value = "Invalid amount. Please enter a valid number greater than 0.";
    return;
  }

  // Check if user has sufficient balance
  const amountInWei = parseUnits(amountNum.toString(), 6);
  console.log("Amount in wei (6 decimals):", amountInWei.toString());
  console.log("Current balance:", balance.value.toString());
  
  if (balance.value < amountInWei) {
    paymentStatus.value = "error";
    paymentMessage.value = "Insufficient USDC balance. Please top up your wallet.";
    return;
  }

  paymentStatus.value = "processing";
  paymentMessage.value = "Processing payment...";

  try {
    console.log("Order ID:", orderId.value);
    console.log("Merchant address:", merchantAddress.value);
    console.log("Contract address:", flashArcPayAddress.value);
    
    const hash = await payMerchant(
      merchantAddress.value,
      orderId.value,
      amountInWei
    );

    console.log("Transaction hash:", hash);
    transactionHash.value = hash;
    paymentStatus.value = "success";
    paymentMessage.value = "Payment successful!";
  } catch (error: any) {
    console.error("Payment failed:", error);
    console.error("Error details:", error.message);
    console.error("Error code:", error.code);
    console.error("Error data:", error.data);
    
    paymentStatus.value = "error";
    
    // Provide more specific error messages
    if (error.message.includes("insufficient funds") || error.message.includes("exceeds balance")) {
      paymentMessage.value = "Insufficient USDC balance for gas. Please ensure you have enough USDC for both payment and gas fees.";
    } else if (error.message.includes("user rejected")) {
      paymentMessage.value = "Transaction rejected. Please approve the transaction in MetaMask.";
    } else if (error.message.includes("execution reverted")) {
      paymentMessage.value = "Transaction reverted by contract. Please check the transaction details for more information.";
    } else if (error.message.includes("chain") || error.code === -32603 || error.message.includes("network")) {
      paymentMessage.value = `Wallet is not connected to ${networkName.value}. Please switch your wallet network to ${networkName.value} (Chain ID: ${chainId}).`;
    } else {
      paymentMessage.value = `Payment failed: ${error.message || "Unknown error"}`;
    }
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
 * Format balance for display
 */
const formatBalance = (balance: bigint) => {
  return (Number(balance) / 1000000).toFixed(2);
};

/**
 * Computed property to check if payment can be processed
 */
const canProcessPayment = computed(() => {
  return (
    isConnected.value &&
    merchantAddress.value &&
    amount.value &&
    orderId.value &&
    paymentStatus.value !== "processing" &&
    paymentStatus.value !== "success"
  );
});
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 p-4">
    <div class="max-w-2xl mx-auto">
      <!-- Header -->
      <div class="relative flex items-center justify-center mb-8">
        <button
          @click="router.push('/')"
          class="absolute left-0 p-2 -ml-2 flex items-center gap-2 text-white hover:text-purple-200 transition-colors"
        >
          <ArrowLeft :size="28" />
          <span class="font-medium text-lg">Back</span>
        </button>
        <h1 class="text-3xl font-bold text-white">Payment</h1>
      </div>

      <!-- Payment Details Card -->
      <div class="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20 mb-6">
        <h2 class="text-2xl font-bold text-white mb-6">Payment Details</h2>
        
        <div class="space-y-4">
          <!-- Merchant Address -->
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <User :size="20" class="text-purple-300" />
              <div>
                <p class="text-purple-200 text-sm">Merchant</p>
                <p class="text-white font-semibold">
                  {{ merchantAddress ? formatAddress(merchantAddress) : "N/A" }}
                </p>
              </div>
            </div>
            <button v-if="merchantAddress" @click="copyToClipboard(merchantAddress)" class="p-2 hover:bg-white/10 rounded-lg text-purple-300 transition-colors" title="Copy Address">
              <Copy :size="18" />
            </button>
          </div>

          <!-- Amount -->
          <div class="flex items-center gap-3">
            <DollarSign :size="20" class="text-purple-300" />
            <div>
              <p class="text-purple-200 text-sm">Amount</p>
              <p class="text-white font-semibold">{{ amount }} USDC</p>
            </div>
          </div>

          <!-- Order ID -->
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <Hash :size="20" class="text-purple-300" />
              <div>
                <p class="text-purple-200 text-sm">Order ID</p>
                <p class="text-white font-semibold">{{ orderId }}</p>
              </div>
            </div>
            <button v-if="orderId" @click="copyToClipboard(orderId)" class="p-2 hover:bg-white/10 rounded-lg text-purple-300 transition-colors" title="Copy Order ID">
              <Copy :size="18" />
            </button>
          </div>
        </div>
      </div>

      <!-- Wallet Connection Card - Single Connect Pattern -->
      <div class="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 mb-6">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xl font-bold text-white">Wallet</h2>
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium" :class="isConnected ? 'text-green-400' : 'text-red-400'">
              {{ isConnected ? 'Connected' : 'Not Connected' }}
            </span>
            <div
              :class="isConnected ? 'bg-green-500' : 'bg-red-500'"
              class="w-3 h-3 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.3)]"
              :style="isConnected ? 'box-shadow: 0 0 8px #22c55e' : 'box-shadow: 0 0 8px #ef4444'"
            ></div>
          </div>
        </div>

        <div v-if="isConnected" class="space-y-4">
          <div>
            <p class="text-purple-200 text-sm">Connected Address</p>
            <p class="text-white font-semibold">{{ formatAddress(account || "") }}</p>
          </div>
          <div>
            <p class="text-purple-200 text-sm">USDC Balance</p>
            <p class="text-white font-semibold">{{ formatBalance(balance) }} USDC</p>
          </div>
        </div>

        <div v-else>
          <p class="text-purple-200 mb-4 text-sm">Connect your wallet to proceed with payment</p>
          <button
            @click="showWalletModal = true"
            :disabled="isConnecting"
            class="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <Loader2 v-if="isConnecting" class="animate-spin" :size="20" />
            <Wallet v-else :size="20" />
            {{ isConnecting ? 'Connecting...' : 'Connect Wallet' }}
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

      <!-- Payment Status Card -->
      <div
        v-if="paymentStatus !== 'idle'"
        :class="{
          'bg-green-500/20 border-green-500': paymentStatus === 'success',
          'bg-yellow-500/20 border-yellow-500': paymentStatus === 'processing',
          'bg-red-500/20 border-red-500': paymentStatus === 'error',
        }"
        class="backdrop-blur-lg rounded-xl p-6 border mb-6"
      >
        <div class="flex items-center gap-3">
          <CheckCircle2 v-if="paymentStatus === 'success'" :size="24" class="text-green-400" />
          <Loader2 v-if="paymentStatus === 'processing'" :size="24" class="text-yellow-400 animate-spin" />
          <XCircle v-if="paymentStatus === 'error'" :size="24" class="text-red-400" />
          <span class="text-white font-semibold">{{ paymentMessage }}</span>
        </div>
        
        <div v-if="transactionHash" class="mt-4">
          <p class="text-purple-200 text-sm">Transaction Hash</p>
          <p class="text-white text-sm break-all">{{ transactionHash }}</p>
        </div>
      </div>

      <!-- Payment Button -->
      <button
        v-if="canProcessPayment"
        @click="handlePayment"
        class="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold py-4 px-6 rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl"
      >
        Pay {{ amount }} USDC
      </button>

      <!-- Success State - Action Buttons -->
      <div v-if="paymentStatus === 'success'" class="space-y-3 mt-4">
        <button
          @click="router.push(`/receipt?txHash=${transactionHash}`)"
          class="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-6 rounded-xl transition-all duration-300 flex items-center justify-center gap-2"
        >
          <Receipt :size="20" />
          View Receipt
        </button>
        
        <button
          @click="router.push('/customer-history')"
          class="w-full bg-white/10 hover:bg-white/20 text-white font-bold py-4 px-6 rounded-xl transition-all duration-300 border border-white/20 flex items-center justify-center gap-2"
        >
          <History :size="20" />
          View Payment History
        </button>
        
        <button
          @click="router.push('/')"
          class="w-full bg-white/10 hover:bg-white/20 text-white font-bold py-4 px-6 rounded-xl transition-all duration-300 border border-white/20"
        >
          Return to Home
        </button>
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
