import type { Config } from "@netlify/functions";
import OpenAI from "openai";
import { art, allowed, NAMES, PROMPTS, readStatus, writeStatus } from "../lib/art-shared.mts";

// Runs in the background (up to 15 minutes): asks OpenAI, through Netlify AI Gateway, for each picture.
const PREFERRED = ["gpt-image-2", "gpt-image-1.5", "gpt-image-1", "gpt-image-1-mini"];

async function imageModels(): Promise<string[]> {
  try {
    const r = await fetch("https://api.netlify.com/api/v1/ai-gateway/providers/detailed");
    const text = await r.text();
    const found = [...new Set(text.match(/gpt-image[-\w.]*/g) || [])];
    const rank = (m: string) => { const i = PREFERRED.findIndex((p) => m === p); return i < 0 ? 50 - parseFloat(m.replace(/[^\d.]/g, "") || "0") : i; };
    if (found.length) return found.sort((a, b) => rank(a) - rank(b));
  } catch (e) { console.log("model list unavailable", e); }
  return PREFERRED;
}

async function makeOne(client: OpenAI, models: string[], name: string) {
  let last: any;
  for (const model of models) {
    for (const fmt of [{ output_format: "jpeg", output_compression: 84 }, {}]) {
      try {
        const res: any = await client.images.generate({ model, prompt: PROMPTS[name], size: "1024x1024", quality: "high", n: 1, ...(fmt as any) });
        const b64 = res.data?.[0]?.b64_json;
        if (!b64) throw new Error("No image came back.");
        const bytes = Buffer.from(b64, "base64");
        const type = bytes[0] === 0xff ? "image/jpeg" : bytes[0] === 0x89 ? "image/png" : "image/webp";
        await art().set("img/" + name, bytes, { metadata: { type, model, created: Date.now() } });
        return model;
      } catch (e: any) {
        last = e;
        console.log(name, model, String(e?.message || e));
        // a format the model does not accept: retry plain; anything else: try the next model
        if (!/output_format|output_compression|parameter/i.test(String(e?.message || e))) break;
      }
    }
  }
  throw last || new Error("Could not generate.");
}

export default async (req: Request) => {
  if (!allowed(req)) return;
  const only = (new URL(req.url).searchParams.get("only") || "").split(",").filter((n) => NAMES.includes(n));
  const list = only.length ? only : NAMES;
  const status = await readStatus();
  if (status.state === "running" && Date.now() - (status.started || 0) < 14 * 60 * 1000) return;
  status.state = "running"; status.started = Date.now(); status.done = []; status.errors = {};
  if (!Netlify.env.get("OPENAI_BASE_URL") && !Netlify.env.get("OPENAI_API_KEY")) {
    status.state = "error"; status.errors.all = "Netlify AI Gateway is not switched on for this account (it needs a credit-based Netlify plan).";
    await writeStatus(status); return;
  }
  await writeStatus(status);
  const client = new OpenAI();
  const models = await imageModels();
  await Promise.all(list.map(async (name) => {
    try {
      status.model = await makeOne(client, models, name);
      status.done.push(name); status.images[name] = Date.now();
    } catch (e: any) {
      status.errors[name] = String(e?.message || e).slice(0, 300);
    }
    await writeStatus(status);
  }));
  status.state = Object.keys(status.errors).length && !status.done.length ? "error" : "done";
  status.finished = Date.now();
  await writeStatus(status);
};

export const config: Config = { path: "/art-api/generate", background: true };
