// Phase 1 smoke test: application shell + CC3 Testnet wallet/network integration.
//
// Spawns `next dev`, then drives the page with Playwright + an injected
// EIP-1193 mock provider to exercise our OWN connect/switch-network/
// disconnect logic deterministically. This does not simulate real
// Creditcoin chain state or claim any on-chain proof — it only verifies
// that Acoris's wallet integration code calls the correct RPC methods
// and reacts correctly to their responses, matching the documented
// EIP-1193 / EIP-3085 / EIP-3326 wallet standards.
//
// Run with: node tests/e2e-wallet-shell.mjs

import { spawn } from "node:child_process";
import { chromium } from "playwright";

const PORT = 3100;
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
  // Spawn the `next` binary directly (not via `npx`) so SIGTERM below
  // reaches the actual dev server process instead of an npx wrapper that
  // may not propagate the signal to its child.
  const server = spawn(`${projectRoot}node_modules/.bin/next`, ["dev", "-p", String(PORT)], {
    cwd: projectRoot,
    stdio: "inherit",
  });

  const cleanup = () => {
    server.kill("SIGTERM");
  };
  process.on("exit", cleanup);

  try {
    await waitForServer(BASE_URL);

    const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });

    // ---- Scenario 1: no injected wallet ----
    {
      const page = await browser.newPage();
      await page.goto(BASE_URL, { waitUntil: "networkidle" });

      const heading = (await page.textContent("h1")).trim();
      assert(heading === "Acoris", "page renders Acoris heading");
      assert(await page.textContent("text=No wallet"), 'shows "No wallet" badge with no window.ethereum');
      assert(
        await page.locator('button:has-text("Connect Wallet")').isDisabled(),
        "Connect button disabled with no wallet detected",
      );
      await page.close();
    }

    // ---- Scenario 2: mock wallet starts on wrong chain, connects, switches directly ----
    {
      const page = await browser.newPage();
      await page.addInitScript(() => {
        const CC3_HEX = "0x18e8f"; // 102031
        let currentChain = "0x1";
        const account = "0x1234567890123456789012345678901234567890";
        window.__mockCalls = [];
        window.ethereum = {
          isMetaMask: true,
          _listeners: {},
          on(event, handler) {
            (this._listeners[event] ||= []).push(handler);
          },
          removeListener(event, handler) {
            this._listeners[event] = (this._listeners[event] || []).filter((h) => h !== handler);
          },
          async request({ method, params }) {
            window.__mockCalls.push(method);
            if (method === "eth_requestAccounts") return [account];
            if (method === "eth_chainId") return currentChain;
            if (method === "eth_getBalance") return "0xDE0B6B3A7640000"; // 1 ether-equivalent
            if (method === "eth_blockNumber") return "0x2a";
            if (method === "wallet_switchEthereumChain") {
              const targetId = params[0].chainId;
              if (targetId !== CC3_HEX) {
                const err = new Error("Unrecognized chain");
                err.code = 4902;
                throw err;
              }
              currentChain = targetId;
              this._listeners["chainChanged"]?.forEach((h) => h(currentChain));
              return null;
            }
            if (method === "wallet_addEthereumChain") {
              currentChain = params[0].chainId;
              this._listeners["chainChanged"]?.forEach((h) => h(currentChain));
              return null;
            }
            return null;
          },
        };
      });

      await page.goto(BASE_URL, { waitUntil: "networkidle" });
      await page.click('button:has-text("Connect Wallet")');
      await page.waitForSelector("text=Wrong network", { timeout: 5000 });
      assert(await page.textContent("text=0x1234…7890"), "shows shortened mock address after connect");

      await page.click('button:has-text("Switch to CC3 Testnet")');
      await page.waitForTimeout(1000);

      const bodyText = await page.evaluate(() => document.body.textContent);
      assert(bodyText.includes("Connected") && !bodyText.includes("Wrong network"), "ends up Connected after switch");
      assert(bodyText.includes("1.0000 tCTC"), "balance parsed from mock eth_getBalance");
      assert(bodyText.includes("Latest block") && bodyText.includes("42"), "block number parsed from mock eth_blockNumber");

      const calls = await page.evaluate(() => window.__mockCalls);
      for (const m of ["eth_requestAccounts", "wallet_switchEthereumChain", "eth_getBalance", "eth_blockNumber"]) {
        assert(calls.includes(m), `called ${m}`);
      }
      await page.close();
    }

    // ---- Scenario 3: wallet has never seen CC3 Testnet -> 4902 -> addEthereumChain fallback -> disconnect ----
    {
      const page = await browser.newPage();
      await page.addInitScript(() => {
        let currentChain = "0x1";
        let chainKnown = false;
        const account = "0xa2AcCDA17eDa9A8A36A3A50293FCDcf8C416C300";
        window.ethereum = {
          isMetaMask: true,
          _listeners: {},
          on(event, handler) {
            (this._listeners[event] ||= []).push(handler);
          },
          removeListener(event, handler) {
            this._listeners[event] = (this._listeners[event] || []).filter((h) => h !== handler);
          },
          async request({ method, params }) {
            if (method === "eth_requestAccounts") return [account];
            if (method === "eth_chainId") return currentChain;
            if (method === "eth_getBalance") return "0x1BC16D674EC80000"; // 2 ether-equivalent
            if (method === "eth_blockNumber") return "0x7";
            if (method === "wallet_switchEthereumChain") {
              if (!chainKnown) {
                const err = new Error("Unrecognized chain ID");
                err.code = 4902;
                throw err;
              }
              currentChain = params[0].chainId;
              this._listeners["chainChanged"]?.forEach((h) => h(currentChain));
              return null;
            }
            if (method === "wallet_addEthereumChain") {
              chainKnown = true;
              currentChain = params[0].chainId;
              this._listeners["chainChanged"]?.forEach((h) => h(currentChain));
              return null;
            }
            return null;
          },
        };
      });

      await page.goto(BASE_URL, { waitUntil: "networkidle" });
      await page.click('button:has-text("Connect Wallet")');
      await page.waitForSelector("text=Wrong network", { timeout: 5000 });
      await page.click('button:has-text("Switch to CC3 Testnet")');
      await page.waitForTimeout(1000);

      const bodyText = await page.evaluate(() => document.body.textContent);
      assert(bodyText.includes("Connected") && !bodyText.includes("Wrong network"), "ends up Connected after addEthereumChain fallback (4902)");
      assert(bodyText.includes("2.0000 tCTC"), "balance reflects post-add-chain state");

      await page.click('button:has-text("Disconnect")');
      await page.waitForSelector('button:has-text("Connect Wallet")', { timeout: 5000 });
      const afterDisconnect = await page.evaluate(() => document.body.textContent);
      assert(!afterDisconnect.includes("0xa2Ac"), "address cleared from UI after disconnect");

      await page.close();
    }

    // ---- Scenario 4: Rabby-style wallet nests 4902 under error.data.originalError.code, not error.code ----
    {
      const page = await browser.newPage();
      await page.addInitScript(() => {
        let currentChain = "0x1";
        let chainKnown = false;
        const account = "0xb3BDcEBa27FA9A8a36a3A50293FcDCf8C416C400";
        window.ethereum = {
          isMetaMask: false,
          _listeners: {},
          on(event, handler) {
            (this._listeners[event] ||= []).push(handler);
          },
          removeListener(event, handler) {
            this._listeners[event] = (this._listeners[event] || []).filter((h) => h !== handler);
          },
          async request({ method, params }) {
            if (method === "eth_requestAccounts") return [account];
            if (method === "eth_chainId") return currentChain;
            if (method === "eth_getBalance") return "0xDE0B6B3A7640000"; // 1 ether-equivalent
            if (method === "eth_blockNumber") return "0x9";
            if (method === "wallet_switchEthereumChain") {
              if (!chainKnown) {
                // Real shape reported from a live Rabby wallet session: the
                // raw 4902 is two levels deeper than MetaMask's, behind a
                // generic -32603 "Internal JSON-RPC error".
                const message = 'Unrecognized chain ID "0x18e8f". Try adding the chain using wallet_switchEthereumChain first.';
                throw {
                  code: -32603,
                  message,
                  data: { originalError: { code: 4902, message } },
                };
              }
              currentChain = params[0].chainId;
              this._listeners["chainChanged"]?.forEach((h) => h(currentChain));
              return null;
            }
            if (method === "wallet_addEthereumChain") {
              chainKnown = true;
              currentChain = params[0].chainId;
              this._listeners["chainChanged"]?.forEach((h) => h(currentChain));
              return null;
            }
            return null;
          },
        };
      });

      await page.goto(BASE_URL, { waitUntil: "networkidle" });
      await page.click('button:has-text("Connect Wallet")');
      await page.waitForSelector("text=Wrong network", { timeout: 5000 });
      await page.click('button:has-text("Switch to CC3 Testnet")');
      await page.waitForTimeout(1000);

      const bodyText = await page.evaluate(() => document.body.textContent);
      assert(
        bodyText.includes("Connected") && !bodyText.includes("Wrong network"),
        "Rabby-style nested 4902 (error.data.originalError.code) still triggers the addEthereumChain fallback",
      );
      assert(!bodyText.includes("could not coalesce error"), "the raw ethers UNKNOWN_ERROR text is never shown as if it were unrecoverable");

      await page.close();
    }

    await browser.close();
    console.log("\nALL PHASE 1 SMOKE CHECKS PASSED");
  } finally {
    cleanup();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
