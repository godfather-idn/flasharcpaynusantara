<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { BrowserMultiFormatReader } from "@zxing/library";
import { ArrowLeft, Zap, Image as ImageIcon, Loader2, XCircle } from "lucide-vue-next";

const router = useRouter();

// Scanner state
const isScanning = ref(false);
const scanError = ref("");
const codeReader = ref<BrowserMultiFormatReader | null>(null);
const videoRef = ref<HTMLVideoElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const isFlashOn = ref(false);

// Cleanup function
let cleanupScanner: (() => void) | null = null;

onMounted(() => {
  // Only initialize scanner on client side
  if (typeof window !== "undefined") {
    startScanner();
  }
});

onUnmounted(() => {
  stopScanner();
});

const toggleFlash = async () => {
  if (!videoRef.value || !videoRef.value.srcObject) {
    alert("Kamera belum aktif.");
    return;
  }
  const stream = videoRef.value.srcObject as MediaStream;
  const track = stream.getVideoTracks()[0];
  if (!track) return;

  try {
    const capabilities = track.getCapabilities() as any;
    if (capabilities.torch) {
      const newFlashState = !isFlashOn.value;
      await track.applyConstraints({
        advanced: [{ torch: newFlashState }] as any
      });
      isFlashOn.value = newFlashState;
    } else {
      alert("Fitur senter (flash) tidak didukung pada perangkat ini.");
    }
  } catch (e) {
    console.error("Failed to toggle flash", e);
    alert("Gagal menyalakan senter.");
  }
};

const openGallery = () => {
  fileInput.value?.click();
};

const handleFileUpload = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  try {
    isScanning.value = true;
    scanError.value = "";
    
    // Create code reader if not exists
    if (!codeReader.value) {
      codeReader.value = new BrowserMultiFormatReader();
    }
    
    const imageUrl = URL.createObjectURL(file);
    const result = await codeReader.value.decodeFromImageUrl(imageUrl);
    URL.revokeObjectURL(imageUrl); // clean up
    
    if (result) {
      handleScanResult((result as any).text);
    }
  } catch (error) {
    console.error("Failed to decode image:", error);
    scanError.value = "Tidak dapat menemukan kode QR pada gambar tersebut.";
    isScanning.value = false;
  } finally {
    // Reset file input so same file can be uploaded again if needed
    if (target) target.value = '';
  }
};

/**
 * Start the QR code scanner
 */
const startScanner = async () => {
  if (isScanning.value) return;

  try {
    isScanning.value = true;
    scanError.value = "";

    // Initialize the code reader
    codeReader.value = new BrowserMultiFormatReader();

    // Get the video element
    const videoElement = document.getElementById("video") as HTMLVideoElement;
    if (!videoElement) {
      throw new Error("Video element not found");
    }

    // Start decoding from the video device
    await codeReader.value.decodeFromVideoDevice(
      null,
      videoElement,
      (result, error) => {
        if (result) {
          handleScanResult((result as any).text);
        }
      }
    );

    // Cleanup function
    cleanupScanner = () => {
      if (codeReader.value) {
        codeReader.value.reset();
      }
    };
  } catch (error) {
    console.error("Failed to start scanner:", error);
    isScanning.value = false;
    scanError.value =
      "Gagal mengakses kamera. Pastikan izin kamera telah diberikan.";
  }
};

/**
 * Stop the QR code scanner
 */
const stopScanner = () => {
  if (cleanupScanner) {
    cleanupScanner();
    cleanupScanner = null;
  }
  isScanning.value = false;
  codeReader.value = null;
};

/**
 * Handle successful QR code scan
 */
const handleScanResult = (qrText: string) => {
  try {
    // Stop scanning
    stopScanner();

    // Parse the QR code URL
    const url = new URL(qrText);

    // Check if it's a valid payment URL
    if (url.pathname === "/pay") {
      const merchant = url.searchParams.get("merchant");
      const amount = url.searchParams.get("amount");
      const orderId = url.searchParams.get("orderId");

      if (merchant && amount && orderId) {
        // Navigate to payment page
        router.push({
          path: "/pay",
          query: {
            merchant,
            amount,
            orderId,
          },
        });
      } else {
        throw new Error("Invalid payment QR code");
      }
    } else {
      throw new Error("Not a payment QR code");
    }
  } catch (error) {
    console.error("Invalid QR code:", error);
    scanError.value = "Kode QR tidak valid. Harap pindai kode QR pembayaran yang valid.";
    isScanning.value = false;
  }
};

/**
 * Retry scanning
 */
const retryScan = () => {
  scanError.value = "";
  startScanner();
};
</script>

<template>
  <div class="fixed inset-0 bg-black overflow-hidden flex flex-col">
    <!-- Top Bar -->
    <div class="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent pt-6">
      <button
        @click="router.push('/')"
        class="p-2 text-white hover:bg-white/10 rounded-full transition-colors"
      >
        <ArrowLeft :size="24" />
      </button>
      <h1 class="text-xl font-semibold text-white">Pindai QRIS</h1>
      <div class="flex items-center gap-2">
        <button
          @click="toggleFlash"
          class="p-2 text-white hover:bg-white/10 rounded-full transition-colors"
        >
          <Zap :size="24" :class="{ 'text-yellow-400 fill-yellow-400': isFlashOn, 'text-white': !isFlashOn }" />
        </button>
        <button
          @click="openGallery"
          class="p-2 text-white hover:bg-white/10 rounded-full transition-colors"
        >
          <ImageIcon :size="24" />
        </button>
      </div>
    </div>

    <!-- Video Element (Full Viewport Background) -->
    <video
      id="video"
      ref="videoRef"
      class="absolute inset-0 w-full h-full object-cover"
      autoplay
      playsinline
    ></video>
    
    <!-- Hidden File Input for Gallery -->
    <input
      type="file"
      ref="fileInput"
      accept="image/*"
      class="hidden"
      @change="handleFileUpload"
    />

    <!-- Overlay Focus Area -->
    <div class="absolute inset-0 z-10 pointer-events-none flex items-center justify-center overflow-hidden">
      <!-- Enormous box-shadow creates the dark overlay outside the transparent center -->
      <div class="relative w-64 h-64 sm:w-72 sm:h-72 rounded-xl shadow-[0_0_0_4000px_rgba(0,0,0,0.65)]">
        <!-- Corner markers -->
        <div class="absolute -top-1 -left-1 w-10 h-10 border-t-4 border-l-4 border-white rounded-tl-xl"></div>
        <div class="absolute -top-1 -right-1 w-10 h-10 border-t-4 border-r-4 border-white rounded-tr-xl"></div>
        <div class="absolute -bottom-1 -left-1 w-10 h-10 border-b-4 border-l-4 border-white rounded-bl-xl"></div>
        <div class="absolute -bottom-1 -right-1 w-10 h-10 border-b-4 border-r-4 border-white rounded-br-xl"></div>
        
        <!-- Scan Line Animation -->
        <div v-if="!scanError" class="absolute left-0 right-0 h-0.5 bg-green-400 shadow-[0_0_8px_#4ade80] animate-[scan_2.5s_ease-in-out_infinite]"></div>
      </div>
    </div>

    <!-- Loading State -->
    <div
      v-if="isScanning && !videoRef"
      class="absolute inset-0 z-30 flex items-center justify-center bg-black/50"
    >
      <Loader2 :size="48" class="text-white animate-spin" />
    </div>

    <!-- Error State -->
    <div
      v-if="scanError"
      class="absolute inset-0 z-30 flex items-center justify-center bg-black/80"
    >
      <div class="text-center p-6 max-w-xs bg-gray-900 rounded-2xl border border-gray-700 shadow-xl">
        <XCircle :size="48" class="text-red-500 mx-auto mb-4" />
        <p class="text-white mb-6">{{ scanError }}</p>
        <button
          @click="retryScan"
          class="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-xl transition-colors"
        >
          Coba Lagi
        </button>
      </div>
    </div>

    <!-- Bottom Instructions -->
    <div class="absolute bottom-12 left-0 right-0 z-20 text-center px-4">
      <p class="text-white bg-black/60 inline-block px-6 py-3 rounded-full text-sm font-medium backdrop-blur-md">
        Arahkan kamera ke kode QR / QRIS
      </p>
    </div>
  </div>
</template>

<style scoped>
@keyframes scan {
  0% { top: 0; opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { top: 100%; opacity: 0; }
}
</style>
