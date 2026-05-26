import { useAccount, useConnect, useDisconnect } from "wagmi";
import { WALLET_FLOW_ENABLED } from "../config.js";
import { navigate } from "../lib/navigation.js";

function shorten(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();

  // Launch mode: wallet flow is wired up end-to-end but kept dark while the
  // operator handles registrations manually. Render a single disabled pill so
  // the eventual self-serve UX is visible to visitors.
  if (!WALLET_FLOW_ENABLED) {
    return (
      <div className="connect">
        <button
          className="btn"
          type="button"
          disabled
          title="Self-serve registration coming soon"
        >
          Connect Wallet · Soon
        </button>
      </div>
    );
  }

  if (isConnected && address) {
    return (
      <div className="connect">
        <a
          href="/account"
          className="addr addr-link"
          title={`${address} — manage your agents`}
          onClick={(e) => navigate("/account", e)}
        >
          {shorten(address)}
        </a>
        <button className="btn-ghost" onClick={() => disconnect()} type="button">
          Disconnect
        </button>
      </div>
    );
  }

  // wagmi's EIP-6963 auto-discovery exposes each announced wallet (MetaMask,
  // Rabby, etc.) as its own connector alongside the generic `injected()`
  // fallback we configured. Whenever any named wallet has been discovered,
  // hide the generic "Injected" entry so the UI shows one button per real
  // wallet rather than a duplicate.
  const seen = new Set<string>();
  const deduped = connectors.filter((c) => {
    if (seen.has(c.uid)) return false;
    seen.add(c.uid);
    return true;
  });
  const hasNamedInjected = deduped.some(
    (c) => c.type === "injected" && c.id !== "injected",
  );
  const available = deduped.filter(
    (c) => !(hasNamedInjected && c.id === "injected"),
  );

  return (
    <div className="connect">
      {available.map((c) => (
        <button
          key={c.uid}
          className="btn"
          type="button"
          disabled={isPending}
          onClick={() => connect({ connector: c })}
        >
          {isPending ? "Connecting…" : `Connect ${c.name}`}
        </button>
      ))}
      {error ? <span className="err">{error.message}</span> : null}
    </div>
  );
}
