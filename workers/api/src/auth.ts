import { verifyMessage, getAddress } from "viem";

/**
 * Authentication message format. The frontend assembles a message of this
 * exact shape, the user signs it via personal_sign, and the worker validates:
 *   1. the signature recovers to `wallet`
 *   2. the parsed message fields match the request body
 *   3. the `Issued` timestamp is within MAX_MESSAGE_AGE_MS
 *
 * Example message text:
 *
 *   NormieAgent Registry Authentication
 *
 *   Wallet: 0x1234...
 *   Action: register
 *   Normie: 6832
 *   Target: https://myapp.vercel.app
 *   Issued: 2026-05-24T19:00:00.000Z
 */

export const MESSAGE_PREFIX = "NormieAgent Registry Authentication" as const;
export const MAX_MESSAGE_AGE_MS = 5 * 60 * 1000;

export type AuthAction = "register" | "update" | "deactivate";

export interface ParsedAuthMessage {
  wallet: string;
  action: AuthAction;
  normieId: number | null;
  agentName: string | null;
  target: string | null;
  issuedAtMs: number;
}

/**
 * Parse the structured authentication message. Returns null if the message
 * does not begin with the expected prefix or any required field is missing.
 */
export function parseAuthMessage(message: string): ParsedAuthMessage | null {
  const lines = message.split("\n").map((l) => l.trim());
  if (lines[0] !== MESSAGE_PREFIX) return null;

  const fields = new Map<string, string>();
  for (const line of lines.slice(1)) {
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (key && value) fields.set(key, value);
  }

  const wallet = fields.get("Wallet");
  const action = fields.get("Action");
  const issued = fields.get("Issued");
  if (!wallet || !action || !issued) return null;
  if (action !== "register" && action !== "update" && action !== "deactivate") {
    return null;
  }

  const issuedAtMs = Date.parse(issued);
  if (!Number.isFinite(issuedAtMs)) return null;

  let walletChecksummed: string;
  try {
    walletChecksummed = getAddress(wallet);
  } catch {
    return null;
  }

  const normieRaw = fields.get("Normie");
  const normieId = normieRaw !== undefined ? Number.parseInt(normieRaw, 10) : null;
  if (normieRaw !== undefined && !Number.isInteger(normieId)) return null;

  return {
    wallet: walletChecksummed,
    action,
    normieId: Number.isInteger(normieId) ? normieId : null,
    agentName: fields.get("Agent") ?? null,
    target: fields.get("Target") ?? null,
    issuedAtMs,
  };
}

/**
 * Verify a personal_sign signature against the supplied wallet address.
 * Returns the checksummed wallet on success, or null on any failure.
 */
export async function verifyAuthSignature(
  wallet: string,
  message: string,
  signature: string,
): Promise<string | null> {
  let checksummed: string;
  try {
    checksummed = getAddress(wallet);
  } catch {
    return null;
  }

  if (!signature.startsWith("0x")) return null;

  try {
    const valid = await verifyMessage({
      address: checksummed as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });
    return valid ? checksummed : null;
  } catch {
    return null;
  }
}

/**
 * Returns true if the parsed message was issued within MAX_MESSAGE_AGE_MS
 * of the current time (and not in the future by more than a small skew).
 */
export function isMessageFresh(parsed: ParsedAuthMessage, nowMs = Date.now()): boolean {
  const age = nowMs - parsed.issuedAtMs;
  return age >= -30_000 && age <= MAX_MESSAGE_AGE_MS;
}
