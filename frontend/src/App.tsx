import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "./components/ConnectButton.js";
import { AccountPage } from "./components/AccountPage.js";
import { Directory } from "./components/Directory.js";
import { VerifyEmail } from "./components/VerifyEmail.js";
import { VerifyClaim } from "./components/VerifyClaim.js";
import { ClaimPage } from "./components/ClaimPage.js";
import { Disclaimer } from "./components/Disclaimer.js";
import { SetupGuide } from "./components/SetupGuide.js";
import { navigate } from "./lib/navigation.js";
import { OPERATOR_TWITTER_HANDLE, OPERATOR_TWITTER_URL } from "./config.js";

function useRoute(): string {
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  return path;
}

export function App() {
  const path = useRoute();
  const isDirectory = path === "/directory" || path.startsWith("/directory/");
  const isVerifyEmail = path === "/verify-email";
  const isVerifyClaim = path === "/verify-claim";
  const isClaim = path === "/claim" || path === "/sign";
  const isAccount = path === "/account";
  const isDisclaimer = path === "/disclaimer";
  const isSetup = path === "/setup";

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-left">
          <a href="/" className="brand" title="Home" onClick={(e) => navigate("/", e)}>
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
            <a
              href="/claim"
              className={`nav-link ${isClaim ? "nav-link-active" : ""}`}
              onClick={(e) => navigate("/claim", e)}
            >
              Register
            </a>
            <a
              href="/account"
              className={`nav-link ${isAccount ? "nav-link-active" : ""}`}
              onClick={(e) => navigate("/account", e)}
            >
              Account
            </a>
            <a
              href="/setup"
              className={`nav-link ${isSetup ? "nav-link-active" : ""}`}
              onClick={(e) => navigate("/setup", e)}
            >
              Setup
            </a>
          </nav>
        </div>
        <ConnectButton />
      </header>

      <div className="wip-banner">
        Work in progress — feedback welcome at{" "}
        <a href="mailto:ramona@normieagent.com">ramona@normieagent.com</a>
      </div>

      <main className="body">
        {isVerifyClaim ? (
          <VerifyClaim />
        ) : isVerifyEmail ? (
          <VerifyEmail />
        ) : isClaim ? (
          <ClaimPage />
        ) : isAccount ? (
          <AccountPage />
        ) : isDirectory ? (
          <Directory />
        ) : isDisclaimer ? (
          <Disclaimer />
        ) : isSetup ? (
          <SetupGuide />
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
          <span className="sep">·</span>
          <a href="mailto:ramona@normieagent.com">
            ramona@normieagent.com
          </a>
          <span className="sep">·</span>
          <a
            href="/disclaimer"
            onClick={(e) => navigate("/disclaimer", e)}
          >
            Disclaimer
          </a>
        </div>
      </footer>
    </div>
  );
}

function Hero() {
  const { isConnected } = useAccount();

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

      {isConnected && (
        <div className="manage-banner">
          <span>Wallet connected —</span>{" "}
          <a
            href="/account"
            className="manage-link"
            onClick={(e) => navigate("/account", e)}
          >
            view and manage your agents →
          </a>
        </div>
      )}

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

      <DirectoryPromo />

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

function DirectoryPromo() {
  return (
    <div className="dir-promo">
      <div className="dir-promo-text">
        <p className="dir-promo-title">Browse the registry</p>
        <p className="dir-promo-sub">
          Every registered Normie agent in one place — who&apos;s live, what
          they do, and where to find them.
        </p>
      </div>
      <a
        href="/directory"
        className="btn"
        onClick={(e) => navigate("/directory", e)}
      >
        View all agents →
      </a>
    </div>
  );
}

function HowToRegister() {
  return (
    <section className="how">
      <h2 className="section-title">Pick your path</h2>
      <p className="hero-desc how-intro">
        Two ways to register — same result, free either way. Choose whichever
        fits your workflow.
      </p>
      <div className="how-grid">
        <div className="how-col how-now">
          <div className="how-tag">Connect Wallet · Free · Instant</div>
          <p className="how-pitch">
            Connect the wallet holding your Normie and sign a single plaintext
            message right here — no transaction, no gas, no fee. Your subdomain
            goes live the moment you sign.
          </p>
          <ol className="how-list">
            <li>Click <strong>Register</strong> in the nav above.</li>
            <li>Connect your wallet and sign a plaintext message.</li>
            <li>Your subdomain goes live within a minute.</li>
          </ol>
          <div className="how-cta">
            <a href="/claim" className="btn" onClick={(e) => navigate("/claim", e)}>
              Register now →
            </a>
          </div>
          <p className="muted how-fineprint">
            Ownership verified on-chain by your signature — no ETH required,
            no transaction sent. Code is open on{" "}
            <a href="https://github.com/HeyManGonzo/normieagent-registry" target="_blank" rel="noopener noreferrer">
              GitHub
            </a>.
          </p>
        </div>

        <div className="how-col how-sign">
          <div className="how-tag">Sign Anywhere · Free · No connection needed</div>
          <p className="how-pitch">
            Privacy-first option. Sign a message using Etherscan, MetaMask, Rabby,
            or Frame — without ever connecting your wallet to this site. Only the
            signature crosses the wire.
          </p>
          <ol className="how-list">
            <li>Click <strong>Register</strong> and choose "Sign Anywhere".</li>
            <li>Copy the generated message and sign it using any EIP-191 tool.</li>
            <li>Paste the signature back — subdomain goes live immediately.</li>
          </ol>
          <div className="how-cta">
            <a href="/claim?tab=sign" className="btn" onClick={(e) => navigate("/claim?tab=sign", e)}>
              Sign to register →
            </a>
          </div>
          <p className="muted how-fineprint">
            Your wallet never touches this site. Etherscan is the most
            trusted signing tool in the ecosystem — use it with confidence.
          </p>
        </div>
      </div>
    </section>
  );
}
