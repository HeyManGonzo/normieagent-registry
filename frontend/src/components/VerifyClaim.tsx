import { useEffect, useRef, useState } from "react";
import {
  getClaim,
  verifyClaimEmail,
  type ClaimStatus,
  type ClaimStatusResponse,
} from "../lib/api.js";
import { OPERATOR_TWITTER_HANDLE, OPERATOR_TWITTER_URL } from "../config.js";

const POLL_INTERVAL_MS = 10_000;

const TERMINAL_STATUSES: ReadonlySet<ClaimStatus> = new Set([
  "confirmed",
  "expired",
  "failed_ownership",
  "failed_other",
]);

type State =
  | { kind: "idle" }
  | { kind: "verifying" }
  | { kind: "invalid"; reason: string }
  | { kind: "token_error"; status: number; message: string }
  | { kind: "polling"; claim: ClaimStatusResponse }
  | { kind: "done"; claim: ClaimStatusResponse };

/**
 * /verify-claim?token=<hex64>
 *
 * 1. Reads the token from the URL.
 * 2. POSTs to /api/claim/verify-email — unlocks the deposit address.
 * 3. Fetches the claim status and polls every 10 s until a terminal state.
 */
export function VerifyClaim() {
  const [state, setState] = useState<State>({ kind: "idle" });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopPolling() {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = (params.get("token") ?? "").trim();

    if (!token) {
      setState({ kind: "invalid", reason: "No token found in the URL." });
      return;
    }
    if (!/^[a-f0-9]{64}$/.test(token)) {
      setState({ kind: "invalid", reason: "Token format is not recognised." });
      return;
    }

    setState({ kind: "verifying" });
    let cancelled = false;

    verifyClaimEmail(token)
      .then(async (res) => {
        if (cancelled) return;
        // Fetch the full claim status (deposit address lives there).
        const claim = await getClaim(res.claimId);
        if (cancelled) return;

        if (TERMINAL_STATUSES.has(claim.status)) {
          setState({ kind: "done", claim });
          return;
        }

        setState({ kind: "polling", claim });

        // Poll until terminal.
        pollRef.current = setInterval(async () => {
          try {
            const updated = await getClaim(res.claimId);
            if (cancelled) return;
            if (TERMINAL_STATUSES.has(updated.status)) {
              stopPolling();
              setState({ kind: "done", claim: updated });
            } else {
              setState({ kind: "polling", claim: updated });
            }
          } catch {
            // Swallow transient network errors — keep polling.
          }
        }, POLL_INTERVAL_MS);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const status = (err as { status?: number }).status ?? 0;
        const message =
          (err as { error?: string }).error ??
          (err as { message?: string }).message ??
          "Could not verify email";
        setState({ kind: "token_error", status, message });
      });

    return () => {
      cancelled = true;
      stopPolling();
    };
  }, []);

  return (
    <section className="verify">
      <p className="hero-eyebrow">CLAIM REGISTRATION</p>
      <h1 className="hero-title">VERIFY&nbsp;EMAIL</h1>
      {renderBody(state)}
    </section>
  );
}

function renderBody(state: State) {
  switch (state.kind) {
    case "idle":
    case "verifying":
      return <p className="muted">Verifying…</p>;

    case "invalid":
      return (
        <div className="verify-card verify-warn">
          <p className="verify-title">Invalid link</p>
          <p>{state.reason}</p>
        </div>
      );

    case "token_error":
      return state.status === 404 ? (
        <div className="verify-card verify-warn">
          <p className="verify-title">Link already used or not found</p>
          <p>
            This verification link has already been consumed, or it doesn't
            match any pending claim. If you think that's wrong, contact{" "}
            <a href={OPERATOR_TWITTER_URL} target="_blank" rel="noopener noreferrer">
              @{OPERATOR_TWITTER_HANDLE}
            </a>
            .
          </p>
        </div>
      ) : state.status === 410 ? (
        <div className="verify-card verify-warn">
          <p className="verify-title">Claim expired</p>
          <p>
            This claim has expired (links are valid for 24 hours). Please
            submit a new claim, or contact{" "}
            <a href={OPERATOR_TWITTER_URL} target="_blank" rel="noopener noreferrer">
              @{OPERATOR_TWITTER_HANDLE}
            </a>{" "}
            if you believe this is an error.
          </p>
        </div>
      ) : (
        <div className="verify-card verify-err">
          <p className="verify-title">Something went wrong</p>
          <p className="err">{state.message}</p>
        </div>
      );

    case "polling":
      return <DepositScreen claim={state.claim} polling />;

    case "done":
      return <TerminalScreen claim={state.claim} />;
  }
}

function DepositScreen({
  claim,
  polling,
}: {
  claim: ClaimStatusResponse;
  polling: boolean;
}) {
  const subdomain = `${claim.agentName}.normieagent.com`;
  return (
    <div className="verify-card verify-ok">
      <p className="verify-title">Email verified ✓</p>
      <p>
        To complete your registration of <code>{subdomain}</code>, send
        exactly the amount below to the deposit address from the wallet you
        specified when submitting the claim.
      </p>
      <dl className="deposit-dl">
        <dt>Amount</dt>
        <dd>
          <code>{claim.amountEth} ETH</code>
          <span className="muted"> ({claim.amountWei} wei)</span>
        </dd>
        <dt>Send to</dt>
        <dd>
          <code className="deposit-addr">{claim.depositAddress}</code>
        </dd>
      </dl>
      <p className="muted how-fineprint">
        Send from the exact wallet address you entered when submitting the
        claim. The registry monitors that wallet every 5 minutes.{" "}
        {polling && "Waiting for your transaction…"}
      </p>
    </div>
  );
}

function TerminalScreen({ claim }: { claim: ClaimStatusResponse }) {
  const subdomain = `${claim.agentName}.normieagent.com`;

  if (claim.status === "confirmed") {
    return (
      <div className="verify-card verify-ok">
        <p className="verify-title">Registration confirmed ✓</p>
        <p>
          <code>{subdomain}</code> is now live and pointing to{" "}
          <a href={claim.targetUrl} target="_blank" rel="noopener noreferrer">
            {claim.targetUrl}
          </a>
          .
        </p>
        <p className="muted how-fineprint">
          DNS propagation is handled by Cloudflare — the subdomain should be
          reachable within a minute or two.
        </p>
      </div>
    );
  }

  if (claim.status === "expired") {
    return (
      <div className="verify-card verify-warn">
        <p className="verify-title">Claim expired</p>
        <p>
          This claim expired before a matching payment arrived. If you already
          sent ETH, contact{" "}
          <a href={OPERATOR_TWITTER_URL} target="_blank" rel="noopener noreferrer">
            @{OPERATOR_TWITTER_HANDLE}
          </a>{" "}
          for a refund and to start a new claim.
        </p>
      </div>
    );
  }

  if (claim.status === "failed_ownership") {
    return (
      <div className="verify-card verify-err">
        <p className="verify-title">Ownership check failed</p>
        <p>
          Your payment arrived (tx:{" "}
          <code>{claim.txHash?.slice(0, 10)}…</code>) but the on-chain owner
          of Normie #{claim.normieId} no longer matches the wallet you
          submitted the claim from. This usually means the Normie was
          transferred after the claim was started.
        </p>
        <p>
          Contact{" "}
          <a href={OPERATOR_TWITTER_URL} target="_blank" rel="noopener noreferrer">
            @{OPERATOR_TWITTER_HANDLE}
          </a>{" "}
          to arrange a refund.
        </p>
      </div>
    );
  }

  // failed_other
  return (
    <div className="verify-card verify-err">
      <p className="verify-title">Registration could not be completed</p>
      {claim.failureReason && <p className="err">{claim.failureReason}</p>}
      <p>
        Contact{" "}
        <a href={OPERATOR_TWITTER_URL} target="_blank" rel="noopener noreferrer">
          @{OPERATOR_TWITTER_HANDLE}
        </a>{" "}
        to arrange a refund and investigate.
      </p>
    </div>
  );
}
