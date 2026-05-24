import { createPublicClient, http, parseEventLogs, getAddress } from "viem";
import { mainnet } from "viem/chains";
import {
  CRON_CURSOR_KEY,
  NORMIES_CONTRACT,
  TRANSFER_CONFIRMATIONS,
  TRANSFER_EVENT_TOPIC,
  agentRouteKey,
  normiesAbi,
} from "@normieagent/shared";
import type { Env } from "./env.js";

export interface RunResult {
  fromBlock: number;
  toBlock: number;
  logsScanned: number;
  routesUpdated: number;
  bootstrapped: boolean;
}

/**
 * Scan the Normies contract for Transfer events since the last persisted
 * cursor, and reconcile any transfers that involve a registered agent.
 *
 * On the first run (no cursor in KV) we don't replay history: we simply
 * store `latest - TRANSFER_CONFIRMATIONS` as the cursor and exit. From then
 * on we only ever process newly-confirmed blocks.
 */
export async function processTransfers(env: Env): Promise<RunResult> {
  const client = createPublicClient({
    chain: mainnet,
    transport: http(`https://mainnet.infura.io/v3/${env.INFURA_API_KEY}`),
  });

  const latest = Number(await client.getBlockNumber());
  const safeHead = latest - TRANSFER_CONFIRMATIONS;
  const maxRange = Math.max(1, Number.parseInt(env.MAX_BLOCKS_PER_RUN, 10) || 2000);

  const cursorRaw = await env.AGENT_ROUTES_KV.get(CRON_CURSOR_KEY);
  const cursor = cursorRaw ? Number.parseInt(cursorRaw, 10) : NaN;

  // Bootstrap path — first ever run, no history to backfill.
  if (!Number.isFinite(cursor)) {
    await env.AGENT_ROUTES_KV.put(CRON_CURSOR_KEY, String(safeHead));
    return {
      fromBlock: safeHead,
      toBlock: safeHead,
      logsScanned: 0,
      routesUpdated: 0,
      bootstrapped: true,
    };
  }

  const fromBlock = cursor + 1;
  if (fromBlock > safeHead) {
    return {
      fromBlock,
      toBlock: cursor,
      logsScanned: 0,
      routesUpdated: 0,
      bootstrapped: false,
    };
  }

  const toBlock = Math.min(safeHead, fromBlock + maxRange - 1);

  const rawLogs = await client.getLogs({
    address: NORMIES_CONTRACT,
    fromBlock: BigInt(fromBlock),
    toBlock: BigInt(toBlock),
    event: {
      type: "event",
      name: "Transfer",
      inputs: [
        { name: "from", type: "address", indexed: true },
        { name: "to", type: "address", indexed: true },
        { name: "tokenId", type: "uint256", indexed: true },
      ],
    },
  });

  // Defensive parse — viem already typed the result above, but parseEventLogs
  // also filters by topic so any future contract events with different shapes
  // do not slip through.
  const decoded = parseEventLogs({
    abi: normiesAbi,
    eventName: "Transfer",
    logs: rawLogs,
  });

  const routesUpdated = await reconcileTransfers(env, decoded);

  await env.AGENT_ROUTES_KV.put(CRON_CURSOR_KEY, String(toBlock));

  return {
    fromBlock,
    toBlock,
    logsScanned: decoded.length,
    routesUpdated,
    bootstrapped: false,
  };
}

type DecodedTransfer = {
  args: { from: `0x${string}`; to: `0x${string}`; tokenId: bigint };
  transactionHash: `0x${string}` | null;
  blockNumber: bigint | null;
};

/**
 * For each transferred tokenId that matches a registered agent_routes row,
 * update its owner_wallet, append a transfer_log entry, and invalidate KV.
 */
async function reconcileTransfers(
  env: Env,
  events: readonly DecodedTransfer[],
): Promise<number> {
  if (events.length === 0) return 0;

  // The same tokenId may transfer twice within one window — only the last
  // event matters for the registry, but every event must be logged. Sort by
  // block number ascending so we apply updates in chronological order.
  const ordered = [...events].sort((a, b) => {
    const ab = a.blockNumber ?? 0n;
    const bb = b.blockNumber ?? 0n;
    return ab < bb ? -1 : ab > bb ? 1 : 0;
  });

  const uniqueTokenIds = Array.from(
    new Set(ordered.map((e) => Number(e.args.tokenId))),
  );

  const placeholders = uniqueTokenIds.map((_, i) => `?${i + 1}`).join(",");
  const { results } = await env.DB.prepare(
    `SELECT normie_id, agent_name FROM agent_routes
      WHERE normie_id IN (${placeholders})`,
  )
    .bind(...uniqueTokenIds)
    .all<{ normie_id: number; agent_name: string }>();

  if (results.length === 0) return 0;

  const registered = new Map(results.map((r) => [r.normie_id, r.agent_name]));
  const now = Math.floor(Date.now() / 1000);
  let updates = 0;

  for (const ev of ordered) {
    const tokenId = Number(ev.args.tokenId);
    const agentName = registered.get(tokenId);
    if (!agentName) continue;
    if (!ev.transactionHash) continue;

    const from = getAddress(ev.args.from).toLowerCase();
    const to = getAddress(ev.args.to).toLowerCase();

    await env.DB.batch([
      env.DB.prepare(
        `UPDATE agent_routes
            SET owner_wallet = ?1, updated_at = ?2
          WHERE normie_id = ?3`,
      ).bind(to, now, tokenId),
      env.DB.prepare(
        `INSERT INTO transfer_log
           (normie_id, agent_name, from_wallet, to_wallet, tx_hash, transferred_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
      ).bind(tokenId, agentName, from, to, ev.transactionHash, now),
    ]);

    // The route remains live with the same target_url — only management
    // ownership changes. Drop the KV entry so the next dispatch reads from
    // D1 once and re-warms with the latest (unchanged) target.
    await env.AGENT_ROUTES_KV.delete(agentRouteKey(agentName));
    updates += 1;
  }

  return updates;
}
