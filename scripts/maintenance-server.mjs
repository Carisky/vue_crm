import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

export function renderMaintenancePage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <meta http-equiv="refresh" content="30">
  <title>Scheduled maintenance · TSL Silesia Collab</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; color: #172033; background: #f4f7fb; }
    .shell { position: relative; isolation: isolate; display: grid; min-height: 100vh; place-items: center; overflow: hidden; padding: 24px; }
    .glow { position: fixed; z-index: -1; width: 440px; height: 440px; border-radius: 999px; filter: blur(8px); opacity: .45; }
    .glow.one { top: -220px; right: -120px; background: radial-gradient(circle, #93c5fd, transparent 68%); }
    .glow.two { bottom: -260px; left: -130px; background: radial-gradient(circle, #bfdbfe, transparent 68%); }
    .card { width: min(100%, 640px); border: 1px solid rgba(148, 163, 184, .25); border-radius: 28px; background: rgba(255,255,255,.92); box-shadow: 0 28px 80px rgba(30, 64, 175, .12); padding: clamp(28px, 6vw, 52px); text-align: center; backdrop-filter: blur(16px); }
    .brand { display: inline-flex; align-items: center; gap: 11px; margin-bottom: 34px; color: #172033; font-size: 15px; font-weight: 750; letter-spacing: -.01em; }
    .mark { position: relative; width: 34px; height: 34px; border-radius: 11px; background: linear-gradient(145deg, #2563eb, #1d4ed8); box-shadow: 0 8px 20px rgba(37, 99, 235, .24); }
    .mark::before, .mark::after { content: ""; position: absolute; background: white; border-radius: 2px; }
    .mark::before { width: 15px; height: 4px; left: 9px; top: 10px; }
    .mark::after { width: 4px; height: 15px; left: 15px; top: 10px; }
    .status { display: inline-flex; align-items: center; gap: 8px; border: 1px solid #bfdbfe; border-radius: 999px; background: #eff6ff; padding: 7px 12px; color: #1d4ed8; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #3b82f6; box-shadow: 0 0 0 0 rgba(59,130,246,.5); animation: pulse 1.8s infinite; }
    h1 { margin: 22px 0 14px; font-size: clamp(32px, 7vw, 48px); line-height: 1.08; letter-spacing: -.045em; }
    .lead { max-width: 480px; margin: 0 auto; color: #64748b; font-size: clamp(16px, 3vw, 18px); line-height: 1.7; }
    .progress { position: relative; height: 8px; margin: 32px 0 20px; overflow: hidden; border-radius: 999px; background: #e8eef8; }
    .progress::after { content: ""; position: absolute; inset: 0; width: 45%; border-radius: inherit; background: linear-gradient(90deg, #2563eb, #60a5fa, #2563eb); animation: travel 2.2s ease-in-out infinite; }
    .refresh { display: flex; align-items: center; justify-content: center; gap: 8px; color: #94a3b8; font-size: 13px; }
    .refresh svg { width: 15px; height: 15px; animation: spin 2s linear infinite; }
    .footer { margin-top: 34px; border-top: 1px solid #e8eef8; padding-top: 20px; color: #94a3b8; font-size: 12px; }
    @keyframes pulse { 70% { box-shadow: 0 0 0 8px rgba(59,130,246,0); } 100% { box-shadow: 0 0 0 0 rgba(59,130,246,0); } }
    @keyframes travel { 0% { transform: translateX(-110%); } 100% { transform: translateX(245%); } }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; } }
  </style>
</head>
<body>
  <main class="shell">
    <div class="glow one"></div><div class="glow two"></div>
    <section class="card" aria-labelledby="maintenance-title">
      <div class="brand"><span class="mark" aria-hidden="true"></span><span>TSL Silesia Collab</span></div>
      <div class="status"><span class="dot" aria-hidden="true"></span>Scheduled maintenance</div>
      <h1 id="maintenance-title">We’ll be right back</h1>
      <p class="lead">We’re installing an update to make the workspace better. Your data is safe, and no action is needed.</p>
      <div class="progress" aria-hidden="true"></div>
      <div class="refresh">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 4v5h5M4 13a8.1 8.1 0 0 0 15.5 2M20 20v-5h-5"/></svg>
        This page checks again automatically
      </div>
      <div class="footer">Thank you for your patience.</div>
    </section>
  </main>
</body>
</html>`;
}

export function createMaintenanceServer() {
  const page = renderMaintenancePage();

  return createServer((request, response) => {
    if (request.url === "/health") {
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
      });
      response.end(JSON.stringify({ status: "maintenance" }));
      return;
    }

    response.writeHead(200, {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Content-Type": "text/html; charset=utf-8",
      "X-Maintenance-Mode": "active",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    });
    response.end(request.method === "HEAD" ? undefined : page);
  });
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const port = Number(process.env.NITRO_PORT ?? process.env.PORT ?? 3000);
  const host = process.env.NITRO_HOST ?? process.env.HOST ?? "127.0.0.1";
  const server = createMaintenanceServer();

  server.listen(port, host, () => {
    console.log(`[maintenance] listening on http://${host}:${port}`);
  });

  const close = () => {
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", close);
  process.on("SIGTERM", close);
}
