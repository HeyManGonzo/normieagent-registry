import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { verify, type VerifyAgent } from "../lib/api.js";
import { AgentCard } from "./AgentCard.js";

export function AgentList() {
  const { address } = useAccount();
  const query = useQuery({
    queryKey: ["verify", address],
    queryFn: () => verify(address!),
    enabled: !!address,
  });

  if (!address) return null;

  if (query.isLoading) {
    return (
      <section className="status">
        <p className="muted">Scanning your wallet for awakened Normies…</p>
      </section>
    );
  }

  if (query.isError) {
    return (
      <section className="status">
        <p className="err">
          Could not load your Normies:{" "}
          {(query.error as { error?: string }).error ?? "unknown error"}
        </p>
      </section>
    );
  }

  const agents: VerifyAgent[] = query.data?.agents ?? [];

  if (agents.length === 0) {
    return (
      <section className="status">
        <h2 className="section-title">NO AWAKENED NORMIES FOUND</h2>
        <p className="muted">
          Subdomains are reserved for Normies that have been awakened (an
          ERC-8004 agent binding on the Normies contract).
        </p>
        <p className="muted">
          Don't own one yet?{" "}
          <a
            href="https://opensea.io/collection/normies"
            target="_blank"
            rel="noopener noreferrer"
          >
            View on OpenSea →
          </a>
        </p>
      </section>
    );
  }

  return (
    <section>
      <h2 className="section-title">
        YOUR AGENTS · {agents.length}
      </h2>
      <div className="grid">
        {agents.map((a) => (
          <AgentCard key={a.normieId} agent={a} refetch={() => query.refetch()} />
        ))}
      </div>
    </section>
  );
}
