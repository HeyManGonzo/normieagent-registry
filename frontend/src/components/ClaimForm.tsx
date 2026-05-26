import { useState } from "react";
import { createClaim, type CreateClaimResponse } from "../lib/api.js";
import { OPERATOR_TWITTER_HANDLE, OPERATOR_TWITTER_URL } from "../config.js";

type State =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; res: CreateClaimResponse }
  | { kind: "error"; message: string };

function isValidHttpsUrl(s: string): boolean {
  try {
    return new URL(s).protocol === "https:";
  } catch {
    return false;
  }
}

function isValidWallet(s: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(s.trim());
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;
}

/**
 * /claim
 *
 * Self-serve pay-to-claim form. The user provides their Normie's token ID,
 * the URL they want to point the subdomain at, a contact email, and the
 * wallet that holds the Normie (and that they'll send ETH from). On submit
 * the API verifies ownership, creates a pending_claims row, and emails a
 * verification link. After clicking the link the user is shown the deposit
 * address and amount on /verify-claim.
 */
export function ClaimForm() {
  const [normieId, setNormieId] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [email, setEmail] = useState("");
  const [wallet, setWallet] = useState("");
  const [description, setDescription] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const MAX_DESC = 200;

  const canSubmit =
    state.kind !== "submitting" &&
    normieId.trim() !== "" &&
    targetUrl.trim() !== "" &&
    email.trim() !== "" &&
    wallet.trim() !== "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const id = Number.parseInt(normieId.trim(), 10);
    if (!Number.isInteger(id) || id <= 0) {
      setState({ kind: "error", message: "Normie # must be a positive integer." });
      return;
    }
    if (!isValidHttpsUrl(targetUrl.trim())) {
      setState({ kind: "error", message: "Target URL must start with https://." });
      return;
    }
    if (!isValidEmail(email.trim())) {
      setState({ kind: "error", message: "Please enter a valid email address." });
      return;
    }
    if (!isValidWallet(wallet)) {
      setState({
        kind: "error",
        message: "Wallet must be a 0x-prefixed Ethereum address (42 characters).",
      });
      return;
    }

    setState({ kind: "submitting" });
    try {
      const res = await createClaim({
        normieId: id,
        targetUrl: targetUrl.trim(),
        contactEmail: email.trim(),
        fromWallet: wallet.trim(),
        description: description.trim() || null,
      });
      setState({ kind: "success", res });
    } catch (err: unknown) {
      const raw =
        (err as { error?: string }).error ??
        (err as { message?: string }).message ??
        "Something went wrong — please try again.";
      const message =
        typeof raw === "string" && raw.trimStart().startsWith("<")
          ? "Server error — please try again shortly."
          : raw;
      setState({ kind: "error", message });
    }
  }

  if (state.kind === "success") {
    const subdomain = `${state.res.agentName}.normieagent.com`;
    return (
      <section className="claim">
        <p className="hero-eyebrow">CLAIM REGISTRATION</p>
        <h1 className="hero-title">CHECK YOUR INBOX</h1>
        <div className="verify-card verify-ok">
          <p className="verify-title">Claim received ✓</p>
          <p>
            We've sent a verification email to{" "}
            <strong>{state.res.contactEmail}</strong>. Click the link inside
            to unlock the deposit address for{" "}
            <code>{subdomain}</code>.
          </p>
          <p>
            Once you verify and send <strong>0.002 ETH</strong> from your
            registered wallet, the subdomain goes live automatically — usually
            within 5 minutes of the transaction confirming.
          </p>
          <p className="muted how-fineprint">
            Claim #{state.res.claimId} · expires in 24 hours. Can't find the
            email? Check spam, or contact{" "}
            <a
              href={OPERATOR_TWITTER_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              @{OPERATOR_TWITTER_HANDLE}
            </a>{" "}
            to get a fresh link sent.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="claim">
      <p className="hero-eyebrow">CLAIM REGISTRATION</p>
      <h1 className="hero-title">CLAIM YOUR SUBDOMAIN</h1>
      <p className="hero-desc">
        No wallet connection needed. Fill out the form, verify your email,
        send <strong>0.002 ETH</strong> from your Normie's wallet, and your
        subdomain goes live within minutes.
      </p>

      <form className="claim-form" onSubmit={handleSubmit}>
        <div className="claim-field">
          <label className="lbl" htmlFor="cf-normie-id">
            Normie #
          </label>
          <input
            id="cf-normie-id"
            className="input"
            type="number"
            min="1"
            placeholder="e.g. 6832"
            value={normieId}
            onChange={(e) => setNormieId(e.target.value)}
            disabled={state.kind === "submitting"}
            required
          />
          <span className="claim-hint">
            The token ID of the Normie you hold. Must be awakened (ERC-8004
            binding). Your subdomain name is derived automatically from its
            on-chain name — you don't choose it.
          </span>
        </div>

        <div className="claim-field">
          <label className="lbl" htmlFor="cf-target">
            Target URL
          </label>
          <input
            id="cf-target"
            className="input"
            type="url"
            placeholder="https://your-agent.vercel.app"
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            disabled={state.kind === "submitting"}
            required
          />
          <span className="claim-hint">
            Where your subdomain should point. Must be <code>https://</code>.
            You can update this later by contacting{" "}
            <a
              href={OPERATOR_TWITTER_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              @{OPERATOR_TWITTER_HANDLE}
            </a>
            .
          </span>
        </div>

        <div className="claim-field">
          <label className="lbl" htmlFor="cf-email">
            Contact email
          </label>
          <input
            id="cf-email"
            className="input"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={state.kind === "submitting"}
            required
          />
          <span className="claim-hint">
            Used to send your verification link and for incident notifications.
            Not shared publicly.
          </span>
        </div>

        <div className="claim-field">
          <label className="lbl" htmlFor="cf-wallet">
            Payment wallet
          </label>
          <input
            id="cf-wallet"
            className="input"
            type="text"
            placeholder="0x…"
            value={wallet}
            onChange={(e) => setWallet(e.target.value)}
            disabled={state.kind === "submitting"}
            required
          />
          <span className="claim-hint">
            The Ethereum address that currently holds your Normie.{" "}
            <strong>You must send the 0.002 ETH from this exact address</strong>{" "}
            — the registry verifies it matches the on-chain owner.
          </span>
        </div>

        <div className="claim-field">
          <label className="lbl" htmlFor="cf-description">
            Description{" "}
            <span className="claim-optional">(optional)</span>
          </label>
          <textarea
            id="cf-description"
            className="input claim-textarea"
            placeholder="What does your agent do? Who is it for?"
            value={description}
            maxLength={MAX_DESC}
            rows={3}
            onChange={(e) => setDescription(e.target.value)}
            disabled={state.kind === "submitting"}
          />
          <div className="claim-field-footer">
            <span className="claim-hint">
              Shown in the public directory so visitors know what to expect.
            </span>
            <span className={`char-counter ${description.length >= MAX_DESC ? "char-counter-limit" : ""}`}>
              {description.length} / {MAX_DESC}
            </span>
          </div>
        </div>

        {state.kind === "error" && (
          <p className="err">{state.message}</p>
        )}

        <div className="claim-actions">
          <button
            type="submit"
            className="btn"
            disabled={!canSubmit}
          >
            {state.kind === "submitting" ? "Submitting…" : "Submit claim"}
          </button>
          <span className="muted how-fineprint">
            On-chain ownership is verified immediately. No ETH changes hands
            until after email verification.
          </span>
        </div>
      </form>
    </section>
  );
}
