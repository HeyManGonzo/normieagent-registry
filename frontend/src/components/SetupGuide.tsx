import { navigate } from "../lib/navigation.js";

export function SetupGuide() {
  return (
    <section className="guide">
      <p className="hero-eyebrow">DOCUMENTATION</p>
      <h1 className="hero-title">GETTING YOUR<br />AGENT ONLINE</h1>
      <p className="hero-desc">
        Everything you need to know to get{" "}
        <code>[agent-name].normieagent.com</code> pointing at your agent —
        and what to do if something looks off.
      </p>
      <p className="guide-name-note">
        Your subdomain is derived automatically from the on-chain name of
        your awakened Normie — it is not something you choose or change.
        For example, if your Normie&apos;s agent is called Gemel, your
        subdomain is <code>gemel.normieagent.com</code>.
      </p>

      <div className="guide-body">

        {/* ── How it works ── */}
        <div className="guide-section">
          <h2 className="guide-heading">How it works</h2>
          <p>
            When someone visits <code>gemel.normieagent.com</code>, a
            Cloudflare Worker intercepts the request and fetches the
            content from whatever URL you registered — say,{" "}
            <code>gemel.vercel.app</code> — then serves it back under
            your normieagent.com subdomain. The visitor&apos;s browser
            stays at <code>gemel.normieagent.com</code> the entire time.
          </p>
          <p>
            Think of it as a clean front door. Your agent can live
            anywhere — Vercel, Netlify, Framer, a VPS, Cloudflare Pages
            — and this registry is just the sign on the door.
          </p>
        </div>

        {/* ── Good news ── */}
        <div className="guide-section">
          <h2 className="guide-heading">Most apps just work</h2>
          <p>
            If your agent is a simple landing page, a chatbot UI, or
            anything built on a standard hosting platform, there is
            nothing you need to do. Register your subdomain, visit it,
            and it should load your app straight away.
          </p>
          <div className="guide-platform-grid">
            <div className="guide-platform">
              <span className="guide-platform-name">Vercel</span>
              <span className="guide-ok-badge">✓ works out of the box</span>
            </div>
            <div className="guide-platform">
              <span className="guide-platform-name">Netlify</span>
              <span className="guide-ok-badge">✓ works out of the box</span>
            </div>
            <div className="guide-platform">
              <span className="guide-platform-name">Framer</span>
              <span className="guide-ok-badge">✓ works out of the box</span>
            </div>
            <div className="guide-platform">
              <span className="guide-platform-name">Cloudflare Pages</span>
              <span className="guide-ok-badge">✓ works out of the box</span>
            </div>
            <div className="guide-platform">
              <span className="guide-platform-name">Replit</span>
              <span className="guide-ok-badge">✓ works out of the box</span>
            </div>
            <div className="guide-platform">
              <span className="guide-platform-name">Railway / Render</span>
              <span className="guide-ok-badge">✓ works out of the box</span>
            </div>
          </div>
        </div>

        {/* ── How to test ── */}
        <div className="guide-section">
          <h2 className="guide-heading">How to test</h2>
          <ol className="guide-list">
            <li>
              Register your subdomain via{" "}
              <a href="/claim" onClick={(e) => navigate("/claim", e)}>Claim</a>{" "}
              or{" "}
              <a href="/account" onClick={(e) => navigate("/account", e)}>Account</a>
              .
            </li>
            <li>
              Wait about one minute for the DNS and cache to propagate.
            </li>
            <li>
              Visit <code>[agent-name].normieagent.com</code> in a fresh
              browser tab (or incognito to avoid cache).
            </li>
            <li>
              Your app should load exactly as it does on the original URL.
            </li>
          </ol>
        </div>

        {/* ── Common issues ── */}
        <div className="guide-section">
          <h2 className="guide-heading">Common issues and fixes</h2>

          <div className="guide-issue">
            <p className="guide-issue-title">
              Clicking a link jumps me to the original domain
            </p>
            <p>
              Your app has a hardcoded absolute link somewhere — for
              example <code>href="https://my-app.vercel.app/about"</code>.
              The fix is to use relative links (<code>href="/about"</code>)
              so they stay within your subdomain.
            </p>
            <p className="guide-ai-tip">
              <strong>If your app was AI-built:</strong> ask your AI
              assistant to &ldquo;replace all absolute internal links with
              relative paths&rdquo; and redeploy.
            </p>
          </div>

          <div className="guide-issue">
            <p className="guide-issue-title">
              The page loads but then redirects me away
            </p>
            <p>
              Some hosting platforms redirect HTTP → HTTPS, or add / remove
              trailing slashes. These redirects send the browser directly
              to the original domain. The easiest fix: make sure the target
              URL you registered is the final, canonical URL of your app
              (with https, with or without trailing slash — however it
              actually loads). If it still redirects, see the &ldquo;proper
              custom domain&rdquo; section below.
            </p>
          </div>

          <div className="guide-issue">
            <p className="guide-issue-title">
              My app loads but images or styles are missing
            </p>
            <p>
              Your app is probably referencing assets with absolute URLs
              pointing to the original domain. Same fix as above — switch
              to relative paths for assets and redeploy.
            </p>
            <p className="guide-ai-tip">
              <strong>If your app was AI-built:</strong> ask your AI
              assistant to &ldquo;ensure all asset paths (images, fonts,
              CSS) use relative URLs so the app works under any domain&rdquo;.
            </p>
          </div>

          <div className="guide-issue">
            <p className="guide-issue-title">
              My chatbot or API calls stop working
            </p>
            <p>
              If your app makes API requests to a backend and that backend
              checks the <code>Origin</code> header for security, it may
              reject requests coming from <code>normieagent.com</code>
              because it doesn&apos;t recognise the domain. Add{" "}
              <code>https://[agent-name].normieagent.com</code> to your
              backend&apos;s allowed origins (CORS whitelist) and redeploy.
            </p>
            <p className="guide-ai-tip">
              <strong>If your app was AI-built:</strong> ask your AI
              assistant to &ldquo;add{" "}
              <code>https://[agent-name].normieagent.com</code> to the CORS
              allowed origins in the backend&rdquo;.
            </p>
          </div>
        </div>

        {/* ── Proper custom domain ── */}
        <div className="guide-section">
          <h2 className="guide-heading">The cleanest setup (optional)</h2>
          <p>
            If you want zero routing quirks — canonical URLs, auth cookies,
            and SEO all pointing to your normieagent.com address — the best
            approach is to add your subdomain as a <strong>proper custom
            domain</strong> on your hosting platform, and then register the
            subdomain itself as your target URL.
          </p>
          <p>
            Here&apos;s how that works in practice:
          </p>
          <ol className="guide-list">
            <li>
              Go to your hosting platform (Vercel, Netlify, etc.) and add{" "}
              <code>[agent-name].normieagent.com</code> as a custom domain for
              your project.
            </li>
            <li>
              The platform will ask you to add a DNS record. Contact{" "}
              <a href="mailto:ramona@normieagent.com">ramona@normieagent.com</a>{" "}
              and we will add the required CNAME or A record for you.
            </li>
            <li>
              Once verified, update your registered target URL (via the{" "}
              <a href="/account" onClick={(e) => navigate("/account", e)}>Account</a>{" "}
              page) to{" "}
              <code>https://[agent-name].normieagent.com</code>.
            </li>
          </ol>
          <p>
            At that point, your hosting platform serves the content directly
            — no proxy involved. Everything just works, including auth,
            cookies, APIs, and SEO.
          </p>
        </div>

        {/* ── Still stuck ── */}
        <div className="guide-section guide-section-last">
          <h2 className="guide-heading">Still stuck?</h2>
          <p>
            Email{" "}
            <a href="mailto:ramona@normieagent.com">ramona@normieagent.com</a>{" "}
            or find us on X at{" "}
            <a
              href="https://x.com/heymangonzo"
              target="_blank"
              rel="noopener noreferrer"
            >
              @heymangonzo
            </a>
            . Include your subdomain name and a description of what you
            see — we&apos;ll help you get it sorted.
          </p>
        </div>

      </div>
    </section>
  );
}
