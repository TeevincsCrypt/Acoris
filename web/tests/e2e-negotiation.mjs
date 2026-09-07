// Phase 3A/3B smoke test: the negotiation UI + API route through the real
// app. No LLM calls are mocked. In this sandbox there is no
// ANTHROPIC_API_KEY configured, so the honest, expected outcome is a clear
// "AI unavailable" error — never a fabricated negotiation. That check
// (isAIConfigured()) runs BEFORE the response stream opens, so it's still a
// single plain JSON 503 response, not NDJSON — this test asserts exactly
// that, plus the deterministic parts (input validation, on-chain-evidence
// "not deployed" handling, Verified Credit badges) that don't depend on the
// AI being reachable. It does not exercise the real round-by-round NDJSON
// stream, since that only starts once the AI is reachable.
//
// Run with: node tests/e2e-negotiation.mjs

import { spawn } from "node:child_process";
import { chromium } from "playwright";

const PORT = 3102;
const BASE_URL = `http://localhost:${PORT}`;
const CHROMIUM_PATH = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

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
  const server = spawn(`${projectRoot}node_modules/.bin/next`, ["dev", "-p", String(PORT)], {
    cwd: projectRoot,
    stdio: "inherit",
  });
  const cleanup = () => server.kill("SIGTERM");
  process.on("exit", cleanup);

  try {
    await waitForServer(BASE_URL);

    // ---- API-level: valid request, no API key configured -> honest failure ----
    const res = await fetch(`${BASE_URL}/api/negotiation/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        loanRequest: { amount: 10000, collateralValue: 17000, durationDays: 30, maxApr: 9 },
        financialEvidence: { mode: "none" },
      }),
    });
    const isStream = res.headers.get("content-type")?.includes("ndjson") ?? false;

    if (!isStream) {
      const body = await res.json();
      console.log("negotiation API result:", JSON.stringify(body));
      assert(res.status === 503 && body.code === "ai-unavailable", `expected a 503 ai-unavailable JSON response, got ${res.status}: ${JSON.stringify(body)}`);
      console.log("This environment has no ANTHROPIC_API_KEY configured (expected here).");
      assert(typeof body.error === "string" && body.error.length > 0, "reports a real, specific error message");
      assert(body.rounds === undefined, "no fabricated rounds when AI is unavailable");
      assert(body.finalTerms === undefined, "no fabricated final terms when AI is unavailable");
    } else {
      // If this ever runs somewhere with a real key configured, the
      // response is a genuine NDJSON stream — sanity-check it decodes into
      // an internally-consistent sequence of "round" messages followed by
      // exactly one "complete".
      const text = await res.text();
      const messages = text
        .split("\n")
        .filter((l) => l.trim().length > 0)
        .map((l) => JSON.parse(l));
      const rounds = messages.filter((m) => m.type === "round");
      const complete = messages.find((m) => m.type === "complete");
      assert(rounds.length > 0, "at least one round streamed before completion");
      assert(Boolean(complete), "stream ends with a complete message");
      assert(["accepted", "rejected", "no-agreement"].includes(complete.result.finalTerms.status), "final terms have a valid status");
      assert(complete.result.rounds.length <= 8, "negotiation stayed within the round limit");
    }

    // ---- API-level: invalid loan request rejected ----
    const badRes = await fetch(`${BASE_URL}/api/negotiation/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loanRequest: { amount: -1, collateralValue: 17000, durationDays: 30, maxApr: 9 } }),
    });
    assert(badRes.status === 400, "rejects an invalid loan request with 400");

    // ---- API-level: on-chain evidence mode, registry not deployed -> honest 502, never fabricated history ----
    const onchainRes = await fetch(`${BASE_URL}/api/negotiation/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        loanRequest: { amount: 10000, collateralValue: 17000, durationDays: 30, maxApr: 9 },
        financialEvidence: { mode: "onchain", borrowerAddress: "0x2222222222222222222222222222222222222222" },
      }),
    });
    const onchainBody = await onchainRes.json();
    assert(onchainRes.status === 502, "on-chain evidence mode fails honestly when AcorisLoanRegistry isn't deployed");
    assert(
      typeof onchainBody.error === "string" && onchainBody.error.includes("not deployed"),
      "reports exactly why on-chain evidence isn't available, rather than fabricating history",
    );

    // ---- API-level: multiple transaction hashes accepted by the schema ----
    const multiTxRes = await fetch(`${BASE_URL}/api/negotiation/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        loanRequest: { amount: 10000, collateralValue: 17000, durationDays: 30, maxApr: 9 },
        financialEvidence: {
          mode: "verify",
          transactionHashes: ["0x" + "a".repeat(64), "0x" + "b".repeat(64)],
        },
      }),
    });
    assert(multiTxRes.status !== 400, "multiple transaction hashes are accepted by the request schema");

    // ---- Browser-level ----
    const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });
    const page = await browser.newPage();
    await page.goto(`${BASE_URL}/negotiation`, { waitUntil: "networkidle" });

    assert((await page.textContent("h1")).includes("Negotiate a Loan"), "negotiation page renders");
    assert(await page.textContent("text=Borrow Request"), "shows Borrow Request section");
    assert(await page.textContent("text=Verified Credit"), "shows Verified Credit section");

    const amountInput = page.locator('input[type="number"]').first();
    assert((await amountInput.inputValue()) === "10000", "loan request pre-filled with the example amount");

    await page.click('button:has-text("Start AI Negotiation")');
    await page.waitForFunction(
      () => document.body.textContent.includes("AI negotiation is unavailable") || document.body.textContent.includes("Round 1"),
      { timeout: 30000 },
    );

    const bodyText = await page.evaluate(() => document.body.textContent);
    if (bodyText.includes("AI negotiation is unavailable")) {
      console.log("UI correctly shows the AI-unavailable state (no key configured here).");
      assert(!bodyText.includes("Round 1"), "no fabricated negotiation rounds shown when AI is unavailable");
      assert(!bodyText.includes("Final Agreement"), "no fabricated final agreement shown when AI is unavailable");
    } else {
      console.log("UI shows a completed negotiation (this environment has a real API key).");
      assert(bodyText.includes("Round 1"), "shows negotiation rounds");
      assert(bodyText.includes("Final Agreement"), "shows a final agreement section");
    }

    await browser.close();
    console.log("\nALL PHASE 3A NEGOTIATION SMOKE CHECKS PASSED");
  } finally {
    cleanup();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
