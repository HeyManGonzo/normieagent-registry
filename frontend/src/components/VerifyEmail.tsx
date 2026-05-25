import { useEffect, useState } from "react";
import { verifyEmail, type VerifyEmailResponse } from "../lib/api.js";
import { OPERATOR_TWITTER_HANDLE, OPERATOR_TWITTER_URL } from "../config.js";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; res: VerifyEmailResponse }
  | { kind: "expired" }
  | { kind: "notfound" }
  | { kind: "invalid"; reason: string }
  | { kind: "error"; message: string };

/**
 * /verify-email?token=<hex64>
 *
 * Reads the token from the URL, POSTs it to /api/verify-email exactly once,
 * and renders the result. The token is single-use; refreshes after a
 * successful verification show the "already verified" branch.
 */
export function VerifyEmail() {
  const [state, setState] = useState<State>({ kind: "idle" });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = (params.get("token") ?? "").trim();
    if (!token) {
      setState({ kind: "invalid", reason: "No token in URL." });
      return;
    }
    if (!/^[a-f0-9]{64}$/.test(token)) {
      setState({ kind: "invalid", reason: "Token format is not recognised." });
      return;
    }
    setState({ kind: "loading" });
    let cancelled = false;
    verifyEmail(token)
      .then((res) => {
        if (!cancelled) setState({ kind: "ok", res });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const status = (err as { status?: number }).status;
        const message =
          (err as { error?: string }).error ??
          (err as { message?: string }).message ??
          "Could not verify email";
        if (status === 410) setState({ kind: "expired" });
        else if (status === 404) setState({ kind: "notfound" });
        else setState({ kind: "error", message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="verify">
      <p className="hero-eyebrow">EMAIL VERIFICATION</p>
      <h1 className="hero-title">VERIFY&nbsp;EMAIL</h1>
      {renderBody(state)}
    </section>
  );
}

function renderBody(state: State) {
  switch (state.kind) {
    case "idle":
    case "loading":
      return <p className="muted">Verifying…</p>;
    case "ok":
      return state.res.alreadyVerified ? (
        <div className="verify-card verify-ok">
          <p className="verify-title">Already verified</p>
          <p>
            <code>{state.res.subdomain}</code> is set up and this email is
            already confirmed. Nothing else to do.
          </p>
        </div>
      ) : (
        <div className="verify-card verify-ok">
          <p className="verify-title">Email verified ✓</p>
          <p>
            Thanks. Your contact email for <code>{state.res.subdomain}</code>{" "}
            is now confirmed. The operator will use it only for incident
            notifications and ownership changes.
          </p>
        </div>
      );
    case "expired":
      return (
        <div className="verify-card verify-warn">
          <p className="verify-title">Link expired</p>
          <p>
            Verification links are valid for 7 days. Ask the operator (
            <a
              href={OPERATOR_TWITTER_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              @{OPERATOR_TWITTER_HANDLE}
            </a>
            ) to send a fresh link.
          </p>
        </div>
      );
    case "notfound":
      return (
        <div className="verify-card verify-warn">
          <p className="verify-title">Token already used or unknown</p>
          <p>
            This link has already been consumed or doesn't match any pending
            verification. If you think that's wrong, contact{" "}
            <a
              href={OPERATOR_TWITTER_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              @{OPERATOR_TWITTER_HANDLE}
            </a>
            .
          </p>
        </div>
      );
    case "invalid":
      return (
        <div className="verify-card verify-warn">
          <p className="verify-title">Invalid link</p>
          <p>{state.reason}</p>
        </div>
      );
    case "error":
      return (
        <div className="verify-card verify-err">
          <p className="verify-title">Something went wrong</p>
          <p className="err">{state.message}</p>
        </div>
      );
  }
}
