import { useAccount, useDisconnect } from "wagmi";
import { AgentList } from "./AgentList.js";

export function AccountPage() {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();

  if (!isConnected || !address) {
    return (
      <section className="account">
        <p className="hero-eyebrow">ACCOUNT</p>
        <h1 className="hero-title">MY AGENTS</h1>
        <p className="hero-desc">
          Connect the wallet holding your Normie to view and manage your
          registered subdomains.
        </p>
        <p className="muted">
          Use the <strong>Connect Wallet</strong> button in the top right.
        </p>
      </section>
    );
  }

  return (
    <section className="account">
      <p className="hero-eyebrow">ACCOUNT</p>
      <div className="account-header">
        <div className="account-wallet">
          <span className="account-wallet-label">Connected wallet</span>
          <code className="account-addr">{address}</code>
        </div>
        <button
          className="btn-ghost"
          type="button"
          onClick={() => disconnect()}
        >
          Disconnect
        </button>
      </div>
      <AgentList />
    </section>
  );
}
