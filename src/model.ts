import type { ArtifactType, WorldCanon, WorldProject, WorldScene } from "./types.js";
import { ARTIFACT_TYPES } from "./types.js";
import { makeId, slugify } from "./ids.js";
import { isRecord } from "./validation.js";

export interface ModelRequest {
  task: string;
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  temperature?: number;
  context?: Record<string, unknown>;
}

export interface ModelAdapter {
  readonly id: string;
  generateObject<T extends Record<string, unknown>>(request: ModelRequest): Promise<T>;
}

export interface OpenAICompatibleOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  fetch?: typeof globalThis.fetch;
  headers?: Record<string, string>;
}

function extractJson(text: string): Record<string, unknown> {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (isRecord(parsed)) return parsed;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const parsed: unknown = JSON.parse(trimmed.slice(start, end + 1));
      if (isRecord(parsed)) return parsed;
    }
  }
  throw new Error("Model did not return a JSON object");
}

export class OpenAICompatibleAdapter implements ModelAdapter {
  readonly id = "openai-compatible";
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly doFetch: typeof globalThis.fetch;
  private readonly headers: Record<string, string>;

  constructor(options: OpenAICompatibleOptions) {
    if (!options.apiKey) throw new Error("OpenAI-compatible adapter requires an API key");
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
    this.model = options.model || "gpt-4.1-mini";
    this.doFetch = options.fetch || globalThis.fetch;
    this.headers = options.headers || {};
  }

  async generateObject<T extends Record<string, unknown>>(request: ModelRequest): Promise<T> {
    let correction = "";
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await this.doFetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          ...this.headers,
        },
        body: JSON.stringify({
          model: this.model,
          temperature: request.temperature ?? 0.7,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: `${request.prompt}${correction}` },
          ],
        }),
      });
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 800);
        throw new Error(`Model request failed (${response.status}): ${detail}`);
      }
      const payload: unknown = await response.json();
      const content = isRecord(payload)
        && Array.isArray(payload.choices)
        && isRecord(payload.choices[0])
        && isRecord(payload.choices[0].message)
        ? payload.choices[0].message.content
        : null;
      if (typeof content !== "string") throw new Error("Model response did not include message content");
      try {
        return extractJson(content) as T;
      } catch (error) {
        lastError = error as Error;
        correction = `\n\nYour prior answer was invalid: ${lastError.message}. Return one corrected JSON object matching this contract: ${JSON.stringify(request.schema)}`;
      }
    }
    throw lastError || new Error("Model returned invalid JSON");
  }
}

function titleFromBrief(brief: string): string {
  const words = brief.replace(/[^a-zA-Z0-9' -]/g, " ").trim().split(/\s+/).slice(0, 5);
  return words.length ? words.map((word) => word[0]?.toUpperCase() + word.slice(1)).join(" ") : "The Lantern Archive";
}

function demoCanon(context: Record<string, unknown>): WorldCanon {
  const brief = typeof context.brief === "string" ? context.brief : "A city remembers every promise made after midnight.";
  const premise = brief.replace(/[.!?]+$/, "");
  const embeddedPremise = premise.charAt(0).toLowerCase() + premise.slice(1);
  const title = typeof context.title === "string" && context.title ? context.title : titleFromBrief(brief);
  return {
    title,
    logline: `When a courier discovers that ${embeddedPremise}, they must decide which truth the city is allowed to remember.`,
    genre: "Speculative mystery",
    tone: ["luminous", "intimate", "restless"],
    themes: ["memory versus truth", "the cost of belonging", "chosen trust"],
    audience: "Teen and adult audiences; adventurous, emotionally grounded, non-graphic",
    rules: [
      "Promises spoken under a lit archive lamp become visible as silver threads.",
      "A memory can be copied but never destroyed without changing the person who carried it.",
      "The city gates close at the third midnight bell.",
    ],
    characters: [
      {
        id: "character_rowan",
        name: "Rowan Vale",
        role: "Player-facing courier and reluctant witness",
        goal: "Deliver the sealed memory before the third bell",
        conflict: "Rowan's own missing year may be inside the package",
        voice: "Observant, dry, short sentences that soften around people they trust",
        appearance: "Copper-brown skin, cropped black curls, amber eyes, narrow scar through the left eyebrow",
        wardrobe: "Indigo courier coat, brass clasps, weathered satchel, charcoal boots",
        anchors: ["left-eyebrow scar", "indigo coat with three brass clasps", "weathered cross-body satchel"],
      },
      {
        id: "character_mara",
        name: "Mara Quill",
        role: "Archive keeper and dangerous ally",
        goal: "Expose the council's edited history without erasing innocent lives",
        conflict: "Her family built the machine she wants to stop",
        voice: "Precise and restrained, with sudden vivid metaphors when emotion breaks through",
        appearance: "Tall, pale olive complexion, long silver-black braid, dark green eyes",
        wardrobe: "Moss velvet waistcoat, cream rolled-sleeve shirt, black archive gloves",
        anchors: ["silver-black braid", "moss waistcoat", "ink-stained black gloves"],
      },
    ],
    locations: [
      {
        id: "location_rain_market",
        name: "The Rain Market",
        description: "A stepped night bazaar under copper gutters, crowded around a canal bright with reflected signs.",
        mood: "Busy, rain-polished, full of overheard bargains",
        visualAnchors: ["copper awnings", "blue canal lanterns", "red paper weather charms"],
        connections: ["location_archive", "location_clock_bridge"],
      },
      {
        id: "location_archive",
        name: "The Lantern Archive",
        description: "A circular library built around a black-water well, with thousands of suspended glass memory lamps.",
        mood: "Sacred, precarious, softly mechanical",
        visualAnchors: ["floating glass lamps", "black central well", "spiral brass walkways"],
        connections: ["location_rain_market", "location_clock_bridge"],
      },
      {
        id: "location_clock_bridge",
        name: "Third Bell Bridge",
        description: "A high iron bridge through the clock tower, overlooking the closed city gates and dawn fog.",
        mood: "Exposed, urgent, suspended between escape and return",
        visualAnchors: ["enormous clock gears", "white dawn fog", "iron gate chains"],
        connections: ["location_rain_market", "location_archive"],
      },
    ],
    story: {
      premise: "A routine courier job exposes a civic machine that edits painful memories in the name of peace.",
      incitingIncident: "The sealed package speaks Rowan's childhood nickname in Mara's voice.",
      centralConflict: "Rowan and Mara must reveal the archive's abuse without collapsing the memories that hold the city together.",
      beats: [
        { id: "beat_arrival", title: "The Speaking Parcel", summary: "Rowan crosses the Rain Market with a parcel that should be silent.", turn: "The parcel proves connected to Rowan's missing year.", locationId: "location_rain_market", characterIds: ["character_rowan"] },
        { id: "beat_bargain", title: "The Keeper's Bargain", summary: "Mara intercepts Rowan and asks for trust before evidence.", turn: "Mara reveals that the council is already hunting them.", locationId: "location_rain_market", characterIds: ["character_rowan", "character_mara"] },
        { id: "beat_descent", title: "Below the Lamps", summary: "They enter the Archive through the maintenance rings.", turn: "Rowan finds a lamp labeled with their own name.", locationId: "location_archive", characterIds: ["character_rowan", "character_mara"] },
        { id: "beat_reveal", title: "The Edited Year", summary: "The memory shows why Rowan chose to forget Mara.", turn: "Forgetting was Rowan's choice, not the council's theft.", locationId: "location_archive", characterIds: ["character_rowan", "character_mara"] },
        { id: "beat_choice", title: "At the Third Bell", summary: "They carry the master record to the bridge as the gates close.", turn: "Rowan must publish, preserve, or entrust the record.", locationId: "location_clock_bridge", characterIds: ["character_rowan", "character_mara"] },
      ],
      possibleEndings: [
        "Publish the whole record and let the city face an uncontrolled truth.",
        "Expose the council while preserving private memories behind a new public compact.",
        "Give Mara the record and leave through the gates, choosing personal trust over public certainty.",
      ],
    },
    continuity: {
      visualRules: ["rain-slick copper and indigo palette", "warm memory lamps against cool blue night", "35mm cinematic realism with soft halation"],
      wardrobe: { character_rowan: "Indigo coat and satchel throughout; coat becomes rain-darkened after the market", character_mara: "Moss waistcoat and black gloves; right glove removed only when touching a memory lamp" },
      props: ["Rowan owns the sealed brass-edged parcel until the Archive reveal", "Mara carries one black archive key", "The master record is a clear lamp with a silver fracture"],
      geography: ["Rain Market connects to both Archive and bridge", "The Archive well is below street level", "Third Bell Bridge crosses above the eastern gate"],
      timeline: ["Story begins after the first midnight bell", "Archive reveal occurs before the third bell", "Only Rowan and Mara know the parcel's contents until the ending"],
    },
  };
}

function demoArtifact(type: ArtifactType, canon: WorldCanon): Record<string, unknown> {
  const first = canon.characters[0]!;
  const second = canon.characters[1] || first;
  const location = canon.locations[0]!;
  const baseAsset = {
    id: `${type}_hero_image`,
    kind: "image",
    title: `${canon.title} key art`,
    prompt: `${first.appearance}, ${first.wardrobe}, and ${second.appearance}, ${second.wardrobe}, stand in ${location.description}. ${canon.continuity.visualRules.join(", ")}. Preserve ${[...first.anchors, ...second.anchors].join(", ")}. Cinematic editorial composition, no text.`,
    negativePrompt: "identity drift, changed wardrobe, extra fingers, illegible signage, generic empty background",
    characterIds: [first.id, second.id],
    locationId: location.id,
    continuityAnchors: [...first.anchors, ...second.anchors, ...location.visualAnchors],
  };
  const shared = {
    title: `${canon.title}: ${type.replaceAll("_", " ")}`,
    summary: `${canon.logline} This package translates the frozen canon into a production-ready ${type.replaceAll("_", " ")}.`,
    assetPlan: [baseAsset],
  };
  if (type === "narrative") return { ...shared, content: { format: "novella treatment", chapters: canon.story.beats.map((beat) => ({ title: beat.title, summary: beat.summary, turn: beat.turn })), endings: canon.story.possibleEndings }, blocks: canon.story.beats.map((beat) => ({ kind: "story", title: beat.title, body: beat.summary, data: beat })) };
  if (type === "game_world") return { ...shared, content: { playerFantasy: `Become ${first.name}, move through a city of visible promises, and decide what truth costs.`, coreLoop: ["explore a connected location", "read environmental memory threads", "choose who to trust", "change relationships and access", "commit to an ending"], zones: canon.locations, quests: canon.story.beats.map((beat) => ({ id: `quest_${beat.id}`, title: beat.title, objective: beat.summary, locationId: beat.locationId })), systems: ["relationship pressure", "memory evidence inventory", "clock progression", "choice consequences"], runtimeHooks: ["onEnterLocation", "onDialogueChoice", "onEvidenceFound", "onThirdBell"] }, blocks: canon.locations.map((place) => ({ kind: "location", title: place.name, body: place.description, data: place })) };
  if (type === "storyboard") return { ...shared, content: { aspectRatio: "2.39:1", visualLanguage: canon.continuity.visualRules, shots: canon.story.beats.flatMap((beat, index) => [{ shot: index * 2 + 1, beatId: beat.id, size: index === 0 ? "wide" : "medium", lens: "35mm", movement: "slow motivated push", action: beat.summary, transition: "cut on changed intention", durationSeconds: 6, imagePrompt: `${beat.summary}. ${canon.continuity.visualRules.join(", ")}.`, continuityAnchors: canon.continuity.props }, { shot: index * 2 + 2, beatId: beat.id, size: "close", lens: "65mm", movement: "subtle handheld drift", action: beat.turn, transition: "hold, then cut", durationSeconds: 4, imagePrompt: `${beat.turn}. Close emotional coverage, ${canon.continuity.visualRules.join(", ")}.`, continuityAnchors: canon.continuity.props }]) }, blocks: canon.story.beats.map((beat) => ({ kind: "shot", title: beat.title, body: beat.turn, data: beat })) };
  if (type === "film_treatment") return { ...shared, content: { format: "105-minute feature", logline: canon.logline, synopsis: canon.story.premise, acts: [{ act: 1, beats: canon.story.beats.slice(0, 2) }, { act: 2, beats: canon.story.beats.slice(2, 4) }, { act: 3, beats: canon.story.beats.slice(4) }], characterArcs: canon.characters.map((character) => ({ name: character.name, starts: character.conflict, pursues: character.goal, ends: "transformed by the final truth choice" })), visualLanguage: canon.continuity.visualRules, sound: "Close rain, glass harmonics, clock mechanisms, and a restrained string/electronic score.", productionNotes: "Prioritize three hero locations and practical light from memory lamps." }, blocks: canon.story.beats.map((beat) => ({ kind: "scene", title: beat.title, body: beat.summary, data: beat })) };
  if (type === "photoshoot") return { ...shared, content: { concept: "Promises become visible after midnight", visualThesis: "Intimate faces against a city of reflected memory light", castLock: canon.characters.map(({ id, name, appearance, wardrobe, anchors }) => ({ id, name, appearance, wardrobe, anchors })), lighting: "Large cool rain-window source, warm practical lamp edges, negative fill for sculpted faces", lensLanguage: ["35mm environmental portraits", "65mm emotional close-ups", "100mm prop details"], frames: canon.story.beats.map((beat, index) => ({ frame: index + 1, title: beat.title, locationId: beat.locationId, direction: beat.summary, continuity: beat.characterIds })), selectsLogic: "Choose one spatial master, one relationship image, one decisive portrait, and one prop detail without breaking wardrobe progression." }, blocks: canon.story.beats.map((beat) => ({ kind: "shot", title: beat.title, body: beat.summary, data: beat })) };
  return { ...shared, content: { opening: canon.story.incitingIncident, state: { evidence: [], trust: 0, clock: 1 }, scenes: canon.story.beats.map((beat) => ({ id: beat.id, title: beat.title, locationId: beat.locationId, setup: beat.summary, turn: beat.turn, choices: [{ label: "Trust the evidence", effect: { trust: 1 } }, { label: "Protect the person", effect: { trust: 2 } }, { label: "Keep an exit open", effect: { clock: 1 } }] })), endings: canon.story.possibleEndings, convergenceRules: ["Choices change trust, evidence, and the final framing", "All branches revisit the master-record choice without erasing earlier consequences"] }, blocks: canon.story.beats.map((beat) => ({ kind: "choice", title: beat.title, body: beat.turn, data: beat })) };
}

function demoScene(canon: WorldCanon, continuing: boolean, choiceLabel = ""): WorldScene & Record<string, unknown> {
  const location = canon.locations[continuing ? 1 : 0] || canon.locations[0]!;
  const first = canon.characters[0]!;
  const second = canon.characters[1] || first;
  const ending = continuing && /publish|leave|end/i.test(choiceLabel);
  return {
    id: makeId("scene"),
    title: continuing ? "The Lamp With Your Name" : "A Parcel That Knows You",
    locationId: location.id,
    narrative: continuing
      ? `${choiceLabel || "Your decision"} carries you below the suspended lamps. The black well reflects a version of the room with one person missing. ${second.name} removes one glove and waits beside the lamp bearing your name.`
      : `Rain draws silver lines down the copper awnings of ${location.name}. The parcel in ${first.name}'s satchel knocks once from the inside, then speaks a childhood nickname no stranger should know. Across the canal, ${second.name} lowers a black archive key.` ,
    dialogue: [
      { speaker: second.name, text: continuing ? "If we open it, the choice becomes yours again." : "Don't deliver that parcel. Not until you know what they took from you.", direction: "controlled, watching for recognition" },
      { speaker: first.name, text: continuing ? "Then show me what I chose to forget." : "You have one minute before I decide you're the trap." },
    ],
    imagePrompt: `${first.appearance}, ${first.wardrobe}; ${second.appearance}, ${second.wardrobe}; inside ${location.description}. ${canon.continuity.visualRules.join(", ")}. Preserve ${[...first.anchors, ...second.anchors, ...location.visualAnchors].join(", ")}.`,
    choices: ending ? [] : [
      { id: "choice_trust", label: "Open the lamp", intent: "Trust Mara enough to witness the memory together", consequenceHint: "You may recover something you once chose to lose." },
      { id: "choice_leverage", label: "Ask for proof", intent: "Demand evidence before touching the memory", consequenceHint: "Caution protects you, but the clock keeps moving." },
      { id: "choice_exit", label: "Keep the parcel", intent: "Hold the only leverage and search for another route", consequenceHint: "Independence may close a door with Mara." },
    ],
    isEnding: ending,
    createdAt: new Date().toISOString(),
    stateEffects: { variables: { lastIntent: choiceLabel || "arrival" }, inventoryAdd: continuing ? ["memory_lamp_fragment"] : ["sealed_parcel"], relationshipDeltas: { [second.id]: /trust|open/i.test(choiceLabel) ? 1 : 0 } },
  };
}

export class DemoModelAdapter implements ModelAdapter {
  readonly id = "demo";

  async generateObject<T extends Record<string, unknown>>(request: ModelRequest): Promise<T> {
    const context = request.context || {};
    if (request.task === "world.create") return demoCanon(context) as unknown as T;
    if (request.task.startsWith("artifact.create.")) {
      const type = request.task.slice("artifact.create.".length) as ArtifactType;
      if (!(ARTIFACT_TYPES as readonly string[]).includes(type)) throw new Error(`Unknown artifact type: ${type}`);
      return demoArtifact(type, context.canon as unknown as WorldCanon) as T;
    }
    if (request.task === "session.start" || request.task === "session.continue") {
      const world = context.world as unknown as WorldProject;
      return demoScene(world.canon, request.task === "session.continue", typeof context.choiceLabel === "string" ? context.choiceLabel : "") as unknown as T;
    }
    if (request.task === "continuity.audit") {
      return {
        approved: true,
        score: 96,
        checks: { identity: "pass", wardrobe_props: "pass", geography_time: "pass", knowledge_causality: "pass", emotional_arc: "pass" },
        conflicts: [],
        strengths: ["Character identity anchors repeat across every asset brief.", "Locations preserve their connections and persistent visual anchors."],
      } as unknown as T;
    }
    throw new Error(`Demo adapter does not support task ${request.task}`);
  }
}

export function createModelAdapterFromEnv(env: NodeJS.ProcessEnv = process.env): ModelAdapter {
  const provider = env.WORLDKIT_MODEL_PROVIDER || (env.WORLDKIT_API_KEY || env.OPENAI_API_KEY ? "openai-compatible" : "demo");
  if (provider === "demo") return new DemoModelAdapter();
  if (provider === "openai-compatible" || provider === "openai") {
    return new OpenAICompatibleAdapter({
      apiKey: env.WORLDKIT_API_KEY || env.OPENAI_API_KEY || "",
      baseUrl: env.WORLDKIT_BASE_URL || env.OPENAI_BASE_URL || "https://api.openai.com/v1",
      model: env.WORLDKIT_MODEL || "gpt-4.1-mini",
    });
  }
  throw new Error(`Unknown WORLDKIT_MODEL_PROVIDER: ${provider}`);
}
