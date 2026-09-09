"use client";

import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { useWallet } from "@/lib/wallet-context";

interface DisplayMessage {
  role: "user" | "assistant";
  content: string;
  toolCalls: Array<{ name: string; input: unknown }>;
}

type StreamMessage =
  | { type: "text"; text: string }
  | { type: "tool_call"; name: string; input: unknown }
  | { type: "done" }
  | { type: "error"; error: string; code?: string };

const STARTER_PROMPTS = [
  "What does evidence-only pricing mean?",
  "How is the risk discount actually calculated?",
  "What happens on-chain when a lender funds an agreement?",
  "Do I have any loans awaiting my review?",
  "What's the difference between unverified and verified evidence?",
  "How does the Borrower AI / Lender AI negotiation actually work?",
  "What do the three lender personas on the marketplace do differently?",
  "How does a lender find and fund an agreement I proposed?",
];

function toolCallLabel(call: { name: string; input: unknown }): string {
  if (call.name === "lookup_wallet_activity" && call.input && typeof call.input === "object") {
    const input = call.input as { address?: string; role?: string };
    if (input.address && input.role) {
      return `Looking up ${input.address.slice(0, 6)}…${input.address.slice(-4)}'s real on-chain history as ${input.role}…`;
    }
  }
  return `Calling ${call.name}…`;
}

/**
 * Reads the response body as newline-delimited JSON, same wire format and
 * consumption pattern as NegotiationConsole's stream reader — this is a
 * genuine live stream, not a client-side reveal timer over an already-
 * complete response.
 */
async function consumeChatStream(
  body: ReadableStream<Uint8Array>,
  handlers: {
    onText: (text: string) => void;
    onToolCall: (name: string, input: unknown) => void;
    onDone: () => void;
    onError: (error: string, code?: string) => void;
  },
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  function handleLine(line: string) {
    if (!line.trim()) return;
    const msg = JSON.parse(line) as StreamMessage;
    if (msg.type === "text") handlers.onText(msg.text);
    else if (msg.type === "tool_call") handlers.onToolCall(msg.name, msg.input);
    else if (msg.type === "done") handlers.onDone();
    else if (msg.type === "error") handlers.onError(msg.error, msg.code);
  }

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) handleLine(line);
  }
  if (buffer.trim()) handleLine(buffer);
}

/**
 * Acoris AI's chat surface. Read-only by design — it explains the protocol
 * and, when a wallet is connected, answers "my loans" questions from real
 * on-chain data (via the lookup_wallet_activity tool in
 * lib/assistant/chat-agent.ts) instead of guessing. It never proposes loan
 * terms or writes on-chain state — that's what /negotiation and
 * /marketplace are for.
 */
export function AcorisAIChat() {
  const wallet = useWallet();
  const connectedAddress = wallet.status === "connected" ? wallet.address : null;

  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  function scrollToBottom() {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setError(null);
    setInput("");
    const nextHistory = [...messages, { role: "user" as const, content: trimmed, toolCalls: [] }];
    setMessages([...nextHistory, { role: "assistant", content: "", toolCalls: [] }]);
    setSending(true);
    scrollToBottom();

    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextHistory.map((m) => ({ role: m.role, content: m.content })),
          connectedAddress,
        }),
      });

      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({ error: "Request failed" }))) as { error?: string };
        setError(data.error ?? "Request failed");
        setSending(false);
        return;
      }

      await consumeChatStream(res.body, {
        onText: (text) => {
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            next[next.length - 1] = { ...last, content: last.content + text };
            return next;
          });
          scrollToBottom();
        },
        onToolCall: (name, input) => {
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            next[next.length - 1] = { ...last, toolCalls: [...last.toolCalls, { name, input }] };
            return next;
          });
        },
        onDone: () => setSending(false),
        onError: (err) => {
          setError(err);
          setSending(false);
          dropEmptyTrailingAssistantBubble();
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
      setSending(false);
      dropEmptyTrailingAssistantBubble();
    }
  }

  /** A turn that fails before any text or tool call arrives leaves a placeholder assistant bubble with nothing to show — drop it so the error banner is the only thing explaining what happened. */
  function dropEmptyTrailingAssistantBubble() {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === "assistant" && last.content === "" && last.toolCalls.length === 0) {
        return prev.slice(0, -1);
      }
      return prev;
    });
  }

  const askedPrompts = new Set(messages.filter((m) => m.role === "user").map((m) => m.content));
  const remainingPrompts = STARTER_PROMPTS.filter((prompt) => !askedPrompts.has(prompt));

  return (
    <div className="acoris-card flex h-[32rem] flex-col overflow-hidden">
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-6 sm:px-7">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
            <p className="text-sm text-ink-mute">
              Ask about how Acoris works, or — if your wallet is connected — about your own loans.
            </p>
            <PresetPrompts prompts={STARTER_PROMPTS} onPick={(p) => void send(p)} disabled={sending} justify="center" />
          </div>
        ) : (
          messages.map((message, i) => <ChatBubble key={i} message={message} />)
        )}
      </div>

      {error && (
        <p className="border-t border-ink/5 bg-lavender-mist px-5 py-2 text-xs text-indigo-deep sm:px-7">{error}</p>
      )}

      {messages.length > 0 && remainingPrompts.length > 0 && (
        <div className="border-t border-ink/5 px-5 py-2.5 sm:px-7">
          <PresetPrompts prompts={remainingPrompts.slice(0, 3)} onPick={(p) => void send(p)} disabled={sending} justify="start" />
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="flex items-center gap-2 border-t border-ink/8 px-4 py-3 sm:px-5"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={connectedAddress ? "Ask Acoris AI anything…" : "Ask Acoris AI anything… (connect a wallet to ask about your own loans)"}
          disabled={sending}
          className="flex-1 rounded-full border border-ink/10 bg-shell px-4 py-2.5 text-sm text-ink placeholder:text-ink-mute focus:border-violet focus:outline-none disabled:opacity-60"
        />
        <button type="submit" disabled={sending || !input.trim()} className="acoris-btn px-5 py-2.5 text-[13px]">
          {sending ? "…" : "Send"}
        </button>
      </form>
    </div>
  );
}

function PresetPrompts({
  prompts,
  onPick,
  disabled,
  justify,
}: {
  prompts: string[];
  onPick: (prompt: string) => void;
  disabled: boolean;
  justify: "center" | "start";
}) {
  return (
    <div className={`flex flex-wrap gap-2 ${justify === "center" ? "justify-center" : "justify-start"}`}>
      {prompts.map((prompt) => (
        <button
          key={prompt}
          type="button"
          onClick={() => onPick(prompt)}
          disabled={disabled}
          className="rounded-full border border-ink/10 bg-lavender-mist px-3.5 py-1.5 text-xs text-indigo-deep transition-colors hover:bg-lavender-soft disabled:cursor-not-allowed disabled:opacity-50"
        >
          {prompt}
        </button>
      ))}
    </div>
  );
}

/** Renders inline `code`, fenced code blocks, bold, and lists the way the model actually writes them — never raw asterisks or dashes shown as literal text. */
const MARKDOWN_COMPONENTS = {
  p: ({ children }: { children?: React.ReactNode }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }: { children?: React.ReactNode }) => <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
  ol: ({ children }: { children?: React.ReactNode }) => <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
  li: ({ children }: { children?: React.ReactNode }) => <li>{children}</li>,
  strong: ({ children }: { children?: React.ReactNode }) => <strong className="font-semibold text-ink">{children}</strong>,
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-violet underline underline-offset-2 hover:text-indigo-deep">
      {children}
    </a>
  ),
  code: ({ className, children }: { className?: string; children?: React.ReactNode }) => {
    // remark marks fenced-block code with a `language-*` className; inline code has none.
    const isBlock = typeof className === "string" && className.startsWith("language-");
    if (isBlock) {
      return (
        <code className="block overflow-x-auto whitespace-pre font-mono text-[12.5px] leading-relaxed">{children}</code>
      );
    }
    return <code className="rounded bg-lavender-mist px-1 py-0.5 font-mono text-[12.5px] text-indigo-deep">{children}</code>;
  },
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="mb-2 overflow-x-auto rounded-lg bg-lavender-mist p-3 text-indigo-deep last:mb-0">{children}</pre>
  ),
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied by the browser — fail silently, nothing to recover from.
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      aria-label={copied ? "Copied" : "Copy response"}
      title={copied ? "Copied" : "Copy response"}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-ink-mute transition-colors hover:bg-ink/5 hover:text-ink"
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function ChatBubble({ message }: { message: DisplayMessage }) {
  const isUser = message.role === "user";
  const hasContent = message.content.trim().length > 0;

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`min-w-0 max-w-[85%] space-y-1.5 ${isUser ? "items-end" : "items-start"}`}>
        {message.toolCalls.map((call, i) => (
          <p key={i} className="acoris-eyebrow text-left text-violet">
            {toolCallLabel(call)}
          </p>
        ))}
        {(hasContent || !isUser) && (
          <div
            className={`rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed ${
              isUser ? "bg-indigo-ink text-white whitespace-pre-wrap" : "border border-ink/8 bg-shell text-ink"
            }`}
          >
            {isUser ? message.content : hasContent ? <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>{message.content}</ReactMarkdown> : "…"}
          </div>
        )}
        {!isUser && hasContent && <CopyButton text={message.content} />}
      </div>
    </div>
  );
}
