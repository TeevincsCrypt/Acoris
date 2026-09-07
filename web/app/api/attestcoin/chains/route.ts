import { getCreditcoinProvider, listSupportedSourceChains, isLikelyNetworkBlocked } from "@/lib/attestcoin";

/**
 * Transparency endpoint: queries the CC3 Testnet ChainInfo precompile live
 * for its current list of supported source chains. Never returns a
 * hardcoded list — if the live query fails, this reports the failure
 * rather than falling back to a static guess.
 */
export async function GET() {
  const provider = getCreditcoinProvider();
  try {
    const chains = await listSupportedSourceChains(provider);
    return Response.json({ ok: true, chains });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(
      { ok: false, error: message, networkBlocked: isLikelyNetworkBlocked(err) },
      { status: 502 },
    );
  } finally {
    provider.destroy();
  }
}
