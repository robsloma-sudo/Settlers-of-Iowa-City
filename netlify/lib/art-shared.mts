import { getStore } from "@netlify/blobs";

export const art = () => getStore({ name: "art", consistency: "strong" });

const TILE = "Square image. Strict top-down orthographic view from directly overhead, no perspective, no horizon, no sky. Photorealistic, natural daylight from the upper left with soft shadows, rich fine detail. The scene fills the whole frame edge to edge. Keep the very centre of the image fairly plain and uncluttered, because a round number token will sit there; put the main features around it. No text, no letters, no border, no frame, no people.";

export const PROMPTS: Record<string, string> = {
  wool: `A soft green meadow seen from directly above with two fluffy tortoiseshell (black and ginger) cat paws reaching in, showing their pink toe beans, and a couple of cozy knitted mittens lying on the grass. ${TILE}`,
  grain: `An Iowa sweet corn field in late summer seen from directly above: neat rows of tall green corn plants with golden tassels, and a small pile of freshly picked ears of yellow sweet corn with peeled-back green husks. ${TILE}`,
  brick: `A small herd of adorable bright pink elephants seen from directly above, walking across reddish-orange clay savanna with patches of dry golden grass and a little watering hole. ${TILE}`,
  lumber: `A deep purple lounge tabletop seen from directly above with an open pack and scattered small vape pods with colourful mouthpieces in assorted flavour colours, plus one slim grey vape device. No logos or brand names. ${TILE}`,
  ore: `A rustic grey flagstone cellar floor seen from directly above with a wooden crate of amber Italian herbal liqueur bottles, two amber bottles lying on the stones and a short glass of amber liqueur with ice. Plain bottles, no labels, logos or brand names. ${TILE}`,
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
