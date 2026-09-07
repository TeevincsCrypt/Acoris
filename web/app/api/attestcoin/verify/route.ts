import { runAttestcoinVerification, EXAMPLE_SEPOLIA_TX_HASH } from "@/lib/attestcoin";

const TX_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;

function resolveTxHash(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!TX_HASH_PATTERN.test(trimmed)) return null;
  return trimmed;
}

/**
 * Runs the full Attestcoin verification pipeline server-side (see
 * lib/attestcoin.ts) for one Sepolia transaction hash, defaulting to the
 * real demo transaction (a Sepolia loan repayment) when none is supplied.
 * Every stage makes a genuine network call — this route never fabricates
 * a result. See docs/ACORIS_ATTESTCOIN_VERIFICATION.md for the exact flow
 * and this sandbox's current network limitations.
 */
export async function POST(request: Request) {
  let txHash = EXAMPLE_SEPOLIA_TX_HASH;

  try {
    const body = await request.json();
    const requested = resolveTxHash((body as { txHash?: unknown })?.txHash);
    if (requested) txHash = requested;
    else if ((body as { txHash?: unknown })?.txHash) {
      return Response.json(
        { ok: false, error: "txHash must be a 0x-prefixed 32-byte hex string" },
        { status: 400 },
      );
    }
  } catch {
    // No/invalid JSON body — fall back to the default example transaction.
  }

  const result = await runAttestcoinVerification(txHash);
  return Response.json(result);
}

/** Convenience GET for manual testing: /api/attestcoin/verify?tx=0x... */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const requested = resolveTxHash(url.searchParams.get("tx"));
  const txHash = requested ?? EXAMPLE_SEPOLIA_TX_HASH;

  const result = await runAttestcoinVerification(txHash);
  return Response.json(result);
}
