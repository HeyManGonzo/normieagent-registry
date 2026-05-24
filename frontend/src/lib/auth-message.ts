import { getAddress } from "viem";

/**
 * Authentication message format. MUST match the parser in
 * workers/api/src/auth.ts exactly:
 *
 *   NormieAgent Registry Authentication
 *
 *   Wallet: 0x...
 *   Action: register
 *   Normie: 1234
 *   Target: https://...
 *   Issued: 2026-05-24T19:00:00.000Z
 *
 * The blank line after the prefix is preserved by the parser via trim().
 */

const PREFIX = "NormieAgent Registry Authentication";

export interface BuildAuthMessageInput {
  wallet: string;
  normieId: number;
  targetUrl: string;
  action?: "register" | "update" | "deactivate";
  issuedAt?: Date;
}

export function buildAuthMessage(input: BuildAuthMessageInput): string {
  const wallet = getAddress(input.wallet);
  const action = input.action ?? "register";
  const issued = (input.issuedAt ?? new Date()).toISOString();
  return [
    PREFIX,
    "",
    `Wallet: ${wallet}`,
    `Action: ${action}`,
    `Normie: ${input.normieId}`,
    `Target: ${input.targetUrl}`,
    `Issued: ${issued}`,
  ].join("\n");
}
