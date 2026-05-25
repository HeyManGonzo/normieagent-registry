/**
 * Thin Etherscan V2 client used by the claim processor. V2 unified the
 * per-network endpoints behind a single host with a `chainid` query param,
 * so the URL shape is:
 *
 *   https://api.etherscan.io/v2/api?chainid=1&module=…&action=…&apikey=…
 *
 * We only need one action — `account/txlist` — to list incoming ETH transfers
 * to the operator wallet. Internal transactions are intentionally NOT scanned:
 * users are instructed to send a plain EOA-to-EOA transfer.
 */

const ETHERSCAN_V2_BASE = "https://api.etherscan.io/v2/api";
const ETH_MAINNET_CHAIN_ID = 1;

/** Single row from `account/txlist`. Etherscan returns everything as strings. */
export interface EtherscanTx {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  nonce: string;
  blockHash: string;
  transactionIndex: string;
  from: string;
  to: string;
  value: string;
  gas: string;
  gasPrice: string;
  isError: string;
  txreceipt_status: string;
  input: string;
  contractAddress: string;
  cumulativeGasUsed: string;
  gasUsed: string;
  confirmations: string;
  methodId: string;
  functionName: string;
}

interface TxlistResponse {
  status: string;
  message: string;
  result: EtherscanTx[] | string;
}

/**
 * Fetch transactions for `address` within `[startBlock, endBlock]`, oldest
 * first. Etherscan caps a single page at 10000 rows; the operator wallet
 * traffic should be a tiny fraction of that per 5-minute tick, so a single
 * page with offset=1000 is plenty of headroom.
 *
 * Returns an empty array on Etherscan's "No transactions found" response
 * rather than throwing — that's a normal idle state.
 */
export async function fetchOperatorTxs(
  apiKey: string,
  address: string,
  startBlock: number,
  endBlock: number,
): Promise<EtherscanTx[]> {
  const url =
    `${ETHERSCAN_V2_BASE}?chainid=${ETH_MAINNET_CHAIN_ID}` +
    `&module=account&action=txlist` +
    `&address=${encodeURIComponent(address)}` +
    `&startblock=${startBlock}&endblock=${endBlock}` +
    `&page=1&offset=1000&sort=asc` +
    `&apikey=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Etherscan HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const body = (await res.json()) as TxlistResponse;

  // "No transactions found" — status="0", message="No transactions found",
  // result is the empty array (sometimes a string). Treat as zero results.
  if (body.status !== "1") {
    if (typeof body.message === "string" && /no transactions/i.test(body.message)) {
      return [];
    }
    // Real error (rate limit, invalid key, etc.) — surface it.
    const msg = typeof body.result === "string" ? body.result : body.message;
    throw new Error(`Etherscan error: ${msg}`);
  }
  return Array.isArray(body.result) ? body.result : [];
}
