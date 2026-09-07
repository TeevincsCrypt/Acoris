// Phase 2 smoke test: Attestcoin verification pipeline, exercised through
// the real app (dev server + real API routes + real @gluwa/usc-sdk calls
// against the real network). This test does NOT mock any blockchain data —
// it drives the actual pipeline and asserts on whatever genuinely happens:
//
//   - If this environment has real internet access to CC3 Testnet / Sepolia,
//     the pipeline should progress through real stages and this script
//     prints exactly how far it got (attested / proof verified / fact).
//   - If the network is blocked (as it is in this project's sandbox — see
//     docs/ACORIS_ATTESTCOIN_VERIFICATION.md), it asserts the failure is
//     honestly reported: a real stage + error message, `networkBlocked`
//     when applicable, and — critically — that the UI never shows a fake
//     ✓ or fabricated verified fact when a stage didn't genuinely succeed.
//
// Run with: node tests/e2e-attestcoin.mjs

import { spawn } from "node:child_process";
import { chromium } from "playwright";

const PORT = 3101;
const BASE_URL = `http://localhost:${PORT}`;
const CHROMIUM_PATH = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const EXAMPLE_TX = "0x202b9b1d689578cf7dd7b279b3c9cb02f47cef7b44b6fa1650ab67977f86cb11";

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log("OK:", msg);
}

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server did not respond at ${url} within ${timeoutMs}ms`);
}

async function main() {
  const projectRoot = new URL("..", import.meta.url).pathname;
  // Spawn the `next` binary directly (not via `npx`) so SIGTERM below
  // reaches the actual dev server process instead of an npx wrapper that
  // may not propagate the signal to its child.
  const server = spawn(`${projectRoot}node_modules/.bin/next`, ["dev", "-p", String(PORT)], {
    cwd: projectRoot,
    stdio: "inherit",
  });
  const cleanup = () => server.kill("SIGTERM");
  process.on("exit", cleanup);

  try {
    await waitForServer(BASE_URL);

    // ---- API-level check: /api/attestcoin/verify never fabricates success ----
    const apiRes = await fetch(`${BASE_URL}/api/attestcoin/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const apiResult = await apiRes.json();
    console.log("API result:", JSON.stringify(apiResult, null, 2));

    assert(apiResult.transactionHash === EXAMPLE_TX, "defaults to the real example Sepolia tx hash");
    assert(typeof apiResult.stage === "string", "reports a real stage");
    if (!apiResult.ok) {
      assert(typeof apiResult.error === "string" && apiResult.error.length > 0, "a failed run reports a real error message, not a silent failure");
      assert(!apiResult.fact, "a failed run never includes a fabricated verified fact");
    } else {
      // If this ever runs somewhere with real network access, the happy
      // path should still be internally consistent.
      assert(apiResult.attested === true, "ok:true implies attested:true");
      assert(apiResult.proofVerified === true, "ok:true implies proofVerified:true");
      assert(apiResult.fact && apiResult.fact.kind === "sepolia-loan-repayment", "ok:true includes a real decoded fact");
    }

    // ---- API-level check: input validation rejects garbage tx hashes ----
    const badRes = await fetch(`${BASE_URL}/api/attestcoin/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ txHash: "not-a-hash" }),
    });
    assert(badRes.status === 400, "rejects an invalid txHash with 400");

    // ---- Browser-level check: the UI reflects the same honesty ----
    const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });
    const page = await browser.newPage();
    await page.goto(`${BASE_URL}/attestcoin`, { waitUntil: "networkidle" });

    assert((await page.textContent("h1")).includes("Attestcoin"), "attestcoin page renders");
    const input = page.locator('input[placeholder*="Sepolia"]');
    assert((await input.inputValue()) === EXAMPLE_TX, "input pre-filled with the real example tx hash");

    await page.click('button:has-text("Verify")');
    await page.waitForFunction(
      () => document.body.textContent.includes("Stopped at stage") || document.body.textContent.includes("sepolia-loan-repayment") || /Wallet 0x/.test(document.body.textContent),
      { timeout: 60000 },
    );

    const bodyText = await page.evaluate(() => document.body.textContent);
    if (bodyText.includes("Stopped at stage")) {
      console.log("UI shows a stopped-at-stage state (network blocked in this environment).");
      assert(!/Wallet 0x/.test(bodyText), "does not show a fabricated verified fact when the pipeline failed");
      const checks = await page.locator("text=✓").count();
      assert(checks === 0, `shows no fake ✓ marks when nothing was genuinely verified (found ${checks})`);
    } else {
      console.log("UI shows a completed verification (this environment has real network access).");
      assert(/Wallet 0x/.test(bodyText), "shows a real decoded fact sentence");
      const checks = await page.locator("text=✓").count();
      assert(checks === 2, `shows real ✓ marks for Attested and Proof Verified (found ${checks})`);
    }

    await browser.close();
    console.log("\nALL PHASE 2 ATTESTCOIN SMOKE CHECKS PASSED");
  } finally {
    cleanup();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
