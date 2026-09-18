import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";

/**
 * The request this deployment actually sends.
 *
 * There is no Anthropic key in CI, and there should not be - these tests must
 * never spend money or depend on the network. So the SDK is pointed at a local
 * server that records the request and answers with a real Messages response
 * shape. That catches the things typecheck cannot: the wrong model id, a
 * malformed server-tool entry, text extraction that picks up the wrong blocks.
 */
let server: Server;
let received: { model?: string; tools?: { type: string; name: string }[]; max_tokens?: number; messages?: unknown[] };
let reply: unknown;

const message = (content: unknown[], stop_reason = "end_turn") => ({
  id: "msg_1",
  type: "message",
  role: "assistant",
  model: "claude-opus-5",
  content,
  stop_reason,
  stop_sequence: null,
  usage: { input_tokens: 1, output_tokens: 1 },
});

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      received = JSON.parse(body || "{}");
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(reply));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${port}`;
  // The module reads the key once, at load. Without this it is already loaded
  // keyless and every call short-circuits before the request is made.
  vi.resetModules();
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

// Imported after the env is set: the module reads the key at load.
const ai = async () => await import("@/lib/services/ai");
const load = async () => (await ai()).askForJson;

describe("what askForJson sends", () => {
  it("asks Opus, and asks for no tools when it is not grounding", async () => {
    reply = message([{ type: "text", text: '{"ok":true}' }]);
    const res = await (await load())("hello");
    expect(received.model).toBe("claude-opus-5");
    expect(received.tools).toBeUndefined();
    expect(received.max_tokens).toBe(16_000);
    expect(res.json).toEqual({ ok: true });
    expect(res.error).toBeNull();
  });

  // Gate research keeps a figure only when it can attribute it, which means
  // the model has to be able to read the web.
  it("declares the web search tool when asked to ground", async () => {
    reply = message([{ type: "text", text: "{}" }]);
    await (await load())("hello", { search: true });
    expect(received.tools).toEqual([{ type: "web_search_20260209", name: "web_search" }]);
  });
});

describe("choosing a model per purpose", () => {
  // Every purpose is Opus today on purpose - the point of the map is that
  // changing one later is an edit in one place, not a hunt through callers.
  // This asserts the routing works, not which model any purpose has, so it
  // survives that change rather than blocking it.
  it("sends the model the purpose is mapped to", async () => {
    const { MODEL_FOR } = await ai();
    for (const purpose of Object.keys(MODEL_FOR) as (keyof typeof MODEL_FOR)[]) {
      reply = message([{ type: "text", text: "{}" }]);
      await (await load())("hello", { purpose });
      expect(received.model).toBe(MODEL_FOR[purpose]);
    }
  });

  it("covers every call site's purpose", async () => {
    const { MODEL_FOR } = await ai();
    expect(Object.keys(MODEL_FOR).sort()).toEqual(
      ["doc_fill", "gate_research", "prefill", "table_columns", "table_rows"],
    );
    for (const model of Object.values(MODEL_FOR)) expect(model).toMatch(/^claude-/);
  });
});

describe("what askForJson makes of the answer", () => {
  it("reads only the text blocks, not the search results or the thinking", async () => {
    reply = message([
      { type: "thinking", thinking: "{\"not\":\"the answer\"}" },
      { type: "web_search_tool_result", tool_use_id: "t1", content: [{ type: "web_search_result", url: "https://x", title: "x" }] },
      { type: "text", text: 'Here you go: {"columns":[]}' },
    ]);
    const res = await (await load())("hello", { search: true });
    expect(res.json).toEqual({ columns: [] });
  });

  // A 200 with nothing usable in it, which is not an exception.
  it("reports a refusal rather than returning empty", async () => {
    reply = message([], "refusal");
    const res = await (await load())("hello");
    expect(res.json).toBeNull();
    expect(res.error).toBe("the model declined this request");
  });

  it("reports a truncated answer rather than half-parsing it", async () => {
    reply = message([{ type: "text", text: '{"columns":[{"label":"Siz' }], "max_tokens");
    const res = await (await load())("hello");
    expect(res.json).toBeNull();
    expect(res.error).toBe("the model's answer was cut off");
  });
});

describe("finding the JSON in a reply", () => {
  it("digs it out of prose and fences", async () => {
    const { extractJson } = await ai();
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Sure. {"a":[1,2]} Hope that helps.')).toEqual({ a: [1, 2] });
  });

  it("returns nothing rather than guessing", async () => {
    const { extractJson } = await ai();
    expect(extractJson("no json here")).toBeNull();
    expect(extractJson('{"broken": ')).toBeNull();
  });
});
