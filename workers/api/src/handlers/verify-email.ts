import type { Env } from "../env.js";
import { errorResponse, json } from "../http.js";

/** Verification tokens are valid for 7 days from the moment they're sent. */
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

interface VerifyEmailBody {
  token?: unknown;
}

interface TokenRow {
  agent_name: string;
  contact_email: string | null;
  email_verified_at: number | null;
  email_verification_sent_at: number | null;
}

/**
 * Token format: 64 lowercase hex characters (32 random bytes), matching the
 * value emitted by scripts/admin.mjs (`crypto.randomBytes(32).toString("hex")`).
 */
function isValidTokenShape(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

/**
 * POST /api/verify-email
 * Body: { token: string }
 *
 * Looks up the pending row by `email_verification_token`. If it's still within
 * the TTL window, marks the row as verified and clears the token. The token is
 * single-use — once consumed it can't be replayed.
 *
 * The response intentionally returns 200 with `{ alreadyVerified: true }` when
 * the row is already verified, so the frontend can render a friendly state
 * for users who click the link twice.
 */
export async function handleVerifyEmail(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  let body: VerifyEmailBody;
  try {
    body = (await request.json()) as VerifyEmailBody;
  } catch {
    return errorResponse("Invalid JSON body", 400, origin);
  }

  if (!isValidTokenShape(body.token)) {
    return errorResponse("Invalid token", 400, origin);
  }
  const token = body.token;

  const row = await env.DB.prepare(
    `SELECT agent_name, contact_email, email_verified_at, email_verification_sent_at
       FROM agent_routes
      WHERE email_verification_token = ?1
      LIMIT 1`,
  )
    .bind(token)
    .first<TokenRow>();

  if (!row) {
    return errorResponse("Token not found or already used", 404, origin);
  }

  // Already-verified rows shouldn't reach this branch because consumption
  // nulls the token. Guard anyway in case a stale token is reused.
  if (row.email_verified_at !== null) {
    return json(
      {
        ok: true,
        alreadyVerified: true,
        agentName: row.agent_name,
        subdomain: `${row.agent_name}.normieagent.com`,
      },
      {},
      origin,
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const sentAt = row.email_verification_sent_at ?? 0;
  if (sentAt > 0 && now - sentAt > TOKEN_TTL_SECONDS) {
    return errorResponse("Token expired — ask the operator to resend", 410, origin);
  }

  await env.DB.prepare(
    `UPDATE agent_routes
        SET email_verified_at          = ?1,
            email_verification_token   = NULL,
            email_verification_sent_at = NULL,
            updated_at                 = ?1
      WHERE email_verification_token   = ?2`,
  )
    .bind(now, token)
    .run();

  return json(
    {
      ok: true,
      alreadyVerified: false,
      agentName: row.agent_name,
      subdomain: `${row.agent_name}.normieagent.com`,
      verifiedAt: now,
    },
    {},
    origin,
  );
}
