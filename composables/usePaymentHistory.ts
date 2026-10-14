import { ref, type Ref } from "vue";
import { createPublicClient, http, decodeEventLog } from "viem";
import { getArcChain } from "./useArcChain";
import { useBlockscout } from "./useBlockscout";

/**
 * Payment event structure from blockchain
 */
export interface PaymentEvent {
  merchant: `0x${string}`;
  payer: `0x${string}`;
  orderHash: `0x${string}`;
  orderId: string;
  amount: bigint;
  timestamp: bigint;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
}

/**
 * Receipt data structure
 */
export interface ReceiptData {
  transactionHash: `0x${string}`;
  blockNumber: bigint;
  timestamp: Date;
  status: "success" | "failed";
  amount: bigint;
  orderId: string;
  merchant: `0x${string}`;
  payer: `0x${string}`;
}

/**
 * Statistics data structure
 */
export interface StatsData {
  total: bigint;
  today: bigint;
  count: number;
  todayCount: number;
}

export const usePaymentHistory = () => {
  const chain = getArcChain();
  const flashArcPayAddress = import.meta.env.VITE_FLASH_ARC_PAY_ADDRESS;
  const { getContractEvents } = useBlockscout();

  let publicClient: any = null;

  /**
   * Initialize public client
   */
  const initializeClient = () => {
    if (!publicClient) {
      publicClient = createPublicClient({
        chain,
        transport: http(import.meta.env.VITE_ARC_RPC_URL || "https://rpc.mainnet.arc.io"),
      });
    }
    return publicClient;
  };

  /**
   * Get payment history for merchant using Blockscout API
   * @param merchant Merchant address
   * @param fromBlock Starting block number
   * @param toBlock Ending block number
   * @param limit Maximum number of logs to return
   * @returns Array of payment events
   */
  const getMerchantHistoryBlockscout = async (
    merchant: `0x${string}`,
    fromBlock: bigint,
    toBlock: bigint,
    limit: number = 20
  ): Promise<PaymentEvent[]> => {
    if (!flashArcPayAddress) {
      throw new Error("FlashArcPay contract address not set");
    }

    try {
      // Use Blockscout API to get logs
      const logs = await getContractEvents(
        flashArcPayAddress,
        Number(fromBlock),
        Number(toBlock)
      );

      // Filter by merchant address (indexed parameter)
      const merchantLogs = logs.filter((log: any) => {
        // Blockscout v2 might have decoded data already
        if (log.decoded && log.decoded.params) {
          // Check decoded params for merchant
          const merchantParam = log.decoded.params.find((p: any) =>
            p.name === "merchant" && p.value.toLowerCase() === merchant.toLowerCase()
          );
          return !!merchantParam;
        }

        // Fallback to topics filtering
        // Topics are padded with 0x to 32 bytes, need to extract the actual address
        // topic[1] contains merchant address (indexed parameter)
        if (log.topics && log.topics[1]) {
          // Extract address from topic (remove 0x and leading zeros padding)
          const topicMerchant = log.topics[1].toLowerCase();
          const actualMerchant = "0x" + topicMerchant.slice(topicMerchant.length - 40); // Take last 40 chars (20 bytes = 40 hex chars)
          return actualMerchant === merchant.toLowerCase();
        }
        return false;
      });

      // Convert logs to PaymentEvent format
      const events: PaymentEvent[] = merchantLogs
        .map((log: any) => {
          // Check if Blockscout already decoded the data
          if (log.decoded && log.decoded.params) {
            const params = log.decoded.params;
            const merchantAddr = params.find((p: any) => p.name === "merchant")?.value;
            const payer = params.find((p: any) => p.name === "payer")?.value;
            const orderHash = params.find((p: any) => p.name === "orderHash")?.value;
            const orderId = params.find((p: any) => p.name === "orderId")?.value;
            const amount = params.find((p: any) => p.name === "amount")?.value;
            const timestamp = params.find((p: any) => p.name === "timestamp")?.value;

            return {
              merchant: merchantAddr as `0x${string}`,
              payer: payer as `0x${string}`,
              orderHash: orderHash as `0x${string}`,
              orderId: orderId as string,
              amount: BigInt(amount || 0),
              timestamp: BigInt(timestamp || 0),
              blockNumber: BigInt(log.block_number || log.blockNumber),
              transactionHash: log.transaction_hash as `0x${string}`,
            };
          }

          // Fallback: Decode the event data manually
          const decoded = decodeEventLog({
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
            data: log.data,
            topics: log.topics,
          });

          return {
            merchant: decoded.args.merchant as `0x${string}`,
            payer: decoded.args.payer as `0x${string}`,
            orderHash: decoded.args.orderHash as `0x${string}`,
            orderId: decoded.args.orderId as string,
            amount: decoded.args.amount as bigint,
            timestamp: decoded.args.timestamp as bigint,
            blockNumber: BigInt(log.block_number || log.blockNumber),
            transactionHash: log.transaction_hash as `0x${string}`,
          };
        })
        .sort((a, b) => Number(b.timestamp - a.timestamp)) // Latest first
        .slice(0, limit || 10000);

      return events;
    } catch (error) {
      console.error("Failed to get merchant history from Blockscout:", error);
      throw error;
    }
  };

  /**
   * Get payment history for merchant
   * @param merchant Merchant address
   * @param fromBlock Starting block number
   * @param toBlock Ending block number
   * @param limit Maximum number of logs to return
   * @returns Array of payment events
   */
  const getMerchantHistory = async (
    merchant: `0x${string}`,
    fromBlock: bigint,
    toBlock: bigint,
    limit: number = 20
  ): Promise<PaymentEvent[]> => {
    // Try Blockscout API first (no rate limit issues)
    try {
      return await getMerchantHistoryBlockscout(merchant, fromBlock, toBlock, limit);
    } catch (error) {
      console.warn("Blockscout API failed, falling back to RPC:", error);
      // Fallback to RPC method
      return await getMerchantHistoryRPC(merchant, fromBlock, toBlock, limit);
    }
  };

  /**
   * Get payment history for merchant using RPC (fallback)
   * @param merchant Merchant address
   * @param fromBlock Starting block number
   * @param toBlock Ending block number
   * @param limit Maximum number of logs to return
   * @returns Array of payment events
   */
  const getMerchantHistoryRPC = async (
    merchant: `0x${string}`,
    fromBlock: bigint,
    toBlock: bigint,
    limit: number = 20
  ): Promise<PaymentEvent[]> => {
    const client = initializeClient();

    if (!flashArcPayAddress) {
      throw new Error("FlashArcPay contract address not set");
    }

    try {
      // Ultra conservative block range for Arc Network (500 to definitely avoid rate limit)
      const MAX_BLOCK_RANGE = 500n;
      const range = toBlock - fromBlock;

      let allLogs: any[] = [];

      if (range > MAX_BLOCK_RANGE) {
        // Chunk the range into smaller pieces
        let currentFrom = fromBlock;
        while (currentFrom < toBlock) {
          const currentTo = currentFrom + MAX_BLOCK_RANGE > toBlock
            ? toBlock
            : currentFrom + MAX_BLOCK_RANGE;

          const logs = await client.getLogs({
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
            fromBlock: currentFrom,
            toBlock: currentTo,
          });

          allLogs = allLogs.concat(logs);
          currentFrom = currentTo + 1n;

          // Longer delay to definitely avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } else {
        // Single request if range is within limits
        const logs = await client.getLogs({
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
          fromBlock,
          toBlock,
        });

        allLogs = logs;
      }

      // Convert logs to PaymentEvent format
      const events: PaymentEvent[] = allLogs
        .map((log: any) => ({
          merchant: log.args.merchant as `0x${string}`,
          payer: log.args.payer as `0x${string}`,
          orderHash: log.args.orderHash as `0x${string}`,
          orderId: log.args.orderId as string,
          amount: log.args.amount as bigint,
          timestamp: log.args.timestamp as bigint,
          blockNumber: log.blockNumber,
          transactionHash: log.transactionHash,
        }))
        .sort((a, b) => Number(b.timestamp - a.timestamp)) // Latest first
        .slice(0, limit || 10000); // Apply limit with high default if not specified

      return events;
    } catch (error) {
      console.error("Failed to get merchant history:", error);
      throw error;
    }
  };

  /**
   * Get payment history for customer using Blockscout API
   * @param payer Payer address
   * @param fromBlock Starting block number
   * @param toBlock Ending block number
   * @param limit Maximum number of logs to return
   * @returns Array of payment events
   */
  const getCustomerHistoryBlockscout = async (
    payer: `0x${string}`,
    fromBlock: bigint,
    toBlock: bigint,
    limit: number = 20
  ): Promise<PaymentEvent[]> => {
    if (!flashArcPayAddress) {
      throw new Error("FlashArcPay contract address not set");
    }

    try {
      // Use Blockscout API to get logs
      const logs = await getContractEvents(
        flashArcPayAddress,
        Number(fromBlock),
        Number(toBlock)
      );

      // Filter by payer address (indexed parameter)
      const payerLogs = logs.filter((log: any) => {
        // Blockscout v2 might have decoded data already
        if (log.decoded && log.decoded.params) {
          // Check decoded params for payer
          const payerParam = log.decoded.params.find((p: any) =>
            p.name === "payer" && p.value.toLowerCase() === payer.toLowerCase()
          );
          return !!payerParam;
        }

        // Fallback to topics filtering
        // Topics are padded with 0x to 32 bytes, need to extract the actual address
        // topic[2] contains payer address (indexed parameter)
        if (log.topics && log.topics[2]) {
          // Extract address from topic (remove 0x and leading zeros padding)
          const topicPayer = log.topics[2].toLowerCase();
          const actualPayer = "0x" + topicPayer.slice(topicPayer.length - 40); // Take last 40 chars (20 bytes = 40 hex chars)
          return actualPayer === payer.toLowerCase();
        }
        return false;
      });

      // Convert logs to PaymentEvent format
      const events: PaymentEvent[] = payerLogs
        .map((log: any) => {
          // Check if Blockscout already decoded the data
          if (log.decoded && log.decoded.params) {
            const params = log.decoded.params;
            const merchant = params.find((p: any) => p.name === "merchant")?.value;
            const payerAddr = params.find((p: any) => p.name === "payer")?.value;
            const orderHash = params.find((p: any) => p.name === "orderHash")?.value;
            const orderId = params.find((p: any) => p.name === "orderId")?.value;
            const amount = params.find((p: any) => p.name === "amount")?.value;
            const timestamp = params.find((p: any) => p.name === "timestamp")?.value;

            return {
              merchant: merchant as `0x${string}`,
              payer: payerAddr as `0x${string}`,
              orderHash: orderHash as `0x${string}`,
              orderId: orderId as string,
              amount: BigInt(amount || 0),
              timestamp: BigInt(timestamp || 0),
              blockNumber: BigInt(log.block_number || log.blockNumber),
              transactionHash: log.transaction_hash as `0x${string}`,
            };
          }

          // Fallback: Decode the event data manually
          const decoded = decodeEventLog({
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
            data: log.data,
            topics: log.topics,
          });

          return {
            merchant: decoded.args.merchant as `0x${string}`,
            payer: decoded.args.payer as `0x${string}`,
            orderHash: decoded.args.orderHash as `0x${string}`,
            orderId: decoded.args.orderId as string,
            amount: decoded.args.amount as bigint,
            timestamp: decoded.args.timestamp as bigint,
            blockNumber: BigInt(log.block_number || log.blockNumber),
            transactionHash: log.transaction_hash as `0x${string}`,
          };
        })
        .sort((a, b) => Number(b.timestamp - a.timestamp)) // Latest first
        .slice(0, limit || 10000);

      return events;
    } catch (error) {
      console.error("Failed to get customer history from Blockscout:", error);
      throw error;
    }
  };

  /**
   * Get payment history for customer
   * @param payer Payer address
   * @param fromBlock Starting block number
   * @param toBlock Ending block number
   * @param limit Maximum number of logs to return
   * @returns Array of payment events
   */
  const getCustomerHistory = async (
    payer: `0x${string}`,
    fromBlock: bigint,
    toBlock: bigint,
    limit: number = 20
  ): Promise<PaymentEvent[]> => {
    // Try Blockscout API first (no rate limit issues)
    try {
      return await getCustomerHistoryBlockscout(payer, fromBlock, toBlock, limit);
    } catch (error) {
      console.warn("Blockscout API failed, falling back to RPC:", error);
      // Fallback to RPC method
      return await getCustomerHistoryRPC(payer, fromBlock, toBlock, limit);
    }
  };

  /**
   * Get payment history for customer using RPC (fallback)
   * @param payer Payer address
   * @param fromBlock Starting block number
   * @param toBlock Ending block number
   * @param limit Maximum number of logs to return
   * @returns Array of payment events
   */
  const getCustomerHistoryRPC = async (
    payer: `0x${string}`,
    fromBlock: bigint,
    toBlock: bigint,
    limit: number = 20
  ): Promise<PaymentEvent[]> => {
    const client = initializeClient();

    if (!flashArcPayAddress) {
      throw new Error("FlashArcPay contract address not set");
    }

    try {
      // Ultra conservative block range for Arc Network (500 to definitely avoid rate limit)
      const MAX_BLOCK_RANGE = 500n;
      const range = toBlock - fromBlock;

      let allLogs: any[] = [];

      if (range > MAX_BLOCK_RANGE) {
        // Chunk the range into smaller pieces
        let currentFrom = fromBlock;
        while (currentFrom < toBlock) {
          const currentTo = currentFrom + MAX_BLOCK_RANGE > toBlock
            ? toBlock
            : currentFrom + MAX_BLOCK_RANGE;

          const logs = await client.getLogs({
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
              payer,
            },
            fromBlock: currentFrom,
            toBlock: currentTo,
          });

          allLogs = allLogs.concat(logs);
          currentFrom = currentTo + 1n;

          // Longer delay to definitely avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } else {
        // Single request if range is within limits
        const logs = await client.getLogs({
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
            payer,
          },
          fromBlock,
          toBlock,
        });

        allLogs = logs;
      }

      // Convert logs to PaymentEvent format
      const events: PaymentEvent[] = allLogs
        .map((log: any) => ({
          merchant: log.args.merchant as `0x${string}`,
          payer: log.args.payer as `0x${string}`,
          orderHash: log.args.orderHash as `0x${string}`,
          orderId: log.args.orderId as string,
          amount: log.args.amount as bigint,
          timestamp: log.args.timestamp as bigint,
          blockNumber: log.blockNumber,
          transactionHash: log.transactionHash,
        }))
        .sort((a, b) => Number(b.timestamp - a.timestamp)) // Latest first
        .slice(0, limit || 10000); // Apply limit with high default if not specified

      return events;
    } catch (error) {
      console.error("Failed to get customer history:", error);
      throw error;
    }
  };

  /**
   * Get receipt details by transaction hash
   * @param txHash Transaction hash
   * @returns Receipt data
   */
  const getReceiptByTxHash = async (txHash: `0x${string}`): Promise<ReceiptData> => {
    const client = initializeClient();

    try {
      // Get transaction receipt
      const receipt = await client.getTransactionReceipt({ hash: txHash });

      if (!receipt) {
        throw new Error("Transaction receipt not found");
      }

      // Get block info for timestamp
      const block = await client.getBlock({ blockNumber: receipt.blockNumber });

      // Parse logs to get payment details
      const paymentLogs = receipt.logs.filter((log: any) => {
        return log.address.toLowerCase() === flashArcPayAddress?.toLowerCase();
      });

      if (paymentLogs.length === 0) {
        throw new Error("No payment logs found in transaction");
      }

      // Decode the event log
      const log = paymentLogs[0];
      const event = decodeEventLog({
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
        data: log.data,
        topics: log.topics,
      });

      return {
        transactionHash: txHash,
        blockNumber: receipt.blockNumber,
        timestamp: new Date(Number(block.timestamp) * 1000),
        status: receipt.status === "success" ? "success" : "failed",
        amount: event.args.amount as bigint,
        orderId: event.args.orderId as string,
        merchant: event.args.merchant as `0x${string}`,
        payer: event.args.payer as `0x${string}`,
      };
    } catch (error) {
      console.error("Failed to get receipt by txHash:", error);
      throw error;
    }
  };

  /**
   * Get receipt details by order ID
   * @param orderId Order ID
   * @param merchant Merchant address (optional for filtering)
   * @returns Array of receipt data (could be multiple if collision)
   */
  const getReceiptByOrderId = async (
    orderId: string,
    merchant?: `0x${string}`
  ): Promise<ReceiptData[]> => {
    const client = initializeClient();

    if (!flashArcPayAddress) {
      throw new Error("FlashArcPay contract address not set");
    }

    try {
      // Get current block number
      const currentBlock = await client.getBlockNumber();

      // Fetch last 10,000 blocks for practical history (recent transactions)
      const fromBlock = currentBlock - 10000n > 0n ? currentBlock - 10000n : 0n;

      // Ultra conservative block range for Arc Network (500 to definitely avoid rate limit)
      const MAX_BLOCK_RANGE = 500n;
      const range = currentBlock - fromBlock;

      let allLogs: any[] = [];

      if (range > MAX_BLOCK_RANGE) {
        // Chunk the range into smaller pieces
        let currentFrom = fromBlock;
        while (currentFrom < currentBlock) {
          const currentTo = currentFrom + MAX_BLOCK_RANGE > currentBlock
            ? currentBlock
            : currentFrom + MAX_BLOCK_RANGE;

          const logs = await client.getLogs({
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
            args: merchant ? { merchant } : undefined,
            fromBlock: currentFrom,
            toBlock: currentTo,
          });

          allLogs = allLogs.concat(logs);
          currentFrom = currentTo + 1n;

          // Longer delay to definitely avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } else {
        // Single request if range is within limits
        const logs = await client.getLogs({
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
          args: merchant ? { merchant } : undefined,
          fromBlock,
          toBlock: currentBlock,
        });

        allLogs = logs;
      }

      // Filter by orderId
      const filteredLogs = allLogs.filter((log: any) => {
        const decoded = decodeEventLog({
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
          data: log.data,
          topics: log.topics,
        });
        return decoded.args.orderId === orderId;
      });

      // Convert to ReceiptData format
      const receipts: ReceiptData[] = await Promise.all(
        filteredLogs.map(async (log: any) => {
          const block = await client.getBlock({ blockNumber: log.blockNumber });
          const decoded = decodeEventLog({
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
            data: log.data,
            topics: log.topics,
          });

          return {
            transactionHash: log.transactionHash,
            blockNumber: log.blockNumber,
            timestamp: new Date(Number(block.timestamp) * 1000),
            status: "success", // If it's in the logs, it succeeded
            amount: decoded.args.amount as bigint,
            orderId: decoded.args.orderId as string,
            merchant: decoded.args.merchant as `0x${string}`,
            payer: decoded.args.payer as `0x${string}`,
          };
        })
      );

      return receipts;
    } catch (error) {
      console.error("Failed to get receipt by orderId:", error);
      throw error;
    }
  };

  /**
   * Calculate stats from transaction list
   * @param transactions Array of payment events
   * @returns Stats data
   */
  const calculateStats = (transactions: PaymentEvent[]): StatsData => {
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ).getTime();
    const todayEnd = todayStart + 24 * 60 * 60 * 1000;

    let total = 0n;
    let today = 0n;
    let count = 0;
    let todayCount = 0;

    transactions.forEach((tx) => {
      total += tx.amount;
      count++;

      const txTimestamp = Number(tx.timestamp) * 1000;
      if (txTimestamp >= todayStart && txTimestamp < todayEnd) {
        today += tx.amount;
        todayCount++;
      }
    });

    return {
      total,
      today,
      count,
      todayCount,
    };
  };

  /**
   * Watch for new payments (merchant or customer)
   * @param address Address to watch (merchant or payer)
   * @param role Role of the address ('merchant' | 'customer')
   * @param callback Callback function when new payment detected
   * @returns Cleanup function to stop watching
   */
  const watchNewPayments = (
    address: `0x${string}`,
    role: "merchant" | "customer",
    callback: (event: PaymentEvent) => void
  ): (() => void) => {
    const client = initializeClient();

    if (!flashArcPayAddress) {
      console.error("FlashArcPay contract address not set");
      return () => {};
    }

    let pollingInterval: ReturnType<typeof setInterval> | null = null;
    let lastProcessedBlock: bigint | null = null;

    // Initialize with current block
    const initializeBlock = async () => {
      try {
        lastProcessedBlock = await client.getBlockNumber();
        console.log("Initialized payment watcher at block:", lastProcessedBlock?.toString());
      } catch (error) {
        console.error("Failed to get initial block:", error);
      }
    };

    // Start event watching
    try {
      const unwatch = client.watchContractEvent({
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
        args: role === "merchant" ? { merchant: address } : { payer: address },
        onLogs: (logs: any[]) => {
          logs.forEach((log) => {
            const event: PaymentEvent = {
              merchant: log.args.merchant as `0x${string}`,
              payer: log.args.payer as `0x${string}`,
              orderHash: log.args.orderHash as `0x${string}`,
              orderId: log.args.orderId as string,
              amount: log.args.amount as bigint,
              timestamp: log.args.timestamp as bigint,
              blockNumber: log.blockNumber,
              transactionHash: log.transactionHash,
            };
            callback(event);
          });
        },
      });

      // Initialize block before starting polling
      initializeBlock();

      // Fallback polling every 5 seconds
      pollingInterval = setInterval(async () => {
        try {
          const currentBlock = await client.getBlockNumber();

          if (lastProcessedBlock && currentBlock > lastProcessedBlock) {
            const fromBlock = lastProcessedBlock + 1n;
            const toBlock = currentBlock;

            // Limit range to avoid RPC errors
            if (toBlock - fromBlock > 1000n) {
              const safeFromBlock = toBlock - 100n;
              const logs = await client.getLogs({
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
                args: role === "merchant" ? { merchant: address } : { payer: address },
                fromBlock: safeFromBlock,
                toBlock: toBlock,
              });

              logs.forEach((log: any) => {
                const event: PaymentEvent = {
                  merchant: log.args.merchant as `0x${string}`,
                  payer: log.args.payer as `0x${string}`,
                  orderHash: log.args.orderHash as `0x${string}`,
                  orderId: log.args.orderId as string,
                  amount: log.args.amount as bigint,
                  timestamp: log.args.timestamp as bigint,
                  blockNumber: log.blockNumber,
                  transactionHash: log.transactionHash,
                };
                callback(event);
              });

              lastProcessedBlock = toBlock;
            } else {
              const logs = await client.getLogs({
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
                args: role === "merchant" ? { merchant: address } : { payer: address },
                fromBlock: fromBlock,
                toBlock: toBlock,
              });

              logs.forEach((log: any) => {
                const event: PaymentEvent = {
                  merchant: log.args.merchant as `0x${string}`,
                  payer: log.args.payer as `0x${string}`,
                  orderHash: log.args.orderHash as `0x${string}`,
                  orderId: log.args.orderId as string,
                  amount: log.args.amount as bigint,
                  timestamp: log.args.timestamp as bigint,
                  blockNumber: log.blockNumber,
                  transactionHash: log.transactionHash,
                };
                callback(event);
              });

              lastProcessedBlock = toBlock;
            }
          }
        } catch (error) {
          console.error("Polling error:", error);
          if (lastProcessedBlock) {
            lastProcessedBlock = null;
          }
        }
      }, 5000);

      return () => {
        unwatch();
        if (pollingInterval) {
          clearInterval(pollingInterval);
        }
      };
    } catch (error) {
      console.error("Failed to watch new payments:", error);
      return () => {};
    }
  };

  return {
    initializeClient,
    getMerchantHistory,
    getCustomerHistory,
    getReceiptByTxHash,
    getReceiptByOrderId,
    calculateStats,
    watchNewPayments,
  };
};
