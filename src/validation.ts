import {
  ARTIFACT_TYPES,
  CREATIVE_PACKAGE_SCHEMA,
  WORLD_PROJECT_SCHEMA,
  type ArtifactType,
  type CreativeArtifact,
  type WorldCanon,
  type WorldCharacter,
  type WorldLocation,
  type WorldProject,
  type WorldScene,
} from "./types.js";
import { makeId, nowIso, slugify } from "./ids.js";

export class ValidationError extends Error {
  readonly issues: string[];

  constructor(message: string, issues: string[]) {
    super(message);
    this.name = "ValidationError";
    this.issues = issues;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function texts(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => text(item)).filter(Boolean) : [];
}

function recordOfStrings(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [key, text(item)] as const)
      .filter(([, item]) => Boolean(item)),
  );
}

function normalizeCharacter(value: unknown, index: number): WorldCharacter {
  const source = isRecord(value) ? value : {};
  const name = text(source.name, `Character ${index + 1}`);
  return {
    id: text(source.id, `character_${slugify(name)}`),
    name,
    role: text(source.role, "Supporting character"),
    goal: text(source.goal, "Pursue a meaningful change"),
    conflict: text(source.conflict, "Something important stands in the way"),
    voice: text(source.voice, "Distinct, natural, and concise"),
    appearance: text(source.appearance, "Visually distinctive and easy to recognize"),
    wardrobe: text(source.wardrobe, "A consistent signature look"),
    anchors: texts(source.anchors),
  };
}

function normalizeLocation(value: unknown, index: number): WorldLocation {
  const source = isRecord(value) ? value : {};
  const name = text(source.name, `Location ${index + 1}`);
  return {
    id: text(source.id, `location_${slugify(name)}`),
    name,
    description: text(source.description, "A story-rich place"),
    mood: text(source.mood, "Atmospheric"),
    visualAnchors: texts(source.visualAnchors ?? source.visual_anchors),
    connections: texts(source.connections),
  };
}

export function normalizeCanon(value: unknown, titleHint = "Untitled World"): WorldCanon {
  if (!isRecord(value)) throw new ValidationError("World canon must be an object", ["canon_not_object"]);

  const rawStory = isRecord(value.story) ? value.story : {};
  const characters = Array.isArray(value.characters)
    ? value.characters.map(normalizeCharacter)
    : [];
  const locations = Array.isArray(value.locations)
    ? value.locations.map(normalizeLocation)
    : [];
  const rawBeats = Array.isArray(rawStory.beats) ? rawStory.beats : [];
  const beats = rawBeats.map((item, index) => {
    const beat = isRecord(item) ? item : {};
    return {
      id: text(beat.id, `beat_${index + 1}`),
      title: text(beat.title, `Beat ${index + 1}`),
      summary: text(beat.summary, "The situation changes."),
      turn: text(beat.turn, "A new consequence becomes unavoidable."),
      locationId: text(beat.locationId ?? beat.location_id, locations[0]?.id ?? "location_unknown"),
      characterIds: texts(beat.characterIds ?? beat.character_ids),
    };
  });
  const rawContinuity = isRecord(value.continuity) ? value.continuity : {};

  const canon: WorldCanon = {
    title: text(value.title, titleHint),
    logline: text(value.logline, "A character must make a consequential choice in a vivid world."),
    genre: text(value.genre, "Speculative fiction"),
    tone: texts(value.tone),
    themes: texts(value.themes),
    audience: text(value.audience, "General audiences"),
    rules: texts(value.rules),
    characters,
    locations,
    story: {
      premise: text(rawStory.premise, text(value.logline)),
      incitingIncident: text(rawStory.incitingIncident ?? rawStory.inciting_incident, "An unexpected arrival changes the status quo."),
      centralConflict: text(rawStory.centralConflict ?? rawStory.central_conflict, "The protagonist must choose between safety and change."),
      beats,
      possibleEndings: texts(rawStory.possibleEndings ?? rawStory.possible_endings),
    },
    continuity: {
      visualRules: texts(rawContinuity.visualRules ?? rawContinuity.visual_rules),
      wardrobe: recordOfStrings(rawContinuity.wardrobe),
      props: texts(rawContinuity.props),
      geography: texts(rawContinuity.geography),
      timeline: texts(rawContinuity.timeline),
    },
  };

  const issues: string[] = [];
  if (canon.characters.length === 0) issues.push("canon needs at least one character");
  if (canon.locations.length === 0) issues.push("canon needs at least one location");
  if (canon.story.beats.length < 3) issues.push("canon needs at least three story beats");
  if (issues.length) throw new ValidationError("Generated canon is incomplete", issues);
  return canon;
}

export function normalizeArtifact(
  value: unknown,
  worldId: string,
  type: ArtifactType,
): CreativeArtifact {
  if (!isRecord(value)) throw new ValidationError("Artifact must be an object", ["artifact_not_object"]);
  const now = nowIso();
  const content = isRecord(value.content) ? value.content : value;
  const rawBlocks = Array.isArray(value.blocks) ? value.blocks : [];
  const rawPlan = Array.isArray(value.assetPlan ?? value.asset_plan) ? (value.assetPlan ?? value.asset_plan) as unknown[] : [];

  return {
    schema: CREATIVE_PACKAGE_SCHEMA,
    id: text(value.id, makeId(type)),
    worldId,
    type,
    title: text(value.title, type.replaceAll("_", " ")),
    summary: text(value.summary, "A generated creative package."),
    status: "ready",
    content,
    blocks: rawBlocks.map((item, index) => {
      const block = isRecord(item) ? item : {};
      return {
        id: text(block.id, makeId("block")),
        kind: (text(block.kind, "package") as CreativeArtifact["blocks"][number]["kind"]),
        title: text(block.title, `Block ${index + 1}`),
        body: text(block.body),
        status: "ready" as const,
        data: isRecord(block.data) ? block.data : {},
        assetIds: texts(block.assetIds ?? block.asset_ids),
        createdAt: now,
      };
    }),
    assetPlan: rawPlan.map((item, index) => {
      const brief = isRecord(item) ? item : {};
      const kind = text(brief.kind, "image");
      return {
        id: text(brief.id, makeId("asset_brief")),
        kind: (["image", "video", "audio", "music", "model3d"].includes(kind) ? kind : "image") as CreativeArtifact["assetPlan"][number]["kind"],
        title: text(brief.title, `Asset ${index + 1}`),
        prompt: text(brief.prompt, "Create a canon-consistent supporting asset."),
        ...(text(brief.negativePrompt ?? brief.negative_prompt) ? { negativePrompt: text(brief.negativePrompt ?? brief.negative_prompt) } : {}),
        characterIds: texts(brief.characterIds ?? brief.character_ids),
        ...(text(brief.locationId ?? brief.location_id) ? { locationId: text(brief.locationId ?? brief.location_id) } : {}),
        continuityAnchors: texts(brief.continuityAnchors ?? brief.continuity_anchors),
        ...(text(brief.targetBlockId ?? brief.target_block_id) ? { targetBlockId: text(brief.targetBlockId ?? brief.target_block_id) } : {}),
        status: "planned" as const,
      };
    }),
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeScene(value: unknown, canon: WorldCanon): WorldScene {
  if (!isRecord(value)) throw new ValidationError("Scene must be an object", ["scene_not_object"]);
  const rawDialogue = Array.isArray(value.dialogue) ? value.dialogue : [];
  const rawChoices = Array.isArray(value.choices) ? value.choices : [];
  const isEnding = value.isEnding === true || value.is_ending === true;
  const choices = rawChoices.map((item, index) => {
    const choice = isRecord(item) ? item : {};
    return {
      id: text(choice.id, `choice_${index + 1}`),
      label: text(choice.label, `Choice ${index + 1}`),
      intent: text(choice.intent, text(choice.label, "Act")),
      consequenceHint: text(choice.consequenceHint ?? choice.consequence_hint, "The world will remember this."),
    };
  });
  if (!isEnding && choices.length < 2) {
    throw new ValidationError("A playable scene needs at least two choices", ["scene_choices_missing"]);
  }
  return {
    id: text(value.id, makeId("scene")),
    title: text(value.title, "A new scene"),
    locationId: text(value.locationId ?? value.location_id, canon.locations[0]?.id ?? "location_unknown"),
    narrative: text(value.narrative, "The world holds its breath."),
    dialogue: rawDialogue.map((item) => {
      const line = isRecord(item) ? item : {};
      return {
        speaker: text(line.speaker, "Narrator"),
        text: text(line.text),
        ...(text(line.direction) ? { direction: text(line.direction) } : {}),
      };
    }),
    imagePrompt: text(value.imagePrompt ?? value.image_prompt, "A cinematic establishing shot consistent with the world canon."),
    choices: isEnding ? [] : choices,
    isEnding,
    createdAt: nowIso(),
  };
}

export function validateProject(value: unknown): asserts value is WorldProject {
  if (!isRecord(value) || value.schema !== WORLD_PROJECT_SCHEMA) {
    throw new ValidationError("Invalid world project", ["project_schema_invalid"]);
  }
  if (!text(value.id) || !isRecord(value.canon) || !Array.isArray(value.artifacts)) {
    throw new ValidationError("Invalid world project", ["project_shape_invalid"]);
  }
}

export function isArtifactType(value: unknown): value is ArtifactType {
  return typeof value === "string" && (ARTIFACT_TYPES as readonly string[]).includes(value);
}
