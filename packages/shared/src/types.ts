/**
 * A row in the `agent_routes` D1 table.
 * `agent_name` is always lowercase; `owner_wallet` is checksummed lowercase.
 */
export interface AgentRoute {
  id: number;
  agent_name: string;
  normie_id: number;
  owner_wallet: string;
  target_url: string;
  active: 0 | 1;
  registered_at: number;
  updated_at: number;
}

/**
 * Insert/update payload used by the management API.
 */
export interface AgentRouteWrite {
  agent_name: string;
  normie_id: number;
  owner_wallet: string;
  target_url: string;
}

/**
 * A row in the `transfer_log` D1 table.
 * Written by the cron worker on every detected Transfer event for a
 * registered Normie.
 */
export interface TransferLogEntry {
  id: number;
  normie_id: number;
  agent_name: string;
  from_wallet: string;
  to_wallet: string;
  tx_hash: string;
  transferred_at: number;
}

/**
 * Shape returned by `GET https://api.normies.art/agents/identity/:tokenId`.
 * The `name` field is the canonical agent name we use as the subdomain.
 */
export interface NormiesIdentityResponse {
  tokenId: number;
  name: string;
  type: string;
  traits: Record<string, string>;
}

/**
 * Shape returned by `GET https://api.normies.art/agents/binding/:tokenId`.
 * `binding` is null when the Normie has not been awakened.
 */
export interface NormiesBindingResponse {
  binding: {
    id: string;
    agentId: string;
    standard: number;
    tokenContract: string;
    tokenId: string;
    registeredBy: string;
    blockNumber: string;
    timestamp: string;
    txHash: string;
  } | null;
}

/**
 * Authenticated registration request payload from the frontend.
 * The signature is over `message`; the recovered address must equal `wallet`.
 */
export interface RegisterRequestBody {
  wallet: string;
  signature: string;
  message: string;
  normieId: number;
  targetUrl: string;
}
