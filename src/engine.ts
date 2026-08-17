import { ARTIFACT_TYPES, WORLD_PROJECT_SCHEMA, type ArtifactType, type AttachAssetInput, type ContinuityAudit, type ContinuityConflict, type CreateWorldInput, type CreativeArtifact, type WorldProject, type WorldSession, type WorldSummary } from "./types.js";
import type { ModelAdapter } from "./model.js";
import type { WorldStore } from "./store.js";
import { buildArtifactPrompt, buildCanonPrompt, buildContinuityPrompt, buildSessionPrompt, PROMPT_VERSION } from "./prompts.js";
import { makeId, nowIso, slugify } from "./ids.js";
import { isArtifactType, isRecord, normalizeArtifact, normalizeCanon, normalizeScene, ValidationError } from "./validation.js";

export interface WorldEngineOptions {
  store: WorldStore;
  model: ModelAdapter;
}

export interface CapabilityManifest {
  schema: string;
  modelAdapter: string;
  artifactTypes: readonly ArtifactType[];
  actions: Array<{ id: string; description: string; needs: string[]; produces: string }>;
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

function clampScore(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : 0;
}

function localContinuityConflicts(world: WorldProject): ContinuityConflict[] {
  const conflicts: ContinuityConflict[] = [];
  const characterIds = new Set(world.canon.characters.map((character) => character.id));
  const locationIds = new Set(world.canon.locations.map((location) => location.id));
  for (const artifact of world.artifacts) {
    for (const brief of artifact.assetPlan) {
      for (const characterId of brief.characterIds) {
        if (!characterIds.has(characterId)) {
          conflicts.push({ severity: "high", scope: `${artifact.id}/${brief.id}`, issue: `Asset brief references unknown character ${characterId}.`, canonFact: "Only canon character ids may appear in asset bindings.", repair: "Replace the id with a canon character id or remove the binding." });
        }
      }
      if (brief.locationId && !locationIds.has(brief.locationId)) {
        conflicts.push({ severity: "high", scope: `${artifact.id}/${brief.id}`, issue: `Asset brief references unknown location ${brief.locationId}.`, canonFact: "Only canon location ids may appear in asset bindings.", repair: "Replace the id with a canon location id or remove the binding." });
      }
      if (brief.kind === "image" && brief.continuityAnchors.length === 0) {
        conflicts.push({ severity: "medium", scope: `${artifact.id}/${brief.id}`, issue: "Visual asset has no explicit continuity anchors.", canonFact: "Visual outputs must restate immutable identity or location anchors.", repair: "Add the relevant canon anchors to continuityAnchors and the prompt." });
      }
    }
  }
  return conflicts;
}

function applyStateEffects(session: WorldSession, value: unknown): void {
  if (!isRecord(value)) return;
  if (isRecord(value.variables)) {
    for (const [key, item] of Object.entries(value.variables)) {
      if (["string", "number", "boolean"].includes(typeof item)) session.variables[key] = item as string | number | boolean;
    }
  }
  if (Array.isArray(value.inventoryAdd)) {
    for (const item of value.inventoryAdd) {
      if (typeof item === "string" && item && !session.inventory.includes(item)) session.inventory.push(item);
    }
  }
  if (isRecord(value.relationshipDeltas)) {
    for (const [key, item] of Object.entries(value.relationshipDeltas)) {
      const delta = Number(item);
      if (Number.isFinite(delta)) session.relationships[key] = (session.relationships[key] || 0) + delta;
    }
  }
}

export class WorldEngine {
  readonly store: WorldStore;
  readonly model: ModelAdapter;

  constructor(options: WorldEngineOptions) {
    this.store = options.store;
    this.model = options.model;
  }

  capabilities(): CapabilityManifest {
    return {
      schema: "agent-world-kit/capabilities@1",
      modelAdapter: this.model.id,
      artifactTypes: ARTIFACT_TYPES,
      actions: [
        { id: "world.create", description: "Turn a seed into a frozen cross-media story-world canon.", needs: [], produces: "world" },
        { id: "artifact.create", description: "Adapt a world into a narrative, game world, storyboard, film treatment, photoshoot, or visual novel.", needs: ["world"], produces: "creative-package" },
        { id: "continuity.audit", description: "Check generated formats and sessions against frozen canon.", needs: ["world"], produces: "continuity-audit" },
        { id: "session.start", description: "Open a playable interactive session inside a world.", needs: ["world"], produces: "scene" },
        { id: "session.choose", description: "Advance the world from a player or agent choice.", needs: ["session", "choice"], produces: "scene" },
        { id: "asset.attach", description: "Bind generated or existing media to a planned asset, block, character, or location.", needs: ["world", "asset-uri"], produces: "asset-reference" },
      ],
    };
  }

  listWorlds(): Promise<WorldSummary[]> {
    return this.store.listWorlds();
  }

  async getWorld(id: string): Promise<WorldProject> {
    const world = await this.store.getWorld(id);
    if (!world) throw new NotFoundError(`World ${id} was not found`);
    return world;
  }

  async createWorld(input: CreateWorldInput): Promise<WorldProject> {
    const brief = input.brief?.trim();
    if (!brief || brief.length < 8) throw new ValidationError("A useful world brief is required", ["brief_too_short"]);
    const requestedTypes = input.artifactTypes ?? [...ARTIFACT_TYPES];
    if (!requestedTypes.every(isArtifactType)) throw new ValidationError("Unknown artifact type", ["artifact_type_invalid"]);

    const generation = buildCanonPrompt(brief, input.title);
    const rawCanon = await this.model.generateObject({
      task: "world.create",
      ...generation,
      temperature: 0.75,
      context: { brief, title: input.title || "" },
    });
    const canon = normalizeCanon(rawCanon, input.title);
    const now = nowIso();
    const world: WorldProject = {
      schema: WORLD_PROJECT_SCHEMA,
      id: makeId("world"),
      title: canon.title,
      seedBrief: brief,
      status: "draft",
      canon,
      artifacts: [],
      assets: [],
      sessions: [],
      audits: [],
      metadata: {
        ...(input.metadata || {}),
        modelAdapter: this.model.id,
        promptVersion: PROMPT_VERSION,
        slug: slugify(canon.title),
      },
      createdAt: now,
      updatedAt: now,
    };
    await this.store.saveWorld(world);

    for (const type of requestedTypes) {
      const artifact = await this.generateArtifact(world, type);
      world.artifacts.push(artifact);
      world.updatedAt = nowIso();
      await this.store.saveWorld(world);
    }
    world.status = "ready";
    world.updatedAt = nowIso();
    await this.store.saveWorld(world);
    return world;
  }

  private async generateArtifact(world: WorldProject, type: ArtifactType): Promise<CreativeArtifact> {
    const generation = buildArtifactPrompt(world.canon, type);
    const raw = await this.model.generateObject({
      task: `artifact.create.${type}`,
      ...generation,
      temperature: type === "storyboard" ? 0.55 : 0.72,
      context: { canon: world.canon, worldId: world.id, type },
    });
    return normalizeArtifact(raw, world.id, type);
  }

  async createArtifact(worldId: string, type: ArtifactType): Promise<CreativeArtifact> {
    if (!isArtifactType(type)) throw new ValidationError("Unknown artifact type", ["artifact_type_invalid"]);
    const world = await this.getWorld(worldId);
    const artifact = await this.generateArtifact(world, type);
    world.artifacts = world.artifacts.filter((item) => item.type !== type);
    world.artifacts.push(artifact);
    world.updatedAt = nowIso();
    await this.store.saveWorld(world);
    return artifact;
  }

  async auditWorld(worldId: string): Promise<ContinuityAudit> {
    const world = await this.getWorld(worldId);
    const localConflicts = localContinuityConflicts(world);
    const generation = buildContinuityPrompt(world);
    const raw = await this.model.generateObject({
      task: "continuity.audit",
      ...generation,
      temperature: 0.2,
      context: { world },
    });
    const rawConflicts = Array.isArray(raw.conflicts) ? raw.conflicts : [];
    const modelConflicts: ContinuityConflict[] = rawConflicts.map((item) => {
      const conflict = isRecord(item) ? item : {};
      const severity = conflict.severity === "high" || conflict.severity === "medium" ? conflict.severity : "low";
      return {
        severity,
        scope: typeof conflict.scope === "string" ? conflict.scope : "world",
        issue: typeof conflict.issue === "string" ? conflict.issue : "Unspecified continuity issue",
        canonFact: typeof conflict.canonFact === "string" ? conflict.canonFact : typeof conflict.canon_fact === "string" ? conflict.canon_fact : "See frozen canon",
        repair: typeof conflict.repair === "string" ? conflict.repair : "Apply the smallest canon-preserving correction.",
      };
    });
    const conflicts = [...localConflicts, ...modelConflicts];
    const rawChecks = isRecord(raw.checks) ? raw.checks : {};
    const checks = Object.fromEntries(Object.entries(rawChecks).map(([key, value]) => [key, value === "pass" ? "pass" : "fail"])) as Record<string, "pass" | "fail">;
    const audit: ContinuityAudit = {
      id: makeId("audit"),
      score: Math.max(0, clampScore(raw.score) - localConflicts.length * 5),
      approved: raw.approved === true && conflicts.every((conflict) => conflict.severity !== "high"),
      checks,
      conflicts,
      strengths: Array.isArray(raw.strengths) ? raw.strengths.filter((value): value is string => typeof value === "string") : [],
      createdAt: nowIso(),
    };
    world.audits.push(audit);
    world.updatedAt = nowIso();
    await this.store.saveWorld(world);
    return audit;
  }

  async startSession(worldId: string, title?: string): Promise<WorldSession> {
    const world = await this.getWorld(worldId);
    const generation = buildSessionPrompt(world);
    const raw = await this.model.generateObject({
      task: "session.start",
      ...generation,
      temperature: 0.78,
      context: { world },
    });
    const scene = normalizeScene(raw, world.canon);
    const now = nowIso();
    const session: WorldSession = {
      id: makeId("session"),
      worldId,
      title: title?.trim() || `${world.title} — Playthrough ${world.sessions.length + 1}`,
      status: scene.isEnding ? "completed" : "active",
      currentSceneId: scene.id,
      scenes: [scene],
      history: [],
      variables: {},
      inventory: [],
      relationships: {},
      createdAt: now,
      updatedAt: now,
    };
    applyStateEffects(session, raw.stateEffects ?? raw.state_effects);
    world.sessions.push(session);
    world.updatedAt = now;
    await this.store.saveWorld(world);
    return session;
  }

  async choose(worldId: string, sessionId: string, choiceId: string): Promise<WorldSession> {
    const world = await this.getWorld(worldId);
    const session = world.sessions.find((item) => item.id === sessionId);
    if (!session) throw new NotFoundError(`Session ${sessionId} was not found`);
    if (session.status === "completed") throw new ValidationError("This session has ended", ["session_completed"]);
    const current = session.scenes.find((scene) => scene.id === session.currentSceneId);
    if (!current) throw new ValidationError("Session current scene is missing", ["current_scene_missing"]);
    const choice = current.choices.find((item) => item.id === choiceId);
    if (!choice) throw new ValidationError(`Choice ${choiceId} is not available`, ["choice_invalid"]);

    const generation = buildSessionPrompt(world, current as unknown as Record<string, unknown>, choice);
    const raw = await this.model.generateObject({
      task: "session.continue",
      ...generation,
      temperature: 0.78,
      context: { world, session, previousScene: current, choice, choiceLabel: choice.label },
    });
    const next = normalizeScene(raw, world.canon);
    session.history.push({ sceneId: current.id, choiceId: choice.id, choiceLabel: choice.label, at: nowIso() });
    session.scenes.push(next);
    session.currentSceneId = next.id;
    session.status = next.isEnding ? "completed" : "active";
    session.updatedAt = nowIso();
    applyStateEffects(session, raw.stateEffects ?? raw.state_effects);
    world.updatedAt = session.updatedAt;
    await this.store.saveWorld(world);
    return session;
  }

  async attachAsset(worldId: string, input: AttachAssetInput) {
    const world = await this.getWorld(worldId);
    if (!input.uri?.trim()) throw new ValidationError("Asset URI is required", ["asset_uri_missing"]);
    const asset = {
      id: makeId("asset"),
      ...(input.briefId ? { briefId: input.briefId } : {}),
      kind: input.kind,
      title: input.title?.trim() || "Untitled asset",
      uri: input.uri.trim(),
      ...(input.mimeType ? { mimeType: input.mimeType } : {}),
      alt: input.alt?.trim() || input.title?.trim() || "Creative world asset",
      characterIds: input.characterIds || [],
      ...(input.locationId ? { locationId: input.locationId } : {}),
      ...(input.targetBlockId ? { targetBlockId: input.targetBlockId } : {}),
      metadata: input.metadata || {},
      createdAt: nowIso(),
    };
    world.assets.push(asset);
    if (input.briefId) {
      for (const artifact of world.artifacts) {
        const brief = artifact.assetPlan.find((item) => item.id === input.briefId);
        if (brief) brief.status = "attached";
      }
    }
    if (input.targetBlockId) {
      for (const artifact of world.artifacts) {
        const block = artifact.blocks.find((item) => item.id === input.targetBlockId);
        if (block && !block.assetIds.includes(asset.id)) block.assetIds.push(asset.id);
      }
    }
    world.updatedAt = nowIso();
    await this.store.saveWorld(world);
    return asset;
  }
}
