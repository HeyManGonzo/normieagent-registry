import { useEffect, useState } from "react";
import { getDirectory, type DirectoryEntry } from "../lib/api.js";
import { OPERATOR_TWITTER_HANDLE, OPERATOR_TWITTER_URL } from "../config.js";

type State =
  | { kind: "loading" }
  | { kind: "ready"; entries: DirectoryEntry[] }
  | { kind: "error"; message: string };

export function Directory() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    getDirectory()
      .then((res) => {
        if (!cancelled) setState({ kind: "ready", entries: res.entries });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const raw =
          (err as { error?: string }).error ??
          (err as { message?: string }).message ??
          "Could not load directory";
        // Don't render a raw HTML error page — collapse it to a short message.
        const message =
          typeof raw === "string" && raw.trimStart().startsWith("<")
            ? `API error (HTTP ${(err as { status?: number }).status ?? "?"}) — check the dev:api terminal`
            : raw;
        setState({ kind: "error", message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="directory">
      <p className="hero-eyebrow">DIRECTORY</p>
      <h1 className="hero-title">REGISTERED&nbsp;AGENTS</h1>
      <p className="hero-desc">
        Every active <code>*.normieagent.com</code> subdomain is listed below.
        Click a card to visit the agent.
      </p>

      {state.kind === "loading" ? (
        <p className="muted">Loading…</p>
      ) : state.kind === "error" ? (
        <p className="err">{state.message}</p>
      ) : state.entries.length === 0 ? (
        <EmptyState />
      ) : (
        <DirectoryList entries={state.entries} />
      )}
    </section>
  );
}

function DirectoryList({ entries }: { entries: DirectoryEntry[] }) {
  return (
    <ul className="dir-grid">
      {entries.map((e) => (
        <li key={e.agentName} className="dir-card">
          <a
            className="dir-link"
            href={`https://${e.subdomain}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <img
              className="dir-image"
              src={`https://api.normies.art/normie/${e.normieId}/image.svg`}
              alt={`Normie #${e.normieId}`}
              width={56}
              height={56}
              loading="lazy"
            />
            <div className="dir-meta">
              <span className="dir-name">{e.subdomain}</span>
              <span className="dir-id">Normie #{e.normieId}</span>
              {e.description && (
                <span className="dir-desc">{e.description}</span>
              )}
            </div>
          </a>
        </li>
      ))}
    </ul>
  );
}

function EmptyState() {
  return (
    <div className="dir-empty">
      <p>No agents are registered yet.</p>
      <p className="muted">
        Want to be the first? Hit up{" "}
        <a href={OPERATOR_TWITTER_URL} target="_blank" rel="noopener noreferrer">
          @{OPERATOR_TWITTER_HANDLE}
        </a>{" "}
        on X.
      </p>
    </div>
  );
}
