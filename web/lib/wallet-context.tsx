"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { BrowserProvider, formatEther, type Eip1193Provider, type JsonRpcSigner } from "ethers";

import {
  CC3_TESTNET_ADD_CHAIN_PARAMS,
  CC3_TESTNET_CHAIN_ID,
  CC3_TESTNET_CHAIN_ID_HEX,
} from "./creditcoin";

declare global {
  interface Window {
    ethereum?: Eip1193Provider & {
      isMetaMask?: boolean;
      on?: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
    };
  }
}

export type WalletStatus =
  | "no-wallet"
  | "disconnected"
  | "connecting"
  | "connected"
  | "wrong-network"
  | "error";

interface ChainReading {
  blockNumber: number;
  balanceWei: bigint;
  fetchedAt: number;
}

interface WalletContextValue {
  status: WalletStatus;
  address: string | null;
  chainId: number | null;
  isCorrectNetwork: boolean;
  reading: ChainReading | null;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchToCC3Testnet: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Signer for the connected account, for write transactions (e.g. Phase 4's loan contract). Throws if no wallet is connected. */
  getSigner: () => Promise<JsonRpcSigner>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

// Reading `window.ethereum` is a read of external, SSR-unavailable browser
// state, so it goes through useSyncExternalStore rather than an effect +
// setState (avoids both hydration mismatches and cascading renders).
function subscribeToInjectedWallet(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("ethereum#initialized", callback);
  return () => window.removeEventListener("ethereum#initialized", callback);
}

function getInjectedWalletSnapshot(): boolean {
  return typeof window !== "undefined" && Boolean(window.ethereum);
}

function getInjectedWalletServerSnapshot(): boolean {
  return false;
}

/**
 * Walks a thrown wallet/provider error looking for `targetCode` at any
 * nesting depth. Different wallets wrap EIP-1193 error codes differently —
 * MetaMask exposes it as `err.error.code`, while Rabby (and likely others)
 * bury it one level further at `err.error.data.originalError.code` behind a
 * generic -32603 "Internal JSON-RPC error" — so this checks every object
 * along the `.error` / `.data` / `.data.originalError` chain instead of one
 * fixed depth.
 */
export function hasProviderErrorCode(err: unknown, targetCode: number): boolean {
  const seen = new Set<unknown>();
  let node: unknown = err;
  for (let depth = 0; depth < 6 && node && typeof node === "object" && !seen.has(node); depth++) {
    seen.add(node);
    const obj = node as Record<string, unknown>;
    if (obj.code === targetCode) return true;
    const data = obj.data as Record<string, unknown> | undefined;
    node = obj.error ?? data?.originalError ?? obj.data ?? obj.originalError;
  }
  return false;
}

function useHasInjectedWallet(): boolean {
  return useSyncExternalStore(
    subscribeToInjectedWallet,
    getInjectedWalletSnapshot,
    getInjectedWalletServerSnapshot,
  );
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const hasInjectedWallet = useHasInjectedWallet();
  const [status, setStatus] = useState<WalletStatus>("disconnected");
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [reading, setReading] = useState<ChainReading | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Kept in a ref so event handlers registered once can still see live state
  // without re-subscribing on every render.
  const addressRef = useRef<string | null>(null);
  useEffect(() => {
    addressRef.current = address;
  }, [address]);

  const getBrowserProvider = useCallback((): BrowserProvider | null => {
    if (typeof window === "undefined" || !window.ethereum) return null;
    return new BrowserProvider(window.ethereum);
  }, []);

  const refresh = useCallback(async () => {
    const provider = getBrowserProvider();
    if (!provider || !addressRef.current) return;

    try {
      const network = await provider.getNetwork();
      const liveChainId = Number(network.chainId);
      setChainId(liveChainId);

      if (liveChainId !== CC3_TESTNET_CHAIN_ID) {
        setStatus("wrong-network");
        setReading(null);
        return;
      }

      const [blockNumber, balanceWei] = await Promise.all([
        provider.getBlockNumber(),
        provider.getBalance(addressRef.current),
      ]);

      setReading({ blockNumber, balanceWei, fetchedAt: Date.now() });
      setStatus("connected");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read chain state");
      setStatus("error");
    }
  }, [getBrowserProvider]);

  const connect = useCallback(async () => {
    if (typeof window === "undefined" || !window.ethereum) return;

    setStatus("connecting");
    setError(null);

    try {
      const provider = new BrowserProvider(window.ethereum);
      const accounts = (await provider.send("eth_requestAccounts", [])) as string[];

      if (!accounts || accounts.length === 0) {
        throw new Error("No accounts returned by wallet");
      }

      setAddress(accounts[0]);
      addressRef.current = accounts[0];

      const network = await provider.getNetwork();
      const liveChainId = Number(network.chainId);
      setChainId(liveChainId);

      if (liveChainId !== CC3_TESTNET_CHAIN_ID) {
        setStatus("wrong-network");
        return;
      }

      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect wallet");
      setStatus("error");
    }
  }, [refresh]);

  const switchToCC3Testnet = useCallback(async () => {
    if (typeof window === "undefined" || !window.ethereum) return;

    const provider = new BrowserProvider(window.ethereum);
    setError(null);

    try {
      await provider.send("wallet_switchEthereumChain", [
        { chainId: CC3_TESTNET_CHAIN_ID_HEX },
      ]);
    } catch (switchErr) {
      // 4902 = chain not yet added to the wallet (EIP-3326). ethers'
      // BrowserProvider wraps EIP-1193 errors into its own error shape
      // (top-level `.code` becomes an ethers code like "UNKNOWN_ERROR"),
      // re-attaching the original provider error under `.error` — verified
      // against node_modules/ethers/lib.commonjs/providers/provider-jsonrpc.js
      // (getRpcError) and utils/errors.js (makeError). MetaMask puts 4902
      // directly on that `.error.code`, but other wallets nest it one level
      // deeper still — e.g. Rabby returns `.error = {code: -32603, data:
      // {originalError: {code: 4902, ...}}}` (confirmed against a real
      // "could not coalesce error" report from a live Rabby session), so the
      // whole chain has to be walked rather than checking one fixed depth.
      if (hasProviderErrorCode(switchErr, 4902)) {
        try {
          await provider.send("wallet_addEthereumChain", [CC3_TESTNET_ADD_CHAIN_PARAMS]);
        } catch (addErr) {
          setError(addErr instanceof Error ? addErr.message : "Failed to add CC3 Testnet");
          setStatus("error");
          return;
        }
      } else {
        setError(switchErr instanceof Error ? switchErr.message : "Failed to switch network");
        setStatus("error");
        return;
      }
    }

    // Wallets fire `chainChanged`, but re-check directly too so the UI
    // updates even if the event is slow to arrive.
    const network = await provider.getNetwork();
    const liveChainId = Number(network.chainId);
    setChainId(liveChainId);

    if (liveChainId === CC3_TESTNET_CHAIN_ID && addressRef.current) {
      await refresh();
    } else if (liveChainId !== CC3_TESTNET_CHAIN_ID) {
      setStatus("wrong-network");
    }
  }, [refresh]);

  const getSigner = useCallback(async (): Promise<JsonRpcSigner> => {
    const provider = getBrowserProvider();
    if (!provider) throw new Error("No wallet available");
    return provider.getSigner();
  }, [getBrowserProvider]);

  const disconnect = useCallback(() => {
    setAddress(null);
    addressRef.current = null;
    setChainId(null);
    setReading(null);
    setError(null);
    setStatus("disconnected");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.ethereum?.on) return;

    const handleAccountsChanged = (...args: unknown[]) => {
      const accounts = args[0] as string[];
      if (!accounts || accounts.length === 0) {
        disconnect();
        return;
      }
      setAddress(accounts[0]);
      addressRef.current = accounts[0];
      void refresh();
    };

    const handleChainChanged = (...args: unknown[]) => {
      const hexChainId = args[0] as string;
      const liveChainId = parseInt(hexChainId, 16);
      setChainId(liveChainId);
      if (liveChainId === CC3_TESTNET_CHAIN_ID) {
        void refresh();
      } else {
        setStatus("wrong-network");
        setReading(null);
      }
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      window.ethereum?.removeListener?.("accountsChanged", handleAccountsChanged);
      window.ethereum?.removeListener?.("chainChanged", handleChainChanged);
    };
  }, [disconnect, refresh]);

  const isCorrectNetwork = chainId === CC3_TESTNET_CHAIN_ID;
  const effectiveStatus: WalletStatus =
    status === "disconnected" && !hasInjectedWallet ? "no-wallet" : status;

  const value = useMemo<WalletContextValue>(
    () => ({
      status: effectiveStatus,
      address,
      chainId,
      isCorrectNetwork,
      reading,
      error,
      connect,
      disconnect,
      switchToCC3Testnet,
      refresh,
      getSigner,
    }),
    [
      effectiveStatus,
      address,
      chainId,
      isCorrectNetwork,
      reading,
      error,
      connect,
      disconnect,
      switchToCC3Testnet,
      refresh,
      getSigner,
    ],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within a WalletProvider");
  return ctx;
}

/** Shared so the nav and the wallet panel never render the same account differently. */
export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function formatTctc(balanceWei: bigint): string {
  const asString = formatEther(balanceWei);
  const [whole, fraction = ""] = asString.split(".");
  return `${whole}.${fraction.slice(0, 4).padEnd(4, "0")}`;
}
