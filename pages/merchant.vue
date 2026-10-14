<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from "vue";
import QRCode from "qrcode";
import { useArcAppKit } from "~/composables/useArcAppKit";
import { ArrowLeft, QrCode, DollarSign, Hash, CheckCircle2, Clock, XCircle, Wallet, History } from "lucide-vue-next";

const router = useRouter();

const {
  connectWallet,
  isConnected,
  account,
  listenToPaymentEvent,
  chain,
  addArcNetwork,
  openWalletApp,
  isMobile,
  isMetaMaskBrowser,
} = useArcAppKit();

// Determine network type (mainnet or testnet)
const chainId = Number(import.meta.env.VITE_ARC_CHAIN_ID || 5042);
const isMainnet = computed(() => chainId === 5042);
const networkLabel = computed(() => isMainnet.value ? "Mainnet" : "Testnet");

// Form state
const amount = ref("");

// Auto-generate a simple order ID
const generateOrderId = () => {
  return `ORD-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
};
const orderId = ref(generateOrderId());
const merchantAddress = ref("");
const qrCodeUrl = ref("");
const showQR = ref(false);

// Payment status
const paymentStatus = ref<"idle" | "waiting" | "success" | "error">("idle");
const paymentMessage = ref("");

// Wallet connection error
const connectionError = ref("");

// Mobile detection
const isMobileDevice = ref(false);

// Instructions accordion state
const showInstructions = ref(false);

// Wallet modal state
const showWalletModal = ref(false);

// Check if mobile on mount
onMounted(async () => {
  isMobileDevice.value = isMobile();
  
  // If in MetaMask browser, try to connect automatically
  if (isMetaMaskBrowser()) {
    try {
      await connectWallet();
      if (account.value) {
        merchantAddress.value = account.value;
      }
    } catch (error) {
      console.error("Failed to connect wallet:", error);
    }
  }
});

// Event listener cleanup
let unwatchPayment: (() => void) | null = null;

// Connect wallet on mount
onMounted(async () => {
  try {
    await connectWallet();
    if (account.value) {
      merchantAddress.value = account.value;
    }
  } catch (error) {
    console.error("Failed to connect wallet:", error);
  }
});

// Cleanup on unmount
onUnmounted(() => {
  if (unwatchPayment) {
    unwatchPayment();
  }
});

/**
 * Add Arc Network to MetaMask
 */
const handleAddNetwork = async () => {
  try {
    connectionError.value = "";
    const success = await addArcNetwork();
    if (success) {
      connectionError.value = "";
      // Try to connect after adding network
      await handleConnectWallet();
    }
  } catch (error: any) {
    console.error("Failed to add network:", error);
    
    if (error.code === 4001 || error.message.includes("at least one account")) {
      connectionError.value = "Please unlock your MetaMask wallet first, then click 'Add Arc Network' again.";
    } else {
      connectionError.value = error.message || "Failed to add Arc network. Please try again.";
    }
  }
};

/**
 * Handle manual wallet connection
 */
const handleConnectWallet = async () => {
  try {
    connectionError.value = "";
    const address = await connectWallet();
    if (address) {
      merchantAddress.value = address;
    }
  } catch (error: any) {
    console.error("Failed to connect wallet:", error);

    // Provide more helpful error messages
    if (error.message.includes("No wallet provider")) {
      connectionError.value = "No wallet found. Please install MetaMask or another Web3 wallet.";
    } else if (error.message.includes("No accounts found")) {
      connectionError.value = "No accounts found. Please unlock your wallet and ensure at least one account is available.";
    } else if (error.message.includes("User rejected")) {
      connectionError.value = "Connection request rejected. Please approve the connection in your wallet.";
    } else {
      connectionError.value = error.message || "Failed to connect wallet. Please try again.";
    }
  }
};

/**
 * Handle wallet selection from modal
 */
const handleWalletSelect = async (walletType: string, openInApp: boolean) => {
  try {
    connectionError.value = "";

    console.log("handleWalletSelect:", {
      walletType,
      isMobileDevice: isMobileDevice.value,
      isMetaMaskBrowser: isMetaMaskBrowser(),
      openInApp
    });

    switch (walletType) {
      case "metamask":
        if (isMobileDevice.value && !isMetaMaskBrowser()) {
          // Mobile: always need to open MetaMask (either app or browser)
          console.log("Opening MetaMask app (mobile)");
          openWalletApp("metamask");
        } else {
          // Desktop or already in MetaMask browser: connect directly
          console.log("Connecting directly (desktop or MetaMask browser)");
          await handleConnectWallet();
        }
        break;
      case "walletconnect":
        // TODO: Implement WalletConnect integration
        connectionError.value = "WalletConnect integration coming soon. Please use MetaMask for now.";
        break;
      case "coinbase":
        if (isMobileDevice.value && !isMetaMaskBrowser()) {
          // Mobile: always need to open Coinbase
          console.log("Opening Coinbase app (mobile)");
          openWalletApp("coinbase");
        } else {
          // Desktop: connect directly
          console.log("Connecting directly (desktop)");
          await handleConnectWallet();
        }
        break;
      case "binance":
        // TODO: Implement Binance Wallet integration
        connectionError.value = "Binance Wallet integration coming soon. Please use MetaMask for now.";
        break;
      default:
        await handleConnectWallet();
    }
  } catch (error: any) {
    console.error("Failed to connect wallet:", error);
    connectionError.value = error.message || "Failed to connect wallet. Please try again.";
  }
};

/**
 * Generate QR code for payment
 */
const generateQR = async () => {
  if (!amount.value || !orderId.value || !merchantAddress.value) {
    alert("Please fill in all fields");
    return;
  }

  try {
    // Validate amount (must be a positive number)
    const amountNum = parseFloat(amount.value);
    if (isNaN(amountNum) || amountNum <= 0) {
      alert("Please enter a valid amount greater than 0");
      return;
    }

    // Validate order ID
    if (!orderId.value || orderId.value.trim() === "") {
      alert("Please enter a valid order ID");
      return;
    }

    // Create payment URL
    const baseUrl = window.location.origin;
    const payUrl = `${baseUrl}/pay?merchant=${merchantAddress.value}&amount=${amountNum}&orderId=${orderId.value}`;

    // Generate QR code
    qrCodeUrl.value = await QRCode.toDataURL(payUrl, {
      width: 300,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
    });

    showQR.value = true;
    paymentStatus.value = "waiting";
    paymentMessage.value = "Waiting for payment...";

    // Start listening for payment events
    startPaymentListener();
  } catch (error) {
    console.error("Failed to generate QR code:", error);
    alert("Failed to generate QR code");
  }
};

/**
 * Start listening for payment events
 */
const startPaymentListener = () => {
  if (!merchantAddress.value) return;

  unwatchPayment = listenToPaymentEvent(
    merchantAddress.value as `0x${string}`,
    (event) => {
      // Check if the event matches our order ID (string comparison)
      if (event.args.orderId === orderId.value) {
        paymentStatus.value = "success";
        paymentMessage.value = `Payment received! ${Number(event.args.amount) / 1000000} USDC`;
        
        // Stop listening after successful payment
        if (unwatchPayment) {
          unwatchPayment();
          unwatchPayment = null;
        }
      }
    }
  );

  // Fallback: Stop listening after 5 minutes
  setTimeout(() => {
    if (paymentStatus.value === "waiting") {
      paymentStatus.value = "error";
      paymentMessage.value = "Payment timeout. Please generate a new QR code.";
      if (unwatchPayment) {
        unwatchPayment();
        unwatchPayment = null;
      }
    }
  }, 5 * 60 * 1000); // 5 minutes
};

const copyAddress = async () => {
  if (!merchantAddress.value) return;
  try {
    await navigator.clipboard.writeText(merchantAddress.value);
  } catch (err) {
    console.error('Failed to copy', err);
  }
};

/**
 * Reset the form
 */
const resetForm = () => {
  amount.value = "";
  orderId.value = generateOrderId();
  qrCodeUrl.value = "";
  showQR.value = false;
  paymentStatus.value = "idle";
  paymentMessage.value = "";
  
  if (unwatchPayment) {
    unwatchPayment();
    unwatchPayment = null;
  }
};

/**
 * Format address for display
 */
const formatAddress = (address: string) => {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 p-4 pb-8">
    <div class="max-w-4xl mx-auto">
      <!-- Header Navigation -->
      <div class="flex items-center justify-between mb-6 mt-4">
        <button
          @click="router.push('/')"
          class="flex items-center gap-2 text-white hover:text-purple-200 transition-colors text-lg"
        >
          <ArrowLeft :size="24" />
          <span class="font-medium">Back</span>
        </button>
        <NuxtLink
          to="/merchant-history"
          class="flex items-center gap-2 text-white hover:text-purple-200 transition-colors text-lg"
        >
          <History :size="24" />
          <span class="font-medium">History</span>
        </NuxtLink>
      </div>

      <!-- Page Title -->
      <div class="mb-6 text-center">
        <h1 class="text-2xl font-bold text-white">Merchant POS</h1>
      </div>

      <!-- Connection Status - Single Connect Pattern -->
      <div class="bg-white/10 backdrop-blur-lg rounded-xl p-4 mb-6 border border-white/20">
        <div v-if="isConnected" class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div
              class="w-3 h-3 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]"
              style="box-shadow: 0 0 8px #22c55e"
            ></div>
            <span class="text-white font-medium">Connected</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs bg-purple-600/50 border border-purple-400/50 px-2 py-1 rounded-md text-white">{{ networkLabel }}</span>
            <button @click="copyAddress" class="text-white font-medium bg-white/20 hover:bg-white/30 px-3 py-1 rounded-md text-sm transition-colors cursor-pointer" title="Copy Address">
              {{ formatAddress(merchantAddress) }}
            </button>
          </div>
        </div>
        
        <div v-else class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div
              class="w-3 h-3 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]"
              style="box-shadow: 0 0 8px #ef4444"
            ></div>
            <span class="text-white font-medium">Not Connected</span>
          </div>
          <button
            @click="showWalletModal = true"
            class="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2.5 px-6 rounded-lg transition-colors flex items-center gap-2 text-sm"
          >
            <Wallet :size="16" />
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
            <li>The app will automatically add Arc {{ networkLabel }} to your wallet</li>
          </ol>
          <ol v-else class="text-white text-sm space-y-2 list-decimal list-inside leading-relaxed">
            <li>Install a Web3 wallet app (MetaMask, Coinbase Wallet, Trust Wallet, etc.)</li>
            <li>Open the wallet app and set up your account</li>
            <li>Click the <strong>"Connect Wallet"</strong> button above</li>
            <li>Select your preferred wallet from the popup menu</li>
            <li>You'll be redirected to MetaMask browser with this dApp loaded</li>
            <li>Approve the connection in the wallet</li>
            <li>The app will automatically add Arc {{ networkLabel }} to your wallet</li>
          </ol>
        </div>
      </div>

      <!-- Connection Error Message -->
      <div
        v-if="connectionError"
        class="bg-red-500/20 border border-red-500 rounded-xl p-4 mb-6"
      >
        <div class="flex items-center gap-3 mb-3">
          <XCircle :size="20" class="text-red-400" />
          <div class="flex-1">
            <p class="text-white font-semibold">Connection Error</p>
            <p class="text-red-200 text-sm">{{ connectionError }}</p>
          </div>
          <button
            @click="connectionError = ''"
            class="text-red-200 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>
        
        <!-- Helper buttons based on error type -->
        <div class="flex gap-2 mt-3">
          <button
            v-if="connectionError.includes('unlock')"
            @click="handleConnectWallet"
            class="bg-purple-600 hover:bg-purple-700 text-white text-sm py-2 px-4 rounded-lg transition-colors"
          >
            Retry After Unlocking Wallet
          </button>
          <button
            v-if="connectionError.includes('network') || connectionError.includes('chain')"
            @click="handleAddNetwork"
            class="bg-blue-600 hover:bg-blue-700 text-white text-sm py-2 px-4 rounded-lg transition-colors"
          >
            Add Arc Network
          </button>
          <button
            @click="handleConnectWallet"
            class="bg-green-600 hover:bg-green-700 text-white text-sm py-2 px-4 rounded-lg transition-colors"
          >
            Retry Connection
          </button>
        </div>
      </div>

      <!-- Form -->
      <div v-if="!showQR" class="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20">
        <h2 class="text-2xl font-bold text-white mb-6">Create Payment QR</h2>
        
        <div class="space-y-6">
          <!-- Amount Input -->
          <div>
            <label class="block text-white font-medium mb-2 flex items-center gap-2">
              <DollarSign :size="20" />
              Amount (USDC)
            </label>
            <input
              v-model="amount"
              type="number"
              inputmode="decimal"
              step="0.01"
              min="0"
              placeholder="Enter amount in USDC"
              class="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-purple-400 focus:bg-white/20 transition-all"
            />
          </div>

          <!-- Order ID Input -->
          <div>
            <label class="block text-white font-medium mb-2 flex items-center gap-2">
              <Hash :size="20" />
              Order ID
            </label>
            <input
              v-model="orderId"
              type="text"
              placeholder="Enter order ID"
              class="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-purple-400 focus:bg-white/20 transition-all"
            />
          </div>

          <!-- Generate Button -->
          <button
            @click="generateQR"
            :disabled="!isConnected || !amount || !orderId"
            class="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <QrCode :size="20" />
            Generate QR Code
          </button>
        </div>
      </div>

      <!-- QR Code Display -->
      <div v-else class="space-y-6">
        <!-- QR Code Card -->
        <div class="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20">
          <div class="text-center mb-6">
            <h2 class="text-2xl font-bold text-white">Payment QR Code</h2>
          </div>

          <div class="flex flex-col items-center">
            <div class="bg-white p-4 rounded-xl mb-6 relative">
              <img :src="qrCodeUrl" alt="Payment QR Code" class="w-64 h-64 transition-all duration-300" :class="{ 'opacity-30 blur-[2px]': paymentStatus === 'error' }" />
              <div v-if="paymentStatus === 'error'" class="absolute inset-0 flex items-center justify-center">
                <XCircle :size="64" class="text-red-500 bg-white rounded-full" />
              </div>
            </div>
            
            <div class="text-center space-y-2 mb-4">
              <p class="text-purple-200 uppercase tracking-widest text-sm font-semibold">[ Total Bayar ]</p>
              <p class="text-white text-4xl font-extrabold">{{ amount }} USDC</p>
              <p class="text-purple-200 pt-2">Order ID: {{ orderId }}</p>
            </div>

            <div v-if="paymentStatus !== 'error' && paymentStatus !== 'success'" class="mt-2 w-full max-w-xs">
              <button @click="resetForm" class="w-full bg-white/10 hover:bg-white/20 text-white font-medium py-3 px-6 rounded-xl transition-all border border-white/20">
                Generate New QR
              </button>
            </div>
          </div>
        </div>

        <!-- Payment Status -->
        <div v-if="paymentStatus === 'error'" class="backdrop-blur-lg rounded-xl p-6 border bg-red-500/20 border-red-500 text-center">
          <div class="flex items-center justify-center gap-3 mb-4">
            <XCircle :size="24" class="text-red-400" />
            <span class="text-white font-semibold">{{ paymentMessage }}</span>
          </div>
          <button @click="resetForm" class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-4 px-6 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2">
            <span class="text-xl">🔄</span> Buat QR Code Baru
          </button>
        </div>
        
        <div v-else
          :class="{
            'bg-green-500/20 border-green-500': paymentStatus === 'success',
            'bg-yellow-500/20 border-yellow-500': paymentStatus === 'waiting',
          }"
          class="backdrop-blur-lg rounded-xl p-6 border"
        >
          <div class="flex items-center gap-3">
            <CheckCircle2 v-if="paymentStatus === 'success'" :size="24" class="text-green-400" />
            <Clock v-if="paymentStatus === 'waiting'" :size="24" class="text-yellow-400" />
            <span class="text-white font-semibold">{{ paymentMessage }}</span>
          </div>
        </div>
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
