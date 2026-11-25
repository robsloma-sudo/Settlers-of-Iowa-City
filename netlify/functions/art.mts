import type { Config } from "@netlify/functions";
import { art, allowed, NAMES, readStatus, writeStatus } from "../lib/art-shared.mts";

// /art-api/status : which AI pictures exist (public, used by the game)
// /ai-art/<name>  : serves one AI picture
// /art-api/reset  : (needs key) removes AI pictures so the hand-made art shows again
export default async (req: Request) => {
  const url = new URL(req.url);
  if (url.pathname === "/art-api/status") {
    const s = await readStatus();
    return Response.json(url.searchParams.get("key") && allowed(req) ? s : { images: s.images, state: s.state }, { headers: { "cache-control": "no-store" } });
  }
  if (url.pathname === "/art-api/reset") {
    if (!allowed(req) || req.method !== "POST") return new Response("Not allowed", { status: 403 });
    const only = (url.searchParams.get("only") || "").split(",").filter((n) => NAMES.includes(n));
    const s = await readStatus();
    for (const n of only.length ? only : NAMES) { await art().delete("img/" + n); delete s.images[n]; }
    await writeStatus(s);
    return Response.json(s);
  }
  const name = url.pathname.split("/").pop() || "";
  if (!NAMES.includes(name)) return new Response("Not found", { status: 404 });
  const entry = await art().getWithMetadata("img/" + name, { type: "arrayBuffer" });
  if (!entry) return new Response("Not found", { status: 404 });
  return new Response(entry.data as ArrayBuffer, {
    headers: { "content-type": String((entry.metadata as any)?.type || "image/jpeg"), "cache-control": "public, max-age=31536000, immutable" },
  });
};

export const config: Config = { path: ["/art-api/status", "/art-api/reset", "/ai-art/*"] };
