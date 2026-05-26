import { useState } from "react";
import { registerSigned, type RegisterResponse } from "../lib/api.js";
import { navigate } from "../lib/navigation.js";

type Step =
  | { kind: "form" }
  | { kind: "sign"; message: string; normieId: number; targetUrl: string; description: string; email: string }
  | { kind: "submitting"; message: string; normieId: number; targetUrl: string; description: string; email: string }
  | { kind: "success"; res: RegisterResponse };

const SIGNATURE_MESSAGE_PREFIX = "NormieAgent Signature Registration";
const ETHERSCAN_SIGN_URL = "https://etherscan.io/verifiedSignatures#";
const MAX_DESC = 200;

function buildMessage(normieId: number, targetUrl: string): string {
  const issued = new Date().toISOString();
  return [
    SIGNATURE_MESSAGE_PREFIX,
    "",
    "Action: register",
    `Normie: ${normieId}`,
    `Target: ${targetUrl}`,
    `Issued: ${issued}`,
  ].join("\n");
}

function isValidHttpsUrl(s: string): boolean {
  try {
    return new URL(s).protocol === "https:";
  } catch {
    return false;
  }
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;
}

/**
 * inTab=true: skip page header/hero (used when embedded inside ClaimPage tabs).
 */
export function SignForm({ inTab = false }: { inTab?: boolean }) {
  const [normieId, setNormieId] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [signature, setSignature] = useState("");
  const [copied, setCopied] = useState(false);
  const [step, setStep] = useState<Step>({ kind: "form" });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const id = Number.parseInt(normieId.trim(), 10);
    if (!Number.isInteger(id) || id <= 0) {
      setFormError("Normie # must be a positive integer.");
      return;
    }
    if (!isValidHttpsUrl(targetUrl.trim())) {
      setFormError("Target URL must start with https://.");
      return;
    }
    if (email.trim() && !isValidEmail(email.trim())) {
      setFormError("Please enter a valid email address.");
      return;
    }
    const message = buildMessage(id, targetUrl.trim());
    setStep({ kind: "sign", message, normieId: id, targetUrl: targetUrl.trim(), description: description.trim(), email: email.trim() });
    setSignature("");
    setSubmitError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (step.kind !== "sign") return;
    setSubmitError(null);
    if (!signature.trim().startsWith("0x")) {
      setSubmitError("Signature must start with 0x.");
      return;
    }
    const data = { ...step };
    setStep({ ...data, kind: "submitting" as const });
    try {
      const res = await registerSigned({
        signature: signature.trim(),
        message: data.message,
        normieId: data.normieId,
        targetUrl: data.targetUrl,
        description: data.description || null,
        contactEmail: data.email || null,
      });
      setStep({ kind: "success", res });
    } catch (err: unknown) {
      const raw =
        (err as { error?: string }).error ??
        (err as { message?: string }).message ??
        "Something went wrong — please try again.";
      const msg =
        typeof raw === "string" && raw.trimStart().startsWith("<")
          ? "Server error — please try again shortly."
          : typeof raw === "string" ? raw : "Something went wrong.";
      setStep({ ...data, kind: "sign" as const });
      setSubmitError(msg);
    }
  }

  async function copyMessage(message: string) {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API unavailable — user can select manually
    }
  }

  const Wrap = ({ children }: { children: React.ReactNode }) =>
    inTab ? <>{children}</> : <section className="sign">{children}</section>;

  // ── Success ──────────────────────────────────────────────────────────────
  if (step.kind === "success") {
    return (
      <Wrap>
        {!inTab && <><p className="hero-eyebrow">SIGN TO REGISTER</p><h1 className="hero-title">YOU'RE LIVE</h1></>}
        <div className="verify-card verify-ok">
          <p className="verify-title">Registration confirmed ✓</p>
          <p>
            <code>{step.res.subdomain}</code> is now pointing at{" "}
            <code>{step.res.targetUrl}</code>.
          </p>
          <p>
            It may take up to a minute to fully propagate. Visit your subdomain
            in a fresh tab to confirm.
          </p>
          <p>
            <a href="/account" onClick={(e) => navigate("/account", e)}>
              Manage your agent →
            </a>
          </p>
        </div>
      </Wrap>
    );
  }

  // ── Sign step ─────────────────────────────────────────────────────────────
  if (step.kind === "sign" || step.kind === "submitting") {
    const isSubmitting = step.kind === "submitting";
    const { message } = step;
    return (
      <Wrap>
        {!inTab && (
          <>
            <p className="hero-eyebrow">SIGN TO REGISTER</p>
            <h1 className="hero-title">STEP 2: SIGN THE MESSAGE</h1>
          </>
        )}
        {inTab && <p className="sign-step-label">Step 2 — sign the message below and paste the signature</p>}
        <p className="hero-desc">
          Copy the message below, sign it with the wallet holding your Normie,
          then paste the signature here. You can sign using{" "}
          <a href={ETHERSCAN_SIGN_URL} target="_blank" rel="noopener noreferrer">
            Etherscan Verified Signatures
          </a>{" "}
          or any tool that supports EIP-191 personal signing (MetaMask, Frame,
          Rabby, etc.).
        </p>

        <div className="sign-message-block">
          <div className="sign-message-header">
            <span className="sign-message-label">Message to sign</span>
            <button type="button" className="sign-copy-btn" onClick={() => copyMessage(message)}>
              {copied ? "Copied ✓" : "Copy"}
            </button>
          </div>
          <pre className="sign-message-pre">{message}</pre>
          <p className="sign-message-note">
            Valid for <strong>30 minutes</strong>. If it expires, go back and generate a new one.
          </p>
        </div>

        <div className="sign-etherscan-cta">
          <a href={ETHERSCAN_SIGN_URL} target="_blank" rel="noopener noreferrer" className="btn sign-etherscan-btn">
            Sign on Etherscan →
          </a>
          <span className="sign-etherscan-hint">
            Connect your wallet on Etherscan, paste the message above into the
            "Message" field, and click "Sign". Copy the resulting signature.
          </span>
        </div>

        <form className="sign-form" onSubmit={handleSubmit}>
          <div className="claim-field">
            <label className="lbl" htmlFor="sf-signature">Signature</label>
            <input
              id="sf-signature"
              className="input sign-sig-input"
              type="text"
              placeholder="0x..."
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              disabled={isSubmitting}
              spellCheck={false}
              autoComplete="off"
            />
            <span className="claim-hint">The 0x-prefixed hex signature produced by your wallet.</span>
          </div>

          {submitError && <p className="err">{submitError}</p>}

          <div className="claim-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => { setStep({ kind: "form" }); setSubmitError(null); }}
              disabled={isSubmitting}
            >
              ← Back
            </button>
            <button type="submit" className="btn" disabled={isSubmitting || !signature.trim()}>
              {isSubmitting ? "Verifying…" : "Register"}
            </button>
          </div>
        </form>
      </Wrap>
    );
  }

  // ── Form step ─────────────────────────────────────────────────────────────
  return (
    <Wrap>
      {!inTab && (
        <>
          <p className="hero-eyebrow">SIGN TO REGISTER</p>
          <h1 className="hero-title">REGISTER WITHOUT<br />CONNECTING HERE</h1>
          <p className="hero-desc">
            Own your privacy. Sign a message with the wallet holding your Normie
            using any tool you trust — Etherscan, MetaMask, Rabby, Frame — without
            ever connecting to this site.
          </p>
        </>
      )}

      <form className="sign-form" onSubmit={handleGenerate}>
        <div className="claim-field">
          <label className="lbl" htmlFor="sf-normie-id">Normie #</label>
          <input
            id="sf-normie-id"
            className="input"
            type="number"
            min="1"
            placeholder="e.g. 6832"
            value={normieId}
            onChange={(e) => setNormieId(e.target.value)}
            required
          />
          <span className="claim-hint">
            The token ID of the awakened Normie you hold. Your subdomain name is
            derived from its on-chain agent name — you don't choose it.
          </span>
        </div>

        <div className="claim-field">
          <label className="lbl" htmlFor="sf-target">Target URL</label>
          <input
            id="sf-target"
            className="input"
            type="url"
            placeholder="https://your-agent.vercel.app"
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            required
          />
          <span className="claim-hint">Where your subdomain should point. Must be <code>https://</code>.</span>
        </div>

        <div className="claim-field">
          <label className="lbl" htmlFor="sf-description">
            Description <span className="claim-optional">(optional)</span>
          </label>
          <textarea
            id="sf-description"
            className="input claim-textarea"
            placeholder="What does your agent do? Who is it for?"
            value={description}
            maxLength={MAX_DESC}
            rows={3}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="claim-field-footer">
            <span className="claim-hint">Shown in the public directory.</span>
            <span className={`char-counter ${description.length >= MAX_DESC ? "char-counter-limit" : ""}`}>
              {description.length} / {MAX_DESC}
            </span>
          </div>
        </div>

        <div className="claim-field">
          <label className="lbl" htmlFor="sf-email">
            Contact email <span className="claim-optional">(optional)</span>
          </label>
          <input
            id="sf-email"
            className="input"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <span className="claim-hint">For incident notifications only. Not shared publicly.</span>
        </div>

        {formError && <p className="err">{formError}</p>}

        <div className="claim-actions">
          <button type="submit" className="btn" disabled={!normieId.trim() || !targetUrl.trim()}>
            Generate message →
          </button>
          <span className="muted how-fineprint">
            No wallet connection required. You'll sign the message in the next step.
          </span>
        </div>
      </form>
    </Wrap>
  );
}
