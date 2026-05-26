/**
 * Claim-payment processor. Runs on every cron tick alongside processTransfers().
 *
 * Responsibilities:
 *  1. Expire stale pending_claims rows whose TTL has elapsed.
 *  2. Scan the operator wallet for incoming ETH via Etherscan V2.
 *  3. For each matching tx: re-verify on-chain ownership and either promote the
 *     claim into agent_routes (confirmed) or mark it failed_ownership.
 *
 * Uses a separate KV cursor (CLAIM_CURSOR_KEY) so a failure in this processor
 * doesn't affect the Transfer event scanner and vice-versa.
 */

import { createPublicClient, getAddress, http } from "viem";
import { mainnet } from "viem/chains";
import {
  CLAIM_CURSOR_KEY,
  NORMIES_CONTRACT,
  ROUTE_CACHE_TTL_SECONDS,
  TRANSFER_CONFIRMATIONS,
  agentRouteKey,
  normiesAbi,
} from "@normieagent/shared";
import { fetchOperatorTxs, type EtherscanTx } from "./etherscan.js";
import type { Env } from "./env.js";

export interface ClaimRunResult {
  fromBlock: number;
  toBlock: number;
  txsScanned: number;
  claimsConfirmed: number;
  claimsFailed: number;
  claimsExpired: number;
  bootstrapped: boolean;
}

interface PendingClaimRow {
  id: number;
  agent_name: string;
  normie_id: number;
  from_wallet: string;
  target_url: string;
  description: string | null;
  amount_wei: string;
  expires_at: number;
}

type ViemClient = ReturnType<typeof createPublicClient>;

export async function processClaims(env: Env): Promise<ClaimRunResult> {
  const client = createPublicClient({
    chain: mainnet,
    transport: http(`https://mainnet.infura.io/v3/${env.INFURA_API_KEY}`),
  });

  const latest = Number(await client.getBlockNumber());
  const safeHead = latest - TRANSFER_CONFIRMATIONS;

  // Expire stale rows regardless of block position.
  const claimsExpired = await expireStaleClaims(env);

  const cursorRaw = await env.AGENT_ROUTES_KV.get(CLAIM_CURSOR_KEY);
  const cursor = cursorRaw ? Number.parseInt(cursorRaw, 10) : NaN;

  if (!Number.isFinite(cursor)) {
    await env.AGENT_ROUTES_KV.put(CLAIM_CURSOR_KEY, String(safeHead));
    return {
      fromBlock: safeHead,
      toBlock: safeHead,
      txsScanned: 0,
      claimsConfirmed: 0,
      claimsFailed: 0,
      claimsExpired,
      bootstrapped: true,
    };
  }

  const fromBlock = cursor + 1;
  if (fromBlock > safeHead) {
    return {
      fromBlock,
      toBlock: cursor,
      txsScanned: 0,
      claimsConfirmed: 0,
      claimsFailed: 0,
      claimsExpired,
      bootstrapped: false,
    };
  }

  const txs = await fetchOperatorTxs(
    env.ETHERSCAN_API_KEY,
    env.OPERATOR_WALLET,
    fromBlock,
    safeHead,
  );

  // Plain EOA→EOA ETH transfers to the operator wallet only; skip contract
  // calls, failed txs, and outbound transfers.
  const candidates = txs.filter(
    (tx) =>
      tx.to.toLowerCase() === env.OPERATOR_WALLET.toLowerCase() &&
      tx.isError === "0" &&
      tx.input === "0x",
  );

  let claimsConfirmed = 0;
  let claimsFailed = 0;

  for (const tx of candidates) {
    const outcome = await matchTxToClaim(env, client, tx);
    if (outcome === "confirmed") claimsConfirmed++;
    else if (outcome === "failed") claimsFailed++;
  }

  await env.AGENT_ROUTES_KV.put(CLAIM_CURSOR_KEY, String(safeHead));

  return {
    fromBlock,
    toBlock: safeHead,
    txsScanned: candidates.length,
    claimsConfirmed,
    claimsFailed,
    claimsExpired,
    bootstrapped: false,
  };
}

/**
 * Flip all non-terminal pending_claims rows whose TTL has elapsed to 'expired'.
 * Returns the number of rows updated.
 */
async function expireStaleClaims(env: Env): Promise<number> {
  const now = Math.floor(Date.now() / 1000);
  const result = await env.DB.prepare(
    `UPDATE pending_claims
        SET status = 'expired', updated_at = ?1
      WHERE status IN ('awaiting_email', 'awaiting_payment')
        AND expires_at <= ?1`,
  )
    .bind(now)
    .run();
  return result.meta?.changes ?? 0;
}

/**
 * Attempt to match a candidate Etherscan transaction to an awaiting_payment
 * pending_claims row, then re-verify ownership and either confirm or fail the
 * claim.
 *
 * Returns:
 *  - "confirmed"  — claim promoted to agent_routes
 *  - "failed"     — ownership re-check failed; row marked failed_ownership
 *  - "skipped"    — no matching claim (random deposit or already processed)
 */
async function matchTxToClaim(
  env: Env,
  client: ViemClient,
  tx: EtherscanTx,
): Promise<"confirmed" | "failed" | "skipped"> {
  // Dedup: this tx has already been matched to a claim in a previous tick.
  const already = await env.DB.prepare(
    `SELECT 1 FROM pending_claims WHERE tx_hash = ?1 LIMIT 1`,
  )
    .bind(tx.hash)
    .first();
  if (already) return "skipped";

  const now = Math.floor(Date.now() / 1000);

  // Match by sender + exact amount + awaiting_payment + not yet expired + no
  // tx_hash assigned. If the same wallet has multiple in-flight claims (rare
  // but possible if they have multiple Normies), take the oldest one.
  const claim = await env.DB.prepare(
    `SELECT id, agent_name, normie_id, from_wallet, target_url, description, amount_wei, expires_at
       FROM pending_claims
      WHERE from_wallet = ?1
        AND amount_wei  = ?2
        AND status      = 'awaiting_payment'
        AND expires_at  > ?3
        AND tx_hash     IS NULL
      ORDER BY created_at ASC
      LIMIT 1`,
  )
    .bind(tx.from.toLowerCase(), tx.value, now)
    .first<PendingClaimRow>();

  if (!claim) return "skipped";

  // Re-verify on-chain ownership. The Normie may have been sold between the
  // time the claim was submitted and now.
  const onChainOwner = await fetchOnChainOwner(client, claim.normie_id);
  const expectedOwner = claim.from_wallet.toLowerCase();

  if (!onChainOwner || onChainOwner.toLowerCase() !== expectedOwner) {
    await env.DB.prepare(
      `UPDATE pending_claims
          SET status         = 'failed_ownership',
              tx_hash        = ?1,
              paid_at        = ?2,
              failure_reason = 'Normie was transferred to a different wallet after this claim was submitted',
              updated_at     = ?2
        WHERE id = ?3`,
    )
      .bind(tx.hash, now, claim.id)
      .run();
    console.warn(
      JSON.stringify({
        event: "claim.failed_ownership",
        claimId: claim.id,
        normieId: claim.normie_id,
        agentName: claim.agent_name,
        txHash: tx.hash,
      }),
    );
    return "failed";
  }

  // Promote the claim to a live agent_routes row. Uses the same ON CONFLICT
  // pattern as the self-serve register handler: if the normie_id row already
  // exists (e.g. a soft-deactivated route), reactivate it.
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO agent_routes
           (agent_name, normie_id, owner_wallet, target_url, description, active, registered_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?6)
         ON CONFLICT(normie_id) DO UPDATE SET
           agent_name   = excluded.agent_name,
           owner_wallet = excluded.owner_wallet,
           target_url   = excluded.target_url,
           description  = excluded.description,
           active       = 1,
           updated_at   = excluded.updated_at`,
      ).bind(
        claim.agent_name,
        claim.normie_id,
        expectedOwner,
        claim.target_url,
        claim.description,
        now,
      ),
      env.DB.prepare(
        `UPDATE pending_claims
            SET status     = 'confirmed',
                tx_hash    = ?1,
                paid_at    = ?2,
                updated_at = ?2
          WHERE id = ?3`,
      ).bind(tx.hash, now, claim.id),
    ]);
  } catch (err) {
    // Most likely cause: another Normie already holds this agent_name
    // (agent_name UNIQUE constraint). Mark as failed_other so the operator
    // can investigate and refund if necessary.
    const msg = err instanceof Error ? err.message : String(err);
    await env.DB.prepare(
      `UPDATE pending_claims
          SET status         = 'failed_other',
              tx_hash        = ?1,
              paid_at        = ?2,
              failure_reason = ?3,
              updated_at     = ?2
        WHERE id = ?4`,
    )
      .bind(tx.hash, now, `Route insert failed: ${msg.slice(0, 200)}`, claim.id)
      .run();
    console.error(
      JSON.stringify({
        event: "claim.failed_other",
        claimId: claim.id,
        agentName: claim.agent_name,
        txHash: tx.hash,
        error: msg,
      }),
    );
    return "failed";
  }

  // Warm the KV cache so the dispatch worker serves the new route immediately.
  await env.AGENT_ROUTES_KV.put(agentRouteKey(claim.agent_name), claim.target_url, {
    expirationTtl: ROUTE_CACHE_TTL_SECONDS,
  });

  console.log(
    JSON.stringify({
      event: "claim.confirmed",
      claimId: claim.id,
      normieId: claim.normie_id,
      agentName: claim.agent_name,
      subdomain: `${claim.agent_name}.normieagent.com`,
      txHash: tx.hash,
    }),
  );

  return "confirmed";
}

/**
 * Trustless on-chain ownerOf check via viem. Returns checksummed address or
 * null if the token doesn't exist or the call reverts.
 */
async function fetchOnChainOwner(
  client: ViemClient,
  normieId: number,
): Promise<string | null> {
  try {
    const owner = await client.readContract({
      address: NORMIES_CONTRACT,
      abi: normiesAbi,
      functionName: "ownerOf",
      args: [BigInt(normieId)],
    });
    return getAddress(owner);
  } catch {
    return null;
  }
}
