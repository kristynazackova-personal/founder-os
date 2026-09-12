import { getAppBySiteKey } from "@/lib/services/apps";
import { ingestCollect, parseCollectPayload } from "@/lib/services/attribution";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type" };

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/** Snippet collector. Body: { key, anonId, event, source, path, props }. Accepts text/plain from sendBeacon. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return Response.json({ ok: false }, { status: 400, headers: CORS });
  }
  const key = body && typeof body === "object" && typeof (body as { key?: unknown }).key === "string" ? (body as { key: string }).key : "";
  const payload = parseCollectPayload(body);
  if (!key || !payload) return Response.json({ ok: false }, { status: 400, headers: CORS });
  const app = await getAppBySiteKey(key);
  if (!app) return Response.json({ ok: false }, { status: 404, headers: CORS });
  await ingestCollect(app, payload);
  return Response.json({ ok: true }, { headers: CORS });
}
