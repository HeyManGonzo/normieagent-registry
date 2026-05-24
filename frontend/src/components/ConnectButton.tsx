import { useAccount, useConnect, useDisconnect } from "wagmi";

function shorten(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <div className="connect">
        <span className="addr" title={address}>
          {shorten(address)}
        </span>
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
