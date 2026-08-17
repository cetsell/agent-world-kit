export const WORLD_PROJECT_SCHEMA = "agent-world-kit/world-project@1" as const;
export const CREATIVE_PACKAGE_SCHEMA = "agent-world-kit/creative-package@1" as const;

export const ARTIFACT_TYPES = [
  "narrative",
  "game_world",
  "storyboard",
  "film_treatment",
  "photoshoot",
  "visual_novel",
] as const;

export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

export type BlockKind =
  | "concept"
  | "canon"
  | "character"
  | "location"
  | "story"
  | "scene"
  | "shot"
  | "choice"
  | "quest"
  | "asset"
  | "package";

export interface CreativeBlock {
  id: string;
  kind: BlockKind;
  title: string;
  body: string;
  status: "draft" | "ready" | "failed";
  data: Record<string, unknown>;
  assetIds: string[];
  createdAt: string;
}

export interface WorldCharacter {
  id: string;
  name: string;
  role: string;
  goal: string;
  conflict: string;
  voice: string;
  appearance: string;
  wardrobe: string;
  anchors: string[];
}

export interface WorldLocation {
  id: string;
  name: string;
  description: string;
  mood: string;
  visualAnchors: string[];
  connections: string[];
}

export interface StoryBeat {
  id: string;
  title: string;
  summary: string;
  turn: string;
  locationId: string;
  characterIds: string[];
}

export interface WorldCanon {
  title: string;
  logline: string;
  genre: string;
  tone: string[];
  themes: string[];
  audience: string;
  rules: string[];
  characters: WorldCharacter[];
  locations: WorldLocation[];
  story: {
    premise: string;
    incitingIncident: string;
    centralConflict: string;
    beats: StoryBeat[];
    possibleEndings: string[];
  };
  continuity: {
    visualRules: string[];
    wardrobe: Record<string, string>;
    props: string[];
    geography: string[];
    timeline: string[];
  };
}

export interface AssetBrief {
  id: string;
  kind: "image" | "video" | "audio" | "music" | "model3d";
  title: string;
  prompt: string;
  negativePrompt?: string;
  characterIds: string[];
  locationId?: string;
  continuityAnchors: string[];
  targetBlockId?: string;
  status: "planned" | "attached";
}

export interface AssetReference {
  id: string;
  briefId?: string;
  kind: AssetBrief["kind"];
  title: string;
  uri: string;
  mimeType?: string;
  alt: string;
  characterIds: string[];
  locationId?: string;
  targetBlockId?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface CreativeArtifact {
  schema: typeof CREATIVE_PACKAGE_SCHEMA;
  id: string;
  worldId: string;
  type: ArtifactType;
  title: string;
  summary: string;
  status: "draft" | "ready";
  content: Record<string, unknown>;
  blocks: CreativeBlock[];
  assetPlan: AssetBrief[];
  createdAt: string;
  updatedAt: string;
}

export interface DialogueLine {
  speaker: string;
  text: string;
  direction?: string;
}

export interface WorldChoice {
  id: string;
  label: string;
  intent: string;
  consequenceHint: string;
}

export interface WorldScene {
  id: string;
  title: string;
  locationId: string;
  narrative: string;
  dialogue: DialogueLine[];
  imagePrompt: string;
  choices: WorldChoice[];
  isEnding: boolean;
  createdAt: string;
}

export interface SessionHistoryEntry {
  sceneId: string;
  choiceId: string;
  choiceLabel: string;
  at: string;
}

export interface WorldSession {
  id: string;
  worldId: string;
  title: string;
  status: "active" | "completed";
  currentSceneId: string;
  scenes: WorldScene[];
  history: SessionHistoryEntry[];
  variables: Record<string, string | number | boolean>;
  inventory: string[];
  relationships: Record<string, number>;
  createdAt: string;
  updatedAt: string;
}

export interface ContinuityConflict {
  severity: "low" | "medium" | "high";
  scope: string;
  issue: string;
  canonFact: string;
  repair: string;
}

export interface ContinuityAudit {
  id: string;
  score: number;
  approved: boolean;
  checks: Record<string, "pass" | "fail">;
  conflicts: ContinuityConflict[];
  strengths: string[];
  createdAt: string;
}

export interface WorldProject {
  schema: typeof WORLD_PROJECT_SCHEMA;
  id: string;
  title: string;
  seedBrief: string;
  status: "draft" | "ready";
  canon: WorldCanon;
  artifacts: CreativeArtifact[];
  assets: AssetReference[];
  sessions: WorldSession[];
  audits: ContinuityAudit[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorldInput {
  brief: string;
  title?: string;
  artifactTypes?: ArtifactType[];
  metadata?: Record<string, unknown>;
}

export interface AttachAssetInput {
  briefId?: string;
  kind: AssetReference["kind"];
  title: string;
  uri: string;
  mimeType?: string;
  alt?: string;
  characterIds?: string[];
  locationId?: string;
  targetBlockId?: string;
  metadata?: Record<string, unknown>;
}

export interface WorldSummary {
  id: string;
  title: string;
  logline: string;
  genre: string;
  artifactTypes: ArtifactType[];
  sessions: number;
  updatedAt: string;
}
