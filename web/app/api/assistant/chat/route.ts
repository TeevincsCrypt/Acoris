import { z } from "zod";

import { AIUnavailableError } from "@/lib/negotiation/ai-agent";
import { runChatTurn, type ChatMessage, type ChatStreamEvent } from "@/lib/assistant/chat-agent";

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

const RequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1),
      }),
    )
    .min(1),
  // The connected wallet's address, if any — lets Acoris AI answer "my
  // loans" questions without asking the user to paste their own address.
  connectedAddress: z.string().regex(ADDRESS_PATTERN).nullable().optional(),
});

/**
 * Streams one Acoris AI turn back to the client as newline-delimited JSON —
 * same wire format /api/negotiation/run uses, so the client can tell a
 * fast-fail validation error apart from a streaming response by status code
 * without parsing partial NDJSON.
 */
export async function POST(request: Request) {
  let parsedBody: unknown;
  try {
    parsedBody = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(parsedBody);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", issues: parsed.error.issues }, { status: 400 });
  }

  const { messages, connectedAddress } = parsed.data;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (msg: ChatStreamEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(msg)}\n`));
      try {
        await runChatTurn(messages as ChatMessage[], connectedAddress ?? null, send);
        send({ type: "done" });
      } catch (err) {
        if (err instanceof AIUnavailableError) {
          send({ type: "error", error: err.message, code: "ai-unavailable" });
        } else {
          send({ type: "error", error: err instanceof Error ? err.message : "Acoris AI failed", code: "chat-error" });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}
