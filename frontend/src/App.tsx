import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "./components/ConnectButton.js";
import { AgentList } from "./components/AgentList.js";
import { Directory } from "./components/Directory.js";
import { VerifyEmail } from "./components/VerifyEmail.js";
import { OPERATOR_TWITTER_HANDLE, OPERATOR_TWITTER_URL, WALLET_FLOW_ENABLED } from "./config.js";

/**
 * Minimal pathname-based router. The SPA only has two routes (home + the
 * directory listing) and we don't want to drag in react-router for that.
 * Cloudflare Workers Static Assets rewrites unknown paths to index.html via
 * not_found_handling = "single-page-application", so client-side navigation
 * via history.pushState() resolves cleanly on reload too.
 */
function useRoute(): string {
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  return path;
}

function navigate(href: string, e?: React.MouseEvent) {
  if (e) e.preventDefault();
  if (window.location.pathname !== href) {
    window.history.pushState({}, "", href);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }
}

export function App() {
  const { isConnected } = useAccount();
  const path = useRoute();
  const isDirectory = path === "/directory" || path.startsWith("/directory/");
  const isVerifyEmail = path === "/verify-email";
  const showAgentList =
    !isDirectory && !isVerifyEmail && WALLET_FLOW_ENABLED && isConnected;

  return (
    <div className="shell">
      <header className="topbar">
        <a href="/" className="brand" onClick={(e) => navigate("/", e)}>
          <span className="brand-mark">◼</span>
          <span className="brand-name">NORMIEAGENT</span>
        </a>
        <nav className="nav">
          <a
            href="/directory"
            className={`nav-link ${isDirectory ? "nav-link-active" : ""}`}
            onClick={(e) => navigate("/directory", e)}
          >
            Directory
          </a>
        </nav>
        <ConnectButton />
      </header>

      <main className="body">
        {isVerifyEmail ? (
          <VerifyEmail />
        ) : isDirectory ? (
          <Directory />
        ) : showAgentList ? (
          <AgentList />
        ) : (
          <Hero />
        )}
      </main>

      <footer className="footer">
        <div className="footer-line">
          <span>Normieagent Subdomain Registry</span>
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
        — and point it anywhere on the internet.
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
        whatever you&apos;re running today (and easy to repoint tomorrow).
      </p>

      <HowToRegister />

      <Infrastructure />

      <p className="hero-note muted">
        Independent project. Not affiliated with or endorsed by the Normies
        team.
      </p>
    </section>
  );
}

function Infrastructure() {
  return (
    <section className="infra">
      <h2 className="section-title">Built on Cloudflare</h2>
      <p className="infra-lede">
        The whole stack runs on Cloudflare&apos;s global edge network — the
        same infrastructure trusted by a sizeable chunk of the internet.
        No single server to fall over, no hobby VPS to babysit.
      </p>
      <div className="infra-grid">
        <div className="infra-col">
          <div className="infra-tag">Edge routing</div>
          <p>
            Every request to <code>*.normieagent.com</code> hits a Cloudflare
            Worker at the location closest to the visitor — 330+ cities
            worldwide. TLS, DDoS protection and DNS are handled by Cloudflare.
          </p>
        </div>
        <div className="infra-col">
          <div className="infra-tag">D1 + KV</div>
          <p>
            The registry lives in Cloudflare D1 (SQLite at the edge) and is
            mirrored to Workers KV, so subdomain lookups resolve in
            milliseconds without round-tripping to a central server.
          </p>
        </div>
        <div className="infra-col">
          <div className="infra-tag">Open source</div>
          <p>
            Worker code, database schema and this UI are public on{" "}
            <a
              href="https://github.com/HeyManGonzo/normieagent-registry"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
            . You can audit exactly what routes your subdomain — no black box.
          </p>
        </div>
      </div>
    </section>
  );
}

function HowToRegister() {
  return (
    <section className="how">
      <h2 className="section-title">How to register</h2>
      <div className="how-grid">
        <div className="how-col how-now">
          <div className="how-tag">Today · Manual</div>
          <p>
            Hit me up on X — <a href={OPERATOR_TWITTER_URL} target="_blank" rel="noopener noreferrer">@{OPERATOR_TWITTER_HANDLE}</a> —, preferably in our Normies group chat, I will then need from you
          </p>
          <ul className="how-list">
            <li>The Normie # you hold</li>
            <li>The URL you want it pointed to (e.g. your Vercel deployment)</li>
          </ul>
          <p>
            I&apos;ll verify ownership on-chain and add{" "}
            <code>your-agent.normieagent.com</code> to the registry by hand.
            Usually within a day.
          </p>
          <p className="muted how-fineprint">
            Free for now. This may change later.
          </p>
        </div>
        <div className="how-col how-soon">
          <div className="how-tag">Soon · Self-serve</div>
          <ol className="how-list">
            <li>Connect the wallet that holds your Normie.</li>
            <li>Sign a plaintext message (no transaction, no gas).</li>
            <li>Your subdomain goes live at the edge within a minute.</li>
          </ol>
          <p className="muted how-fineprint">
            The signing flow is already built and verifiable on GitHub. It
            just isn&apos;t turned on yet.
          </p>
        </div>
      </div>
    </section>
  );
}
