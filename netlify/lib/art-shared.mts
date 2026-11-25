import { getStore } from "@netlify/blobs";

export const art = () => getStore({ name: "art", consistency: "strong" });

const TILE = "Square image. Strict top-down orthographic view from directly overhead, no perspective, no horizon, no sky. Photorealistic, natural daylight from the upper left with soft shadows, rich fine detail. The scene fills the whole frame edge to edge. Keep the very centre of the image fairly plain and uncluttered, because a round number token will sit there; put the main features around it. No text, no letters, no border, no frame, no people.";

export const PROMPTS: Record<string, string> = {
  wool: `A lush green Iowa pasture seen from above, with four or five fluffy white sheep with dark faces grazing, short bright grass with tiny wildflowers. ${TILE}`,
  grain: `An Iowa sweet corn field in late summer seen from directly above: neat rows of tall green corn plants with golden tassels, and a small pile of freshly picked ears of yellow sweet corn with peeled-back green husks. ${TILE}`,
  brick: `Rolling red clay hills seen from above with a small brickyard: neat stacked pallets of fired terracotta bricks on reddish-orange earth with patches of dry grass. ${TILE}`,
  lumber: `A dense forest canopy seen from above, mixed oak and pine crowns in deep greens, with a small clearing holding a stack of freshly cut timber logs. ${TILE}`,
  ore: `Rugged grey granite mountains and a stone quarry seen from above, rocky ridges, cut grey stone blocks and rubble with glints of metallic ore. ${TILE}`,
  desert: `A sandy desert seen from above, gentle wind-rippled dunes in pale warm sand, a couple of small dry shrubs and one small cactus. ${TILE}`,
  sea: "Deep blue-teal ocean water seen from directly above, gentle small waves and subtle sparkling sunlight, seamless tileable texture, even colour across the whole frame, no land, no boats, no horizon, no text, no border. Square image.",
  table: "A rich dark walnut wooden tabletop seen from directly above, fine straight wood grain, warm satin finish, evenly lit, seamless tileable texture filling the whole frame, no objects, no text, no border. Square image.",
};
export const NAMES = Object.keys(PROMPTS);

export type Status = { state: "idle" | "running" | "done" | "error"; started?: number; finished?: number; model?: string; done: string[]; errors: Record<string, string>; images: Record<string, number> };

export async function readStatus(): Promise<Status> {
  const s = (await art().get("status", { type: "json" })) as Status | null;
  return s || { state: "idle", done: [], errors: {}, images: {} };
}
export const writeStatus = (s: Status) => art().setJSON("status", s);

export function allowed(req: Request) {
  const key = Netlify.env.get("ART_KEY");
  const given = new URL(req.url).searchParams.get("key") || req.headers.get("x-art-key") || "";
  return !!key && given === key;
}
