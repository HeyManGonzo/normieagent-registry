/**
 * Resend HTTP API client for transactional verification emails sent by the
 * Management API worker. Mirrors the structure of scripts/admin.mjs's
 * sendVerificationEmail() so the look of both flows stays in sync.
 *
 * From header uses the apex domain (DKIM is on resend._domainkey.normieagent.com,
 * envelope MAIL FROM is the `send.` subdomain — see Resend dashboard).
 */

const RESEND_FROM = "Normieagent Registry <noreply@normieagent.com>";

interface SendClaimVerificationEmailArgs {
  to: string;
  agentName: string;
  token: string;
  registryBaseUrl: string;
  resendApiKey: string;
}

/**
 * Send the claim-flow verification email. Throws on Resend non-2xx so the
 * caller can surface a 502 (and the row stays in 'awaiting_email' with the
 * token saved so a retry can succeed without operator intervention).
 */
export async function sendClaimVerificationEmail(
  args: SendClaimVerificationEmailArgs,
): Promise<string> {
  const { to, agentName, token, registryBaseUrl, resendApiKey } = args;
  const subdomain = `${agentName}.normieagent.com`;
  const verifyUrl = `${registryBaseUrl}/verify-claim?token=${encodeURIComponent(token)}`;
  const subject = `Verify your email to claim ${subdomain}`;

  const text = [
    "Hi,",
    "",
    `You just submitted a claim for ${subdomain} on the Normieagent`,
    "Subdomain Registry. Confirm this email address to unlock the payment",
    "instructions and finish your registration.",
    "",
    "Verify your email:",
    verifyUrl,
    "",
    "This link is single-use and expires in 24 hours. If you didn't expect",
    "this email, you can ignore it — no payment instructions are issued and",
    "no record will be kept.",
    "",
    "— Normieagent Registry",
    `   ${registryBaseUrl}`,
  ].join("\n");
  const html = renderClaimVerificationHtml({ subdomain, verifyUrl });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({ from: RESEND_FROM, to: [to], subject, html, text }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend send failed (HTTP ${res.status}): ${body.slice(0, 300)}`);
  }
  const parsed = (await res.json()) as { id?: string };
  return parsed.id ?? "";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#39;";
      default: return c;
    }
  });
}

function renderClaimVerificationHtml(opts: { subdomain: string; verifyUrl: string }): string {
  const safeSub = escapeHtml(opts.subdomain);
  const safeUrl = escapeHtml(opts.verifyUrl);
  return `<!doctype html><html><body style="margin:0;padding:0;background:#0e0e10;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e7e7ea;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0e0e10;padding:32px 16px;"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#16161a;border:1px solid #26262c;"><tr><td style="padding:32px 32px 16px 32px;"><div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;letter-spacing:0.18em;color:#8a8a93;">NORMIEAGENT · REGISTRY</div><h1 style="margin:8px 0 0 0;font-size:22px;line-height:1.3;color:#fafafa;">Verify your email to claim <code style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:18px;color:#fafafa;">${safeSub}</code></h1></td></tr><tr><td style="padding:0 32px 8px 32px;font-size:15px;line-height:1.6;color:#c5c5cc;"><p style="margin:0 0 16px 0;">You just submitted a claim for <strong style="color:#fafafa;">${safeSub}</strong>. Confirm this email to unlock the payment instructions and finish your registration.</p></td></tr><tr><td align="center" style="padding:16px 32px 8px 32px;"><a href="${safeUrl}" style="display:inline-block;background:#fafafa;color:#0e0e10;padding:12px 24px;font-weight:600;text-decoration:none;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:14px;letter-spacing:0.02em;">VERIFY EMAIL &rarr;</a></td></tr><tr><td style="padding:8px 32px 24px 32px;font-size:13px;line-height:1.6;color:#8a8a93;"><p style="margin:0 0 8px 0;">Or paste this URL into your browser:</p><p style="margin:0;word-break:break-all;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:#c5c5cc;">${safeUrl}</p></td></tr><tr><td style="padding:16px 32px 32px 32px;border-top:1px solid #26262c;font-size:12px;line-height:1.6;color:#6e6e76;">Single-use link, expires in 24 hours. If you didn't expect this email, you can safely ignore it — no payment instructions will be issued and no record will be kept.</td></tr></table></td></tr></table></body></html>`;
}
