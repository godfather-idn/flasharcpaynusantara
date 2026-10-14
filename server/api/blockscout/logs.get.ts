import { eventHandler, getQuery } from 'h3';

export default eventHandler(async (event) => {
  const query = getQuery(event);
  const { address, fromBlock, toBlock } = query;

  if (!address) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing address parameter',
    });
  }

  const API_BASE_URL = process.env.BLOCKSCOUT_API_BASE_URL || 'https://api.blockscout.com';
  const CHAIN_ID = process.env.BLOCKSCOUT_CHAIN_ID || '5042002';
  const API_KEY = process.env.BLOCKSCOUT_API_KEY;

  if (!API_KEY) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Blockscout API key not configured on server',
    });
  }

  const url = `${API_BASE_URL}/${CHAIN_ID}/api/v2/addresses/${address}/logs?apikey=${API_KEY}&fromBlock=${fromBlock || 0}&toBlock=${toBlock || 99999999}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw createError({
        statusCode: response.status,
        statusMessage: `Blockscout API error: ${response.statusText}`,
      });
    }

    const data = await response.json();

    return data;
  } catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch logs from Blockscout',
    });
  }
});
