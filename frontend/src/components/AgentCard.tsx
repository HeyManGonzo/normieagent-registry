import { useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { register, type VerifyAgent } from "../lib/api.js";
import { buildAuthMessage } from "../lib/auth-message.js";

interface Props {
  agent: VerifyAgent;
  refetch: () => void;
}

type Status =
  | { kind: "idle" }
  | { kind: "signing" }
  | { kind: "submitting" }
  | { kind: "success"; subdomain: string }
  | { kind: "error"; message: string };

const MAX_DESC = 200;

export function AgentCard({ agent, refetch }: Props) {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [target, setTarget] = useState(agent.currentTargetUrl ?? "");
  const [description, setDescription] = useState(agent.currentDescription ?? "");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const subdomain = `${agent.agentName}.normieagent.com`;
  const disabled = agent.reserved || status.kind === "signing" || status.kind === "submitting";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!address) return;
    if (!/^https:\/\//i.test(target)) {
      setStatus({ kind: "error", message: "Target URL must start with https://" });
      return;
    }
    try {
      const message = buildAuthMessage({
        wallet: address,
        normieId: agent.normieId,
        targetUrl: target,
      });
      setStatus({ kind: "signing" });
      const signature = await signMessageAsync({ message });
      setStatus({ kind: "submitting" });
      const res = await register({
        wallet: address,
        signature,
        message,
        normieId: agent.normieId,
        targetUrl: target,
        description: description.trim() || null,
      });
      setStatus({ kind: "success", subdomain: res.subdomain });
      refetch();
    } catch (err: unknown) {
      const message =
        (err as { error?: string }).error ??
        (err as { shortMessage?: string }).shortMessage ??
        (err as { message?: string }).message ??
        "Something went wrong";
      setStatus({ kind: "error", message });
    }
  }

  return (
    <article className={`card ${agent.reserved ? "card-reserved" : ""}`}>
      <div className="card-img">
        <img
          src={`https://api.normies.art/agents/image/${agent.normieId}`}
          alt={`Normie #${agent.normieId} — ${agent.agentNamePretty}`}
          width={120}
          height={120}
        />
      </div>
      <div className="card-body">
        <div className="card-head">
          <h3 className="card-name">{agent.agentNamePretty}</h3>
          <span className="card-id">#{agent.normieId}</span>
        </div>
        <p className="card-sub">
          <code>{subdomain}</code>
        </p>

        {agent.reserved ? (
          <p className="muted">
            This name is reserved and cannot be registered.
          </p>
        ) : agent.alreadyRegistered ? (
          <p className="muted">
            Currently routing to{" "}
            <a href={agent.currentTargetUrl ?? "#"} target="_blank" rel="noopener noreferrer">
              {agent.currentTargetUrl}
            </a>
          </p>
        ) : null}

        {!agent.reserved && (
          <form className="card-form" onSubmit={onSubmit}>
            <label className="lbl" htmlFor={`target-${agent.normieId}`}>
              Target URL
            </label>
            <input
              id={`target-${agent.normieId}`}
              className="input"
              type="url"
              placeholder="https://your-site.example"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              required
              disabled={disabled}
            />
            <label className="lbl" htmlFor={`desc-${agent.normieId}`}>
              Description{" "}
              <span className="card-optional">(optional)</span>
            </label>
            <textarea
              id={`desc-${agent.normieId}`}
              className="input card-textarea"
              placeholder="What does your agent do? Who is it for?"
              value={description}
              maxLength={MAX_DESC}
              rows={2}
              onChange={(e) => setDescription(e.target.value)}
              disabled={disabled}
            />
            <span className={`char-counter ${description.length >= MAX_DESC ? "char-counter-limit" : ""}`}>
              {description.length} / {MAX_DESC}
            </span>
            <button className="btn" type="submit" disabled={disabled}>
              {status.kind === "signing"
                ? "Sign in wallet…"
                : status.kind === "submitting"
                  ? "Registering…"
                  : agent.alreadyRegistered
                    ? "Update"
                    : "Register"}
            </button>
            {status.kind === "success" ? (
              <p className="ok">
                ✓ Live at{" "}
                <a
                  href={`https://${status.subdomain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {status.subdomain}
                </a>
              </p>
            ) : null}
            {status.kind === "error" ? (
              <p className="err">{status.message}</p>
            ) : null}
          </form>
        )}
      </div>
    </article>
  );
}
