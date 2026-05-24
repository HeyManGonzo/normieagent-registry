import { useAccount } from "wagmi";
import { ConnectButton } from "./components/ConnectButton.js";
import { AgentList } from "./components/AgentList.js";

export function App() {
  const { isConnected } = useAccount();

  return (
    <div className="shell">
      <header className="topbar">
        <a href="/" className="brand">
          <span className="brand-mark">◼</span>
          <span className="brand-name">NORMIEAGENT</span>
        </a>
        <ConnectButton />
      </header>

      <main className="body">
        {!isConnected ? <Hero /> : <AgentList />}
      </main>

      <footer className="footer">
        <div className="footer-line">
          <span>Normieagent Registry</span>
          <span className="sep">·</span>
          <span className="muted">
            A community service for Normies holders. Not affiliated with Normies.
          </span>
        </div>
        <div className="footer-line muted">
          <a
            href="https://normies.art"
            target="_blank"
            rel="noopener noreferrer"
          >
            normies.art
          </a>
          <span className="sep">·</span>
          <a
            href="https://opensea.io/collection/normies"
            target="_blank"
            rel="noopener noreferrer"
          >
            OpenSea
          </a>
          <span className="sep">·</span>
          Built by{" "}
          <a
            href="https://x.com/heymangonzo"
            target="_blank"
            rel="noopener noreferrer"
          >
            @heymangonzo
          </a>
        </div>
      </footer>
    </div>
  );
}

function Hero() {
  return (
    <section className="hero">
      <p className="hero-eyebrow">NORMIEAGENT.COM</p>
      <h1 className="hero-title">
        SUBDOMAIN
        <br />
        REGISTRY
      </h1>
      <p className="hero-sub">A community service for awakened Normies</p>
      <p className="hero-desc">
        Every Normies holder can claim the name of their awakened agent as
        a subdomain of <code>normieagent.com</code> — like{" "}
        <code>uxje.normieagent.com</code> or <code>gemel.normieagent.com</code>{" "}
        — and point it anywhere on the internet. Ownership is verified
        on-chain via wallet signature. No email, no password, no middleman.
      </p>

      <div className="compare">
        <div className="compare-col compare-bad">
          <div className="compare-label">Before</div>
          <ul>
            <li><code>my-agent-7x9k2-final.vercel.app</code></li>
            <li><code>wonderful-otter-3f8a1c.netlify.app</code></li>
            <li><code>agent.framer.website</code></li>
          </ul>
        </div>
        <div className="compare-col compare-good">
          <div className="compare-label">After</div>
          <ul>
            <li><code>uxje.normieagent.com</code></li>
            <li><code>gemel.normieagent.com</code></li>
            <li><code>seil.normieagent.com</code></li>
          </ul>
        </div>
      </div>

      <p className="hero-desc">
        Host your agent on Vercel, Netlify, Framer, Cloudflare Pages,
        a VPS — anywhere. This registry is just the front door: a clean,
        memorable name your community already knows, routed at the edge to
        whatever you're running today (and easy to repoint tomorrow).
      </p>

      <p className="hero-note muted">
        Independent project. Not affiliated with or endorsed by the Normies
        team.
      </p>
    </section>
  );
}
