import { createPublicClient, http, getAddress } from "viem";
import { mainnet } from "viem/chains";
import {
  NORMIES_API_BASE,
  NORMIES_CONTRACT,
  normiesAbi,
  type NormiesBindingResponse,
  type NormiesIdentityResponse,
} from "@normieagent/shared";

/**
 * viem public client bound to the Normies contract. Uses Infura's mainnet
 * RPC endpoint with the project key supplied as a worker secret.
 */
export function createInfuraClient(infuraKey: string) {
  return createPublicClient({
    chain: mainnet,
    transport: http(`https://mainnet.infura.io/v3/${infuraKey}`),
  });
}

/**
 * Trustless on-chain ownership check.
 * Returns the checksummed owner address, or null if the call reverts
 * (e.g. token does not exist or was burned).
 */
export async function fetchOnChainOwner(
  client: ReturnType<typeof createInfuraClient>,
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

/**
 * Fetch the canonical agent identity from api.normies.art.
 * Returns null on any non-200 response.
 */
export async function fetchAgentIdentity(
  normieId: number,
): Promise<NormiesIdentityResponse | null> {
  const res = await fetch(`${NORMIES_API_BASE}/agents/identity/${normieId}`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) return null;
  return (await res.json()) as NormiesIdentityResponse;
}

/**
 * Check if a Normie has been awakened (has an ERC-8004 binding).
 * Returns the binding info or null if not awakened.
 */
export async function fetchAgentBinding(
  normieId: number,
): Promise<NormiesBindingResponse["binding"]> {
  const res = await fetch(`${NORMIES_API_BASE}/agents/binding/${normieId}`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) return null;
  const body = (await res.json()) as NormiesBindingResponse;
  return body.binding;
}

/**
 * Fetch all Normie token IDs owned by a wallet (Ponder-indexed, real-time).
 * Returns an empty array on any error.
 */
export async function fetchHolderTokens(wallet: string): Promise<number[]> {
  const res = await fetch(`${NORMIES_API_BASE}/holders/${wallet.toLowerCase()}`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) return [];
  const body = (await res.json()) as { tokenIds: string[] };
  return body.tokenIds
    .map((id) => Number.parseInt(id, 10))
    .filter((n) => Number.isInteger(n));
}

/**
 * Batch-check ERC-8004 bindings for many token IDs. Returns a Set of
 * tokenIds (as numbers) that are awakened.
 */
export async function fetchAwakenedSet(tokenIds: number[]): Promise<Set<number>> {
  if (tokenIds.length === 0) return new Set();
  const res = await fetch(`${NORMIES_API_BASE}/agents/binding/batch`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ tokenIds: tokenIds.map(String) }),
  });
  if (!res.ok) return new Set();
  const body = (await res.json()) as { bindings: Record<string, unknown> };
  const result = new Set<number>();
  for (const key of Object.keys(body.bindings ?? {})) {
    const n = Number.parseInt(key, 10);
    if (Number.isInteger(n)) result.add(n);
  }
  return result;
}
