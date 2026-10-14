<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRoute } from "vue-router";
import QRCode from "qrcode";
import { usePaymentHistory, type ReceiptData } from "~/composables/usePaymentHistory";
import { ArrowLeft, Copy, Printer, ExternalLink, CheckCircle2, XCircle, Hash, DollarSign, Wallet, Calendar, Loader2, Download } from "lucide-vue-next";

const route = useRoute();
const router = useRouter();
const { getReceiptByTxHash, getReceiptByOrderId } = usePaymentHistory();

// Explorer URL from environment
const baseExplorerUrl = import.meta.env.VITE_ARC_EXPLORER_URL || "https://explorer.arc.io";

// State
const loading = ref(true);
const error = ref("");
const receipt = ref<ReceiptData | null>(null);
const copySuccess = ref(false);
const showPrintDialog = ref(false);
const paperSize = ref<"a4" | "thermal" | "letter">("a4");
const qrCodeUrl = ref("");
const includeQRCode = ref(true);
const includeFullDetails = ref(true);
const toast = ref<{ message: string; type: 'success' | 'error' } | null>(null);

// Get query parameters
const txHash = route.query.txHash as string | undefined;
const orderId = route.query.orderId as string | undefined;

onMounted(async () => {
  await loadReceipt();
  if (receipt.value) {
    await generateQRCode();
  }
});

/**
 * Load receipt data
 */
const loadReceipt = async () => {
  loading.value = true;
  error.value = "";

  try {
    if (txHash) {
      // Load by transaction hash
      receipt.value = await getReceiptByTxHash(txHash as `0x${string}`);
    } else if (orderId) {
      // Load by order ID
      const receipts = await getReceiptByOrderId(orderId);
      
      if (receipts.length === 0) {
        error.value = "No receipt found for this order ID";
      } else if (receipts.length > 1) {
        error.value = "Multiple receipts found for this order ID. Please use transaction hash instead.";
      } else {
        receipt.value = receipts[0];
      }
    } else {
      error.value = "No transaction hash or order ID provided";
    }
  } catch (err: any) {
    console.error("Failed to load receipt:", err);
    error.value = err.message || "Failed to load receipt";
  } finally {
    loading.value = false;
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
 * Format timestamp
 */
const formatTimestamp = (date: Date) => {
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

/**
 * Copy to clipboard
 */
const copyToClipboard = async (text: string, label: string = "Text") => {
  try {
    await navigator.clipboard.writeText(text);
    toast.value = {
      message: `${label} copied to clipboard!`,
      type: 'success'
    };
    setTimeout(() => {
      toast.value = null;
    }, 3000);
  } catch (err) {
    console.error("Failed to copy:", err);
    toast.value = {
      message: 'Failed to copy to clipboard',
      type: 'error'
    };
    setTimeout(() => {
      toast.value = null;
    }, 3000);
  }
};

/**
 * Copy receipt URL
 */
const copyReceiptUrl = () => {
  copyToClipboard(window.location.href, "Receipt URL");
};

/**
 * Print receipt
 */
const printReceipt = () => {
  showPrintDialog.value = true;
};

/**
 * Execute print with selected paper size
 */
const executePrint = () => {
  showPrintDialog.value = false;
  
  // Apply paper size to page settings
  const pageSize = paperSize.value;
  let cssSize = '';
  let cssMargin = '';
  
  switch (pageSize) {
    case 'a4':
      cssSize = '210mm 297mm';
      cssMargin = '10mm';
      break;
    case 'thermal':
      cssSize = '80mm auto'; // Auto height for thermal
      cssMargin = '5mm 5mm 5mm 5mm'; // Small margins
      break;
    case 'letter':
      cssSize = '216mm 279mm';
      cssMargin = '10mm';
      break;
  }
  
  // Create style element for print size
  const style = document.createElement('style');
  style.textContent = `
    @page {
      size: ${cssSize};
      margin: ${cssMargin};
    }
    
    body {
      min-height: auto !important;
      height: auto !important;
    }
    
    .min-h-screen {
      min-height: auto !important;
      height: auto !important;
    }
  `;
  document.head.appendChild(style);
  
  // Add class to body for print options
  if (pageSize === 'thermal') {
    document.body.classList.add('print-thermal');
    if (!includeQRCode.value) {
      document.body.classList.add('print-no-qr');
    }
    if (!includeFullDetails.value) {
      document.body.classList.add('print-compact');
    }
  }
  
  // Print
  window.print();
  
  // Remove styles and classes after print
  setTimeout(() => {
    document.head.removeChild(style);
    document.body.classList.remove('print-thermal', 'print-no-qr', 'print-compact');
  }, 100);
};

/**
 * View on explorer
 */
const viewOnExplorer = () => {
  if (receipt?.value) {
    window.open(`${baseExplorerUrl}/tx/${receipt.value.transactionHash}`, "_blank");
  }
};

/**
 * Generate QR code for explorer link
 */
const generateQRCode = async () => {
  if (!receipt.value) return;

  try {
    const txExplorerUrl = `${baseExplorerUrl}/tx/${receipt.value.transactionHash}`;
    qrCodeUrl.value = await QRCode.toDataURL(txExplorerUrl, {
      width: 150,
      margin: 1,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
    });
  } catch (error) {
    console.error("Failed to generate QR code:", error);
  }
};

/**
 * Download QR code
 */
const downloadQRCode = () => {
  if (!qrCodeUrl.value || !receipt.value) return;

  const link = document.createElement('a');
  link.href = qrCodeUrl.value;
  link.download = `receipt-${receipt.value.transactionHash.slice(0, 8)}-qr.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  toast.value = {
    message: 'QR code downloaded successfully',
    type: 'success'
  };
  setTimeout(() => {
    toast.value = null;
  }, 3000);
};
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 p-4">
    <div class="max-w-3xl mx-auto">
      <!-- Header -->
      <div class="flex items-center justify-between mb-8 print:hidden">
        <button
          @click="router.back()"
          class="flex items-center gap-2 text-white hover:text-purple-200 transition-colors"
        >
          <ArrowLeft :size="24" />
          <span>Back</span>
        </button>
        <h1 class="text-3xl font-bold text-white">Payment Receipt</h1>
        <div></div>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="bg-white/10 backdrop-blur-lg rounded-xl p-12 border border-white/20">
        <div class="flex items-center justify-center">
          <Loader2 :size="32" class="text-purple-400 animate-spin" />
          <span class="ml-3 text-white">Loading receipt...</span>
        </div>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="bg-red-500/20 backdrop-blur-lg rounded-xl p-12 border border-red-500/20">
        <div class="text-center">
          <XCircle :size="48" class="text-red-400 mx-auto mb-4" />
          <h3 class="text-xl font-bold text-white mb-2">Error Loading Receipt</h3>
          <p class="text-red-200">{{ error }}</p>
        </div>
      </div>

      <!-- Receipt Content -->
      <div v-else-if="receipt" class="space-y-6">
        <!-- Transaction Info Card -->
        <div class="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
          <h2 class="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <Hash :size="24" />
            Transaction Info
          </h2>
          
          <div class="space-y-4">
            <!-- Transaction Hash -->
            <div class="flex items-center justify-between">
              <span class="text-purple-200">Transaction Hash</span>
              <div class="flex items-center gap-2">
                <span class="text-white font-mono text-sm">{{ formatAddress(receipt.transactionHash) }}</span>
                <button
                  @click="copyToClipboard(receipt.transactionHash, 'Transaction Hash')"
                  class="text-purple-400 hover:text-purple-300 transition-colors print:hidden"
                  title="Copy"
                >
                  <Copy :size="16" />
                </button>
              </div>
            </div>

            <!-- Block Number -->
            <div class="flex items-center justify-between">
              <span class="text-purple-200">Block Number</span>
              <span class="text-white font-mono">{{ receipt.blockNumber.toString() }}</span>
            </div>

            <!-- Timestamp -->
            <div class="flex items-center justify-between">
              <span class="text-purple-200 flex items-center gap-2">
                <Calendar :size="16" />
                Timestamp
              </span>
              <span class="text-white">{{ formatTimestamp(receipt.timestamp) }}</span>
            </div>

            <!-- Status -->
            <div class="flex items-center justify-between">
              <span class="text-purple-200">Status</span>
              <div class="flex items-center gap-2">
                <CheckCircle2 v-if="receipt.status === 'success'" :size="20" class="text-green-400" />
                <XCircle v-else :size="20" class="text-red-400" />
                <span
                  :class="receipt.status === 'success' ? 'text-green-400' : 'text-red-400'"
                  class="font-medium"
                >
                  {{ receipt.status === 'success' ? 'Success' : 'Failed' }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Payment Info Card -->
        <div class="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
          <h2 class="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <DollarSign :size="24" />
            Payment Info
          </h2>
          
          <div class="space-y-4">
            <!-- Amount -->
            <div class="flex items-center justify-between">
              <span class="text-purple-200">Amount</span>
              <span class="text-white font-bold text-xl">{{ formatUSDC(receipt.amount) }} USDC</span>
            </div>

            <!-- Order ID -->
            <div class="flex items-center justify-between">
              <span class="text-purple-200">Order ID</span>
              <span class="text-white font-mono">{{ receipt.orderId }}</span>
            </div>

            <!-- Merchant -->
            <div class="flex items-center justify-between">
              <span class="text-purple-200 flex items-center gap-2">
                <Wallet :size="16" />
                Merchant
              </span>
              <div class="flex items-center gap-2">
                <span class="text-white font-mono text-sm">{{ formatAddress(receipt.merchant) }}</span>
                <button
                  @click="copyToClipboard(receipt.merchant, 'Merchant Address')"
                  class="text-purple-400 hover:text-purple-300 transition-colors print:hidden"
                  title="Copy"
                >
                  <Copy :size="16" />
                </button>
              </div>
            </div>

            <!-- Payer -->
            <div class="flex items-center justify-between">
              <span class="text-purple-200 flex items-center gap-2">
                <Wallet :size="16" />
                Payer
              </span>
              <div class="flex items-center gap-2">
                <span class="text-white font-mono text-sm">{{ formatAddress(receipt.payer) }}</span>
                <button
                  @click="copyToClipboard(receipt.payer, 'Payer Address')"
                  class="text-purple-400 hover:text-purple-300 transition-colors print:hidden"
                  title="Copy"
                >
                  <Copy :size="16" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="flex flex-wrap gap-4 print:hidden">
          <button
            @click="copyReceiptUrl"
            class="flex-1 min-w-[150px] bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <Copy :size="20" />
            Share URL
          </button>
          
          <button
            @click="printReceipt"
            class="flex-1 min-w-[150px] bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <Printer :size="20" />
            Print
          </button>
          
          <button
            @click="viewOnExplorer"
            class="flex-1 min-w-[150px] bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <ExternalLink :size="20" />
            View on Explorer
          </button>
        </div>

        <!-- QR Code Section -->
        <div v-if="qrCodeUrl && includeQRCode" class="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20 flex flex-col items-center print-qr-section">
          <h3 class="text-lg font-bold text-white mb-4">Scan to Verify on Explorer</h3>
          <div class="bg-white p-4 rounded-lg">
            <img :src="qrCodeUrl" alt="Transaction QR Code" class="w-32 h-32" />
          </div>
          <p class="text-purple-200 text-sm mt-3 text-center">
            Scan this QR code to view transaction details on Arc Explorer
          </p>
          <button
            @click="downloadQRCode"
            class="mt-4 bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg transition-colors flex items-center gap-2 print:hidden"
          >
            <Download :size="20" />
            Download QR Code
          </button>
        </div>

        <!-- Print Dialog -->
        <div
          v-if="showPrintDialog"
          class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 print:hidden"
        >
          <div class="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <h3 class="text-xl font-bold text-gray-900 mb-4">Select Paper Size</h3>
            
            <div class="space-y-3 mb-6">
              <button
                @click="paperSize = 'a4'"
                :class="paperSize === 'a4' ? 'bg-purple-100 border-purple-500' : 'bg-gray-50 border-gray-300'"
                class="w-full p-4 border-2 rounded-lg flex items-center gap-3 transition-colors"
              >
                <div class="w-8 h-8 border-2 border-gray-400 rounded flex items-center justify-center text-xs">A4</div>
                <div class="text-left">
                  <p class="font-semibold text-gray-900">A4 Paper</p>
                  <p class="text-sm text-gray-600">210mm × 297mm (Standard)</p>
                </div>
              </button>
              
              <button
                @click="paperSize = 'thermal'"
                :class="paperSize === 'thermal' ? 'bg-purple-100 border-purple-500' : 'bg-gray-50 border-gray-300'"
                class="w-full p-4 border-2 rounded-lg flex items-center gap-3 transition-colors"
              >
                <div class="w-8 h-8 border-2 border-gray-400 rounded flex items-center justify-center text-xs">80</div>
                <div class="text-left">
                  <p class="font-semibold text-gray-900">Thermal Printer</p>
                  <p class="text-sm text-gray-600">80mm (Receipt)</p>
                </div>
              </button>
              
              <button
                @click="paperSize = 'letter'"
                :class="paperSize === 'letter' ? 'bg-purple-100 border-purple-500' : 'bg-gray-50 border-gray-300'"
                class="w-full p-4 border-2 rounded-lg flex items-center gap-3 transition-colors"
              >
                <div class="w-8 h-8 border-2 border-gray-400 rounded flex items-center justify-center text-xs">L</div>
                <div class="text-left">
                  <p class="font-semibold text-gray-900">Letter</p>
                  <p class="text-sm text-gray-600">216mm × 279mm (US)</p>
                </div>
              </button>
            </div>
            
            <!-- Print Options for Thermal -->
            <div v-if="paperSize === 'thermal'" class="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-300">
              <h4 class="font-semibold text-gray-900 mb-3">Print Options</h4>
              
              <label class="flex items-center gap-2 mb-2 cursor-pointer">
                <input
                  type="checkbox"
                  v-model="includeQRCode"
                  class="w-4 h-4"
                />
                <span class="text-sm text-gray-700">Include QR Code</span>
              </label>
              
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  v-model="includeFullDetails"
                  class="w-4 h-4"
                />
                <span class="text-sm text-gray-700">Include Full Details</span>
              </label>
            </div>
            
            <div class="flex gap-3">
              <button
                @click="showPrintDialog = false"
                class="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-900 font-bold py-3 px-6 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                @click="executePrint"
                class="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Printer :size="20" />
                Print
              </button>
            </div>
          </div>
        </div>

        <!-- Toast Notification -->
        <div
          v-if="toast"
          :class="[
            'fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg print-hidden transition-all duration-300',
            toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
          ]"
        >
          <div class="flex items-center gap-2 text-white">
            <CheckCircle2 v-if="toast.type === 'success'" :size="20" />
            <XCircle v-else :size="20" />
            <span>{{ toast.message }}</span>
          </div>
        </div>

        <!-- Footer -->
        <div class="text-center py-8 border-t border-white/20">
          <h3 class="text-2xl font-bold text-white mb-2">FlashArcPay Nusantara</h3>
          <p class="text-purple-200">Thank you for your payment</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@media print {
  @page {
    size: auto;
    margin: 0;
  }

  body {
    background: white !important;
    color: #000 !important;
    font-family: 'Courier New', Courier, monospace;
    min-height: auto !important;
    height: auto !important;
  }
  
  .min-h-screen {
    background: white !important;
    padding: 20px !important;
    min-height: auto !important;
    height: auto !important;
  }
  
  /* Hide non-printable elements */
  button,
  .print-hidden {
    display: none !important;
  }
  
  /* Main container */
  .max-w-3xl {
    max-width: 100% !important;
    margin: 0 auto !important;
  }
  
  /* Header */
  .flex.items-center.justify-between.mb-8 {
    display: none !important;
  }
  
  /* Cards */
  .bg-white\/10,
  .bg-gradient-to-br {
    background: white !important;
    border: 2px solid #000 !important;
    box-shadow: none !important;
    margin-bottom: 16px !important;
    padding: 16px !important;
  }
  
  /* Remove backdrop blur */
  .backdrop-blur-lg {
    backdrop-filter: none !important;
  }
  
  /* Text colors */
  .text-white,
  .text-purple-200,
  .text-purple-300 {
    color: #000 !important;
  }
  
  .text-purple-400,
  .text-green-400,
  .text-blue-400,
  .text-orange-400 {
    color: #000 !important;
  }
  
  /* Headers */
  h1, h2, h3 {
    color: #000 !important;
    font-weight: bold !important;
  }
  
  .text-3xl {
    font-size: 18px !important;
  }
  
  .text-2xl {
    font-size: 16px !important;
  }
  
  .text-xl {
    font-size: 14px !important;
  }
  
  /* Receipt container styling */
  .space-y-6 > * {
    margin-bottom: 12px !important;
  }
  
  /* Border styling */
  .border-white\/20 {
    border-color: #000 !important;
  }
  
  .border-t {
    border-top: 2px dashed #000 !important;
  }
  
  /* Receipt divider */
  .border-b {
    border-bottom: 2px dashed #000 !important;
  }
  
  /* Footer */
  .text-center.py-8 {
    padding: 16px 0 !important;
    border-top: 2px dashed #000 !important;
    margin-top: 16px !important;
  }
  
  /* QR Code section */
  .flex.flex-col.items-center {
    align-items: center !important;
  }
  
  .bg-white.p-4 {
    background: white !important;
    padding: 8px !important;
    border: 1px solid #000 !important;
  }
  
  .w-32 {
    width: 80px !important;
  }
  
  .h-32 {
    height: 80px !important;
  }
  
  /* Receipt specific styling */
  .flex.items-center.justify-between {
    justify-content: space-between !important;
  }
  
  .font-mono {
    font-family: 'Courier New', Courier, monospace !important;
  }
  
  .text-sm {
    font-size: 12px !important;
  }
  
  /* Thermal printer optimization (80mm) */
  @media print and (max-width: 80mm) {
    body {
      font-size: 9px !important;
      line-height: 1.2 !important;
      min-height: auto !important;
      height: auto !important;
    }
    
    .max-w-3xl {
      width: 100% !important;
      padding: 4px !important;
      max-width: 80mm !important;
      min-height: auto !important;
      height: auto !important;
    }
    
    .bg-white\/10,
    .bg-gradient-to-br {
      padding: 4px !important;
      margin-bottom: 4px !important;
      border: 1px solid #000 !important;
    }
    
    .text-3xl {
      font-size: 12px !important;
      margin-bottom: 4px !important;
    }
    
    .text-2xl {
      font-size: 10px !important;
      margin-bottom: 4px !important;
    }
    
    .text-xl {
      font-size: 9px !important;
      margin-bottom: 3px !important;
    }
    
    .text-lg {
      font-size: 9px !important;
      margin-bottom: 3px !important;
    }
    
    .text-sm {
      font-size: 8px !important;
    }
    
    .py-6 {
      padding-top: 4px !important;
      padding-bottom: 4px !important;
    }
    
    .py-4 {
      padding-top: 3px !important;
      padding-bottom: 3px !important;
    }
    
    .py-3 {
      padding-top: 2px !important;
      padding-bottom: 2px !important;
    }
    
    .px-6 {
      padding-left: 4px !important;
      padding-right: 4px !important;
    }
    
    .px-4 {
      padding-left: 3px !important;
      padding-right: 3px !important;
    }
    
    .mb-4 {
      margin-bottom: 3px !important;
    }
    
    .mb-2 {
      margin-bottom: 2px !important;
    }
    
    .mb-6 {
      margin-bottom: 4px !important;
    }
    
    .mb-3 {
      margin-bottom: 3px !important;
    }
    
    .gap-2 {
      gap: 2px !important;
    }
    
    .gap-3 {
      gap: 3px !important;
    }
    
    .space-y-4 > * {
      margin-bottom: 3px !important;
    }
    
    .space-y-6 > * {
      margin-bottom: 4px !important;
    }
    
    /* Compact layout for thermal */
    .flex.items-center.justify-between {
      flex-wrap: wrap !important;
    }
    
    /* QR code for thermal - smaller */
    .w-32 {
      width: 50px !important;
    }
    
    .h-32 {
      height: 50px !important;
    }
    
    .bg-white.p-4 {
      padding: 2px !important;
      border: 1px solid #000 !important;
    }
    
    /* Hide QR code text for thermal to save space */
    .flex.flex-col.items-center p:last-child {
      display: none !important;
    }
    
    /* Compact footer */
    .text-center.py-8 {
      padding: 8px 0 !important;
      margin-top: 4px !important;
    }
    
    /* Remove card borders for thermal to save space */
    .border-b {
      border-bottom: 1px solid #000 !important;
    }
    
    /* Header spacing */
    .mb-8 {
      margin-bottom: 4px !important;
    }
    
    /* Make transaction hash smaller */
    .font-mono {
      font-size: 7px !important;
      word-break: break-all !important;
    }
    
    /* Prevent page breaks */
    * {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
    
    /* Hide QR code section when disabled */
    body.print-no-qr .print-qr-section {
      display: none !important;
    }
    
    /* Compact mode - hide less important details */
    body.print-compact .bg-white\/10:nth-child(2) {
      /* Hide transaction info card in compact mode */
      display: none !important;
    }
    
    body.print-compact .flex.items-center.justify-between:nth-of-type(1) {
      /* Simplify transaction info */
      display: flex !important;
    }
  }
}

/* Additional print optimizations */
@media print {
  /* Ensure high contrast */
  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  
  /* Remove shadows */
  * {
    box-shadow: none !important;
    text-shadow: none !important;
  }
  
  /* Remove background images */
  * {
    background-image: none !important;
  }
}
</style>
