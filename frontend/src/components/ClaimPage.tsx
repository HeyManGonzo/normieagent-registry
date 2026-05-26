import { useState } from "react";
import { useAccount } from "wagmi";
import { AgentList } from "./AgentList.js";
import { SignForm } from "./SignForm.js";

type Tab = "wallet" | "sign";

function initialTab(): Tab {
  if (typeof window !== "undefined") {
    const hash = window.location.hash;
    const params = new URLSearchParams(window.location.search);
    if (hash === "#sign" || params.get("tab") === "sign") return "sign";
  }
  return "wallet";
}

export function ClaimPage() {
  const [tab, setTab] = useState<Tab>(initialTab);

  return (
    <section className="claim-page">
      <p className="hero-eyebrow">REGISTER</p>
      <h1 className="hero-title">CLAIM YOUR<br />SUBDOMAIN</h1>
      <p className="hero-desc">
        Two ways to prove you own your Normie — same result, free either way.
        Choose whichever fits your workflow.
      </p>

      <div className="reg-tabs">
        <button
          type="button"
          className={`reg-tab ${tab === "wallet" ? "reg-tab-active" : ""}`}
          onClick={() => setTab("wallet")}
        >
          <span className="reg-tab-name">Connect Wallet</span>
          <span className="reg-tab-sub">Sign right here · Instant</span>
        </button>
        <button
          type="button"
          className={`reg-tab ${tab === "sign" ? "reg-tab-active" : ""}`}
          onClick={() => setTab("sign")}
        >
          <span className="reg-tab-name">Sign Anywhere</span>
          <span className="reg-tab-sub">Use Etherscan or any wallet tool</span>
        </button>
      </div>

      <div className="reg-tab-content">
        {tab === "wallet" ? <WalletTab /> : <SignForm inTab />}
      </div>
    </section>
  );
}

function WalletTab() {
  const { isConnected } = useAccount();

  if (!isConnected) {
    return (
      <div className="reg-wallet-prompt">
        <p>
          Use the <strong>Connect Wallet</strong> button in the top right to
          connect the wallet holding your Normie.
        </p>
        <p className="muted">
          Your awakened Normies will appear here once connected. You'll sign a
          single plaintext message — no transaction, no gas.
        </p>
      </div>
    );
  }

  return <AgentList />;
}
