import { type Ref } from "vue";

/**
 * Transaction data from Blockscout API
 */
export interface BlockscoutTransaction {
  hash: string;
  blockNumber: number;
  timestamp: string;
  from: string;
  to: string;
  value: string;
  status: string;
  method: string;
}

/**
 * Transaction list response from Blockscout API
 */
export interface BlockscoutTransactionsResponse {
  items: BlockscoutTransaction[];
  nextPageParams: string | null;
}

export const useBlockscout = () => {
  const API_BASE_URL = import.meta.env.VITE_BLOCKSCOUT_API_BASE_URL || "https://api.blockscout.com";
  const CHAIN_ID = import.meta.env.VITE_BLOCKSCOUT_CHAIN_ID || "arc-testnet";
  const API_KEY = import.meta.env.VITE_BLOCKSCOUT_API_KEY;

  /**
   * Get transactions for an address from Blockscout API v2
   * @param address Wallet address
   * @param page Page number (default: 1)
   * @param itemsPerPage Items per page (default: 100)
   * @returns Array of transactions
   */
  const getAddressTransactions = async (
    address: string,
    page: number = 1,
    itemsPerPage: number = 100
  ): Promise<BlockscoutTransaction[]> => {
    try {
      const url = `${API_BASE_URL}/${CHAIN_ID}/api/v2/addresses/${address}/transactions?apikey=${API_KEY}&page=${page}&itemsPerPage=${itemsPerPage}`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Blockscout API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.items) {
        return [];
      }

      return data.items || [];
    } catch (error) {
      console.error("Failed to fetch transactions from Blockscout:", error);
      throw error;
    }
  };

  /**
   * Get all transactions for an address (paginated)
   * @param address Wallet address
   * @param maxPages Maximum pages to fetch (default: 10)
   * @returns Array of all transactions
   */
  const getAllAddressTransactions = async (
    address: string,
    maxPages: number = 10
  ): Promise<BlockscoutTransaction[]> => {
    let allTransactions: BlockscoutTransaction[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= maxPages) {
      try {
        const transactions = await getAddressTransactions(address, page, 100);

        if (transactions.length === 0) {
          hasMore = false;
        } else {
          allTransactions = [...allTransactions, ...transactions];
          page++;
        }
      } catch (error) {
        console.error(`Failed to fetch page ${page}:`, error);
        hasMore = false;
      }
    }

    return allTransactions;
  };

  /**
   * Get contract events for a specific contract using backend proxy
   * @param contractAddress Contract address
   * @param fromBlock Starting block number
   * @param toBlock Ending block number
   * @param eventName Event name filter (optional)
   * @returns Array of logs
   */
  const getContractEvents = async (
    contractAddress: string,
    fromBlock: number = 0,
    toBlock: number = 99999999,
    eventName?: string
  ): Promise<any[]> => {
    try {
      // Use backend proxy to hide API key
      const url = `/api/blockscout/logs?address=${contractAddress}&fromBlock=${fromBlock}&toBlock=${toBlock}`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Backend proxy error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.items) {
        return [];
      }

      return data.items || [];
    } catch (error) {
      console.error("Failed to fetch events from backend proxy:", error);
      throw error;
    }
  };

  return {
    getAddressTransactions,
    getAllAddressTransactions,
    getContractEvents,
  };
};
