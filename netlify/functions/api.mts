import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
// @ts-ignore plain JS rules engine
import { createGame, addPlayer, applyAction, view, botPending, botStep, checkTimeout, GEO } from "../../shared/engine.js";

const BOT_DELAY: number = (globalThis as any).__BOT_DELAY ?? 700; // ms between computer moves, so people can follow along
const games = () => getStore({ name: "games", consistency: "strong" });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const err = (message: string, status = 400) => json({ error: message }, status);
const key = (code: unknown) => String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);

function newCode() {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 5; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
}

// Read the game, change it, and save it only if nobody else saved in between (retry if they did).
async function mutate(code: string, fn: (g: any) => unknown) {
  const store = games();
  for (let attempt = 0; attempt < 8; attempt++) {
    const entry = await store.getWithMetadata(code, { type: "json", consistency: "strong" });
    if (!entry) throw Object.assign(new Error("Game not found. Check the code."), { rule: true, status: 404 });
    const g = entry.data as any;
    const result = fn(g);
    if (result === false) return { g, result };
    g.version++;
    g.updated = Date.now();
    const { modified } = await store.setJSON(code, g, { onlyIfMatch: entry.etag });
    if (modified) return { g, result };
  }
  throw Object.assign(new Error("The table is busy — try that again."), { rule: true, status: 409 });
}

export default async (req: Request) => {
  const url = new URL(req.url);
  const route = url.pathname.replace(/^\/api\//, "");
  try {
    if (req.method === "GET" && route === "state") {
      const code = key(url.searchParams.get("code"));
      const token = url.searchParams.get("token") || "";
      const known = Number(url.searchParams.get("v") || 0);
      const entry = await games().get(code, { type: "json", consistency: "strong" });
      if (!entry) return err("Game not found. Check the code.", 404);
      let g = entry as any;
      const p = g.players.find((x: any) => x.token === token);
      if (!p) return err("You are not seated in this game.", 403);
      if (g.phase === "play" && g.turn.deadline && Date.now() >= g.turn.deadline) {
        try { g = (await mutate(code, (fresh) => (checkTimeout(fresh) ? undefined : false))).g; } catch (e) { /* someone else passed it on */ }
      }
      if (botPending(g) && Date.now() - g.updated >= BOT_DELAY) {
        try {
          g = (await mutate(code, (fresh) => (botPending(fresh) && Date.now() - fresh.updated >= BOT_DELAY ? botStep(fresh) : false))).g;
        } catch (e) { /* another player's request moved the computer first */ }
      }
      if (g.version === known) return json({ same: true });
      const out: any = view(g, p.id);
      if (url.searchParams.get("geo")) out.geo = GEO;
      return json(out);
    }

    if (req.method !== "POST") return err("Not found", 404);
    const body = await req.json().catch(() => ({}));

    if (route === "create") {
      const store = games();
      for (let i = 0; i < 5; i++) {
        const code = newCode();
        const { g, token } = createGame(code, body.name);
        const { modified } = await store.setJSON(code, g, { onlyIfNew: true });
        if (modified) return json({ code, token });
      }
      return err("Could not create a game. Try again.", 500);
    }
    if (route === "join") {
      const code = key(body.code);
      const { result } = await mutate(code, (g) => addPlayer(g, body.name, false).token);
      return json({ code, token: result });
    }
    if (route === "action") {
      const code = key(body.code);
      const { g } = await mutate(code, (g) => {
        const p = g.players.find((x: any) => x.token === body.token);
        if (!p) throw Object.assign(new Error("You are not seated in this game."), { rule: true, status: 403 });
        if (checkTimeout(g)) return;   // time ran out first: save the skipped turn
        applyAction(g, p.id, body.action);
      });
      const p = g.players.find((x: any) => x.token === body.token);
      return json(view(g, p.id));
    }
    return err("Not found", 404);
  } catch (e: any) {
    if (e && e.rule) return err(e.message, e.status || 400);
    console.error(e);
    return err("Something went wrong on the server.", 500);
  }
};

export const config: Config = { path: "/api/*" };
