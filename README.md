# FlashArcPay Nusantara ⚡️🇮🇩

> _Indonesian QRIS-Standard Payment Experience Built Native on Arc Network via Circle Arc App Kit._

[![Arc Network](https://img.shields.io/badge/Network-Arc_Testnet--Mainnet-blue)](https://arc.io)
[![Circle App Kit](https://img.shields.io/badge/SDK-Circle_App_Kit-purple)](https://docs.arc.io/app-kit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Executive Overview

FlashArcPay Nusantara adapts the seamless experience of Indonesia's national QRIS payment standard to the Arc Network. By harnessing Arc's **native USDC gas architecture** alongside Circle's **Arc App Kit SDK** (`@circle-fin/app-kit`), it empowers local micro-merchants and consumers to perform instant, zero-friction Web3 payments in under 2 seconds.

## Key Innovation Features

1. **Dynamic POS QR Generator:** Real-time generation of QR codes encoding merchant metadata, exact USDC amounts, and unique order hashes.
2. **Powered by Circle Arc App Kit:**
   - **Instant Transfers (`kit.send()`):** Seamless 1-click USDC execution between buyer and merchant contract.
   - **Cross-Chain Spending (`kit.unifiedBalance()`):** Chain-abstracted payments allowing buyers with USDC on external EVM chains to pay directly.
3. **Replay-Protected Smart Contract:** Hardened on-chain validation (`FlashArcPay.sol`) preventing duplicate order processing via `processedOrders` hash mappings.
4. **Hybrid POS Listener:** Real-time POS status confirmation combining WebSockets event watching with automated RPC polling fallback.

## 📜 Deployed Smart Contracts

- **Arc Testnet:** [`0x947BdA3ec4033984a5e04bA059c678Bc3394445f`](https://explorer.testnet.arc.io/address/0x947BdA3ec4033984a5e04bA059c678Bc3394445f)
- **Arc Mainnet:** [`0xE617dE9Fdc760A4a4A28a4874F47BBD4a67CB90f`](https://explorer.arc.io/address/0xE617dE9Fdc760A4a4A28a4874F47BBD4a67CB90f)

## Tech Stack

### Smart Contract Layer
- **Framework:** Hardhat `^2.22.0` with Solidity `^0.8.20`
- **Security:** OpenZeppelin Contracts `^5.0.0` (ReentrancyGuard, SafeERC20)
- **Testing:** Hardhat Toolbox with comprehensive unit tests

### Frontend Layer
- **Framework:** Nuxt 3 (v3.11+) in SPA Mode (`ssr: false`)
- **Language:** TypeScript (v5.3+) in Strict Mode
- **Styling:** Tailwind CSS via `@nuxtjs/tailwindcss`
- **Arc SDK Suite:** 
  - `@circle-fin/app-kit` `^1.0.0`
  - `@circle-fin/adapter-viem-v2` `^1.0.0`
  - `viem` `^2.9.0`
- **QR Generation:** `qrcode` `^1.5.3`
- **QR Scanner:** `@zxing/library` `^0.21.0`
- **Icons:** `lucide-vue-next` `^0.350.0`

## Quickstart Guide

### 1. Smart Contracts Setup

```bash
cd contracts
npm install
npx hardhat test
npx hardhat run scripts/deploy.js --network arcMainnet
```

### 2. Nuxt 3 Web Application Setup

```bash
npm install
npm run dev
```

### 3. Local Environment Configuration (`.env`)

```env
# Frontend Environment Variables (Arc Mainnet)
VITE_ARC_RPC_URL="https://rpc.mainnet.arc.io"
VITE_ARC_CHAIN_ID=5042
VITE_ARC_EXPLORER_URL="https://explorer.arc.io"
VITE_FLASH_ARC_PAY_ADDRESS="0xE617dE9Fdc760A4a4A28a4874F47BBD4a67CB90f"
VITE_USDC_CONTRACT_ADDRESS="0x3600000000000000000000000000000000000"
```

### 4. Smart Contract Environment Configuration (`contracts/.env`)

```env
# Smart Contract Deployment (Arc Mainnet)
MAINNET_PRIVATE_KEY="your_private_key_here"
ARC_MAINNET_RPC_URL="https://rpc.mainnet.arc.io"
ARC_MAINNET_CHAIN_ID=5042
MAINNET_USDC_CONTRACT_ADDRESS="0x3600000000000000000000000000000000000"
```

## Project Structure

```
fapnus/
├── contracts/              # Smart Contract Layer
│   ├── contracts/          # Solidity contracts
│   │   ├── FlashArcPay.sol # Main payment contract
│   │   └── MockUSDC.sol    # Test utility
│   ├── test/               # Hardhat tests
│   ├── scripts/            # Deployment scripts
│   └── hardhat.config.js   # Hardhat configuration
├── composables/            # Vue composables
│   ├── useArcChain.ts      # Arc chain configuration
│   └── useArcAppKit.ts     # App Kit integration
├── pages/                  # Nuxt pages
│   ├── index.vue           # Landing page
│   ├── merchant.vue        # Merchant POS interface
│   ├── pay.vue             # Customer payment page
│   └── scan.vue            # QR scanner
└── .env                    # Environment variables
```

## Architecture Overview

### Smart Contract Layer (`FlashArcPay.sol`)

The smart contract implements:
- **Order Hash Replay Protection:** Uses `keccak256(merchant, orderId, amount)` to generate unique order hashes
- **Processed Orders Mapping:** Prevents duplicate payment processing
- **ReentrancyGuard:** Protects against reentrancy attacks
- **SafeERC20:** Secure USDC transfers
- **Event Emission:** `PaymentProcessed` event for real-time tracking

### Frontend Architecture

1. **Merchant POS (`pages/merchant.vue`):**
   - Input USDC amount and Order ID
   - Generate dynamic QR code with payment URL
   - Hybrid event listener (WebSocket + 2.5s RPC polling fallback)
   - Real-time payment status updates

2. **Customer Payment (`pages/pay.vue`):**
   - Parse QR code URL parameters
   - Wallet connection via Arc App Kit
   - USDC balance checking (6 decimals)
   - Contract interaction for payment execution
   - Real-time payment feedback states

3. **QR Scanner (`pages/scan.vue`):**
   - WebRTC-based camera integration
   - Safe mounting in Vue `onMounted()` hook
   - Automatic routing to payment page on successful scan

### Arc App Kit Integration (`composables/useArcAppKit.ts`)

The composable provides:
- **Wallet Connection:** Viem-based wallet client initialization
- **USDC Balance Fetching:** 6-decimal standard compliance
- **Payment Execution:** Direct contract interaction via `payMerchant()`
- **Event Listening:** Hybrid WebSocket + polling for payment events
- **Cross-Chain Support:** Placeholder for `unifiedBalance()` and `bridge()`

## Testing

### Smart Contract Tests

```bash
cd contracts
npx hardhat test
```

Expected output: 14 passing tests

### Frontend Type Checking

```bash
npx nuxi typecheck
```

Expected output: 0 TypeScript errors

### Production Build

```bash
npm run build
```

Expected output: Clean production bundle in `.output/`

## Security Considerations

1. **Replay Protection:** All payments are protected by order hash verification
2. **Reentrancy Guard:** Contract uses OpenZeppelin's ReentrancyGuard
3. **SafeERC20:** All token transfers use SafeERC20 for additional safety
4. **6-Decimal Standard:** All USDC calculations respect Arc's 6-decimal format
5. **Environment Isolation:** No hardcoded credentials; all from .env files

## Deployment

### Smart Contract Deployment

1. Configure `contracts/.env` with your private key and RPC URL
2. Run deployment script:
```bash
cd contracts
npx hardhat run scripts/deploy.js --network arcMainnet
```
3. Update root `.env` with deployed contract address

### Frontend Deployment

1. Build the application:
```bash
npm run build
```
2. Deploy the `.output` directory to your hosting provider
3. Ensure environment variables are set in production

## License

MIT License - see LICENSE file for details

## Contributing

This project is part of the Arc Network Microgrants program. For contributions, please follow standard GitHub fork and pull request workflow.

## Support

For issues and questions:
- Arc Network Documentation: https://docs.arc.io
- Circle App Kit Documentation: https://docs.arc.io/app-kit
- GitHub Issues: [Create an issue](https://github.com/your-repo/flasharcpay-nusantara/issues)

---

**Built with ❤️ for the Arc Network ecosystem**
