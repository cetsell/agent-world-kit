import type { ArtifactType, WorldCanon, WorldChoice, WorldProject } from "./types.js";

export const PROMPT_VERSION = "2026-08-17.1";

const JSON_RULES = [
  "Return exactly one valid JSON object with no markdown or commentary.",
  "Treat the supplied canon as frozen. Do not rename characters, locations, props, or established facts.",
  "Use the supplied character and location ids whenever a contract asks for ids.",
  "Prefer specific playable or filmable action over abstract mood language.",
  "Every visual prompt must restate the relevant identity, wardrobe, prop, geography, lighting, and style anchors.",
].join("\n");

export const CANON_CONTRACT = {
  title: "evocative title",
  logline: "one sentence premise, protagonist, pressure, stakes",
  genre: "primary genre",
  tone: ["two to four tonal adjectives"],
  themes: ["two to four thematic tensions"],
  audience: "intended audience and content boundary",
  rules: ["rules that make this world internally coherent"],
  characters: [{
    id: "character_slug",
    name: "name",
    role: "dramatic function",
    goal: "concrete want",
    conflict: "inner or external pressure",
    voice: "speech rhythm, vocabulary, restraint",
    appearance: "stable visible identity",
    wardrobe: "signature base look and allowed progression",
    anchors: ["immutable identity anchors"],
  }],
  locations: [{
    id: "location_slug",
    name: "name",
    description: "spatially clear description",
    mood: "sensory atmosphere",
    visualAnchors: ["three persistent visible anchors"],
    connections: ["ids of reachable locations"],
  }],
  story: {
    premise: "expanded premise",
    incitingIncident: "event that breaks equilibrium",
    centralConflict: "sustained dramatic engine",
    beats: [{
      id: "beat_1",
      title: "beat title",
      summary: "what happens",
      turn: "what changes",
      locationId: "location id",
      characterIds: ["character id"],
    }],
    possibleEndings: ["at least two causally distinct endings"],
  },
  continuity: {
    visualRules: ["palette, texture, lens, period, and motif rules"],
    wardrobe: { character_id: "locked base look and explicit progression" },
    props: ["prop ownership and state"],
    geography: ["spatial rules that cannot change between scenes"],
    timeline: ["ordered time and knowledge constraints"],
  },
};

const ARTIFACT_GUIDANCE: Record<ArtifactType, string> = {
  narrative: "Write a readable narrative treatment with a beginning, escalation, climax, resolution, chapter summaries, and character arcs.",
  game_world: "Design a playable world package: player fantasy, core loop, spatial zones, traversal, quests, NPC roles, rules, systems, failure states, and runtime hooks.",
  storyboard: "Create a shot-by-shot storyboard. Each shot needs story beat, composition, camera/lens/movement, action, dialogue, transition, duration, image prompt, and continuity anchors.",
  film_treatment: "Write a professional film treatment: logline, synopsis, act structure, character arcs, visual language, sound direction, set pieces, audience, format, and production notes.",
  photoshoot: "Create a consistent editorial photoshoot plan: concept, visual thesis, cast lock, wardrobe progression, locations, lighting diagrams in prose, lens language, pose/action direction, frame list, selects logic, and reusable prompts.",
  visual_novel: "Create a playable visual-novel package with scene progression, concise dialogue, expression/pose direction, meaningful choices, state effects, convergence rules, and multiple earned endings.",
};

export function buildCanonPrompt(brief: string, title?: string): { system: string; prompt: string; schema: Record<string, unknown> } {
  return {
    system: `You are the lead worldbuilder, narrative designer, and script supervisor for an agent-run creative studio.\n${JSON_RULES}`,
    prompt: JSON.stringify({
      task: "Turn the seed into one production-ready story-world canon that can be adapted across media.",
      seedBrief: brief,
      titleHint: title || null,
      requirements: [
        "2-5 memorable characters",
        "2-6 connected locations",
        "5-8 causal story beats",
        "at least two possible endings",
        "specific continuity locks for identities, wardrobe, props, geography, chronology, and knowledge",
      ],
      outputContract: CANON_CONTRACT,
    }),
    schema: CANON_CONTRACT,
  };
}

export function buildArtifactPrompt(canon: WorldCanon, type: ArtifactType): { system: string; prompt: string; schema: Record<string, unknown> } {
  const contract = {
    title: "package title",
    summary: "two sentence summary",
    content: { formatSpecific: "complete structured package described by the direction" },
    blocks: [{ kind: "story|scene|shot|choice|quest|package", title: "renderable block title", body: "human-readable content", data: {} }],
    assetPlan: [{
      id: "stable brief id",
      kind: "image|video|audio|music|model3d",
      title: "asset title",
      prompt: "self-contained generation prompt with continuity locks",
      negativePrompt: "only concrete failure modes to avoid",
      characterIds: ["canon character id"],
      locationId: "canon location id or omitted",
      continuityAnchors: ["specific immutable details"],
      targetBlockId: "block id or omitted",
    }],
  };
  return {
    system: `You are a senior creative producer adapting a frozen story-world canon into a ${type.replaceAll("_", " ")} package.\n${JSON_RULES}`,
    prompt: JSON.stringify({
      direction: ARTIFACT_GUIDANCE[type],
      frozenCanon: canon,
      requirements: [
        "The content object must be useful without reading this prompt.",
        "Blocks are the ordered, renderable units a UI or agent can inspect.",
        "The asset plan covers the smallest coherent set of visual, video, sound, music, or 3D assets needed by this format.",
        "Prompts are vendor-neutral and can be passed to a separate media model.",
      ],
      outputContract: contract,
    }),
    schema: contract,
  };
}

export function buildSessionPrompt(
  world: WorldProject,
  previousScene?: Record<string, unknown>,
  choice?: WorldChoice,
): { system: string; prompt: string; schema: Record<string, unknown> } {
  const contract = {
    id: "scene id",
    title: "scene title",
    locationId: "canon location id",
    narrative: "2-4 short paragraphs in present tense",
    dialogue: [{ speaker: "canon character name", text: "speakable line", direction: "optional compact performance direction" }],
    imagePrompt: "self-contained cinematic scene prompt with continuity anchors",
    choices: [{ id: "choice id", label: "2-7 word player-facing label", intent: "what the player attempts", consequenceHint: "honest but non-spoilery stakes" }],
    isEnding: false,
    stateEffects: { variables: {}, inventoryAdd: [], relationshipDeltas: {} },
  };
  return {
    system: `You are the live director of an interactive story world. Continue causally from player choices while respecting canon and accumulated state.\n${JSON_RULES}`,
    prompt: JSON.stringify({
      frozenCanon: world.canon,
      currentState: previousScene ? {
        previousScene,
        selectedChoice: choice || null,
        sessions: world.sessions.map((session) => ({ id: session.id, history: session.history, variables: session.variables, inventory: session.inventory, relationships: session.relationships })).slice(-1),
      } : null,
      direction: previousScene
        ? "Advance one consequential scene. Honor the selected intent; do not negate it. End after 6-12 turns or when an ending is earned."
        : "Open at the inciting incident with immediate agency and a concrete sensory situation.",
      requirements: [
        "Use 2-4 genuinely different choices unless this is an earned ending.",
        "Choices must express intent, not merely tone variants of the same action.",
        "Do not invent a new major character or location unless the canon explicitly leaves room for it.",
      ],
      outputContract: contract,
    }),
    schema: contract,
  };
}

export function buildContinuityPrompt(world: WorldProject): { system: string; prompt: string; schema: Record<string, unknown> } {
  const contract = {
    approved: true,
    score: 100,
    checks: { identity: "pass", wardrobe_props: "pass", geography_time: "pass", knowledge_causality: "pass", emotional_arc: "pass" },
    conflicts: [{ severity: "low|medium|high", scope: "artifact or scene id", issue: "specific contradiction", canonFact: "the locked fact", repair: "smallest repair" }],
    strengths: ["specific continuity strength"],
  };
  return {
    system: `You are a strict script supervisor. Distinguish valid format compression from contradictions. Report problems; do not rewrite the world.\n${JSON_RULES}`,
    prompt: JSON.stringify({
      frozenCanon: world.canon,
      adaptations: world.artifacts.map(({ id, type, title, summary, content, assetPlan }) => ({ id, type, title, summary, content, assetPlan })),
      sessions: world.sessions,
      outputContract: contract,
    }),
    schema: contract,
  };
}
