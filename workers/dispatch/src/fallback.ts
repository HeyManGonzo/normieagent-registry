/**
 * Branded 404 page returned when a request arrives at an unregistered
 * subdomain. Kept inline so the worker has zero external dependencies
 * on the hot path.
 */
export function renderFallbackPage(agentName: string): string {
  const safeName = agentName.replace(/[^a-z0-9-]/g, "");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${safeName}.normieagent.com — not yet awakened</title>
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0;
    min-height: 100vh;
    display: grid;
    place-items: center;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #e3e5e4;
    color: #48494b;
    padding: 2rem;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #1a1b1c; color: #d4d5d6; }
    .card { background: #2a2b2c; }
  }
  .card {
    max-width: 32rem;
    background: #ffffff;
    border-radius: 12px;
    padding: 2.5rem 2rem;
    box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    text-align: center;
  }
  h1 { margin: 0 0 0.5rem; font-size: 1.5rem; letter-spacing: -0.01em; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.95rem; }
  p { margin: 1rem 0; line-height: 1.55; }
  a {
    display: inline-block;
    margin-top: 1rem;
    padding: 0.6rem 1.1rem;
    background: #48494b;
    color: #e3e5e4;
    text-decoration: none;
    border-radius: 6px;
    font-weight: 600;
  }
</style>
</head>
<body>
  <main class="card">
    <h1>No agent registered here yet</h1>
    <p><code>${safeName}.normieagent.com</code> has not been claimed.</p>
    <p>If you hold the awakened Normie for this agent, you can register it now.</p>
    <a href="https://registry.normieagent.com">Register at registry.normieagent.com</a>
  </main>
</body>
</html>`;
}
