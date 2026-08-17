import type { Action, ActionResult, HandlerCallback, IAgentRuntime, Memory, Plugin, Provider, State } from "@elizaos/core";

interface WorldSummary {
  id: string;
  title: string;
  logline: string;
  genre: string;
}

interface Choice {
  id: string;
  label: string;
  consequenceHint: string;
}

interface Scene {
  id: string;
  title: string;
  narrative: string;
  dialogue: Array<{ speaker: string; text: string }>;
  choices: Choice[];
  isEnding: boolean;
}

interface Session {
  id: string;
  worldId: string;
  currentSceneId: string;
  scenes: Scene[];
  status: "active" | "completed";
}

interface World {
  id: string;
  title: string;
  canon: { logline: string };
  sessions: Session[];
}

interface ActiveSession {
  worldId: string;
  sessionId: string;
}

const SESSION_CACHE_PREFIX = "agent-world-kit:active-session";

function baseUrl(runtime: IAgentRuntime): string {
  const configured = runtime.getSetting("WORLDKIT_URL");
  return (typeof configured === "string" && configured ? configured : process.env.WORLDKIT_URL || "http://127.0.0.1:4317").replace(/\/$/, "");
}

function actorKey(message: Memory): string {
  return String(message.entityId || message.roomId);
}

function sessionCacheKey(runtime: IAgentRuntime, message: Memory): string {
  return `${SESSION_CACHE_PREFIX}:${runtime.agentId}:${actorKey(message)}`;
}

function isActiveSession(value: unknown): value is ActiveSession {
  return Boolean(
    value
      && typeof value === "object"
      && "worldId" in value
      && "sessionId" in value
      && typeof value.worldId === "string"
      && typeof value.sessionId === "string",
  );
}

async function getActiveSession(runtime: IAgentRuntime, message: Memory): Promise<ActiveSession | null> {
  const value = await runtime.getCache<unknown>(sessionCacheKey(runtime, message));
  return isActiveSession(value) ? value : null;
}

async function setActiveSession(runtime: IAgentRuntime, message: Memory, session: ActiveSession): Promise<void> {
  await runtime.setCache(sessionCacheKey(runtime, message), session);
}

async function clearActiveSession(runtime: IAgentRuntime, message: Memory): Promise<void> {
  await runtime.deleteCache(sessionCacheKey(runtime, message));
}

async function request<T>(runtime: IAgentRuntime, path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${baseUrl(runtime)}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const payload = await response.json() as T & { message?: string };
  if (!response.ok) throw new Error(payload.message || `World Kit request failed (${response.status})`);
  return payload;
}

function sceneText(worldTitle: string, scene: Scene): string {
  const dialogue = scene.dialogue.map((line) => `${line.speaker}: “${line.text}”`).join("\n");
  const choices = scene.choices.map((choice, index) => `${index + 1}. ${choice.label} — ${choice.consequenceHint} [${choice.id}]`).join("\n");
  return [`**${worldTitle} — ${scene.title}**`, scene.narrative, dialogue, choices ? `Choices:\n${choices}` : "The story has reached an ending."].filter(Boolean).join("\n\n");
}

async function respond(callback: HandlerCallback | undefined, result: ActionResult): Promise<ActionResult> {
  if (callback && result.text) await callback({ text: result.text, actions: [], source: "agent-world-kit" });
  return result;
}

const createWorld: Action = {
  name: "CREATE_STORY_WORLD",
  similes: ["BUILD_WORLD", "MAKE_STORY", "CREATE_GAME_WORLD", "GENERATE_STORYBOARD"],
  description: "Create a complete interactive world with canon, narrative, game-world, storyboard, film-treatment, photoshoot, and visual-novel packages.",
  examples: [[{ name: "user", content: { text: "Create a cozy mystery world in a floating botanical station." } }]],
  validate: async (_runtime, message) => Boolean(message.content.text?.trim()),
  handler: async (runtime, message, _state, _options, callback) => {
    try {
      const brief = message.content.text?.trim() || "";
      const world = await request<World>(runtime, "/api/worlds", { method: "POST", body: JSON.stringify({ brief }) });
      return respond(callback, { success: true, text: `Created **${world.title}**. ${world.canon.logline}\n\nWorld id: ${world.id}\nOpen the studio at ${baseUrl(runtime)} or ask me to enter the world.`, data: { worldId: world.id, world } });
    } catch (error) {
      return respond(callback, { success: false, text: `I couldn't create the world: ${error instanceof Error ? error.message : String(error)}`, error: error as Error });
    }
  },
};

const listWorlds: Action = {
  name: "LIST_STORY_WORLDS",
  similes: ["SHOW_WORLDS", "MY_WORLDS", "WORLD_LIBRARY"],
  description: "List the interactive worlds available in Agent World Kit.",
  examples: [[{ name: "user", content: { text: "Show me the worlds we can play." } }]],
  validate: async () => true,
  handler: async (runtime, _message, _state, _options, callback) => {
    try {
      const payload = await request<{ worlds: WorldSummary[] }>(runtime, "/api/worlds");
      const text = payload.worlds.length
        ? payload.worlds.map((world) => `- **${world.title}** (${world.genre}) — ${world.logline}\n  id: ${world.id}`).join("\n")
        : "There are no worlds yet. Ask me to create one.";
      return respond(callback, { success: true, text, data: { worlds: payload.worlds } });
    } catch (error) {
      return respond(callback, { success: false, text: `I couldn't read the world library: ${error instanceof Error ? error.message : String(error)}`, error: error as Error });
    }
  },
};

function idFromText(text: string, prefix: string): string | null {
  return text.match(new RegExp(`${prefix}_[a-zA-Z0-9]+`))?.[0] || null;
}

const enterWorld: Action = {
  name: "ENTER_STORY_WORLD",
  similes: ["PLAY_WORLD", "START_STORY", "ENTER_WORLD", "RUN_WORLD"],
  description: "Start a persistent playable session in a generated story world.",
  examples: [[{ name: "user", content: { text: "Enter world_123 and begin the story." } }]],
  validate: async () => true,
  handler: async (runtime, message, _state, _options, callback) => {
    try {
      const text = message.content.text || "";
      let worldId = idFromText(text, "world");
      if (!worldId) {
        const payload = await request<{ worlds: WorldSummary[] }>(runtime, "/api/worlds");
        worldId = payload.worlds[0]?.id || null;
      }
      if (!worldId) return respond(callback, { success: false, text: "There isn't a world to enter yet. Ask me to create one first.", error: "world_missing" });
      const world = await request<World>(runtime, `/api/worlds/${worldId}`);
      const session = await request<Session>(runtime, `/api/worlds/${worldId}/sessions`, { method: "POST", body: "{}" });
      await setActiveSession(runtime, message, { worldId, sessionId: session.id });
      const scene = session.scenes.find((item) => item.id === session.currentSceneId)!;
      return respond(callback, { success: true, text: sceneText(world.title, scene), data: { worldId, sessionId: session.id, scene } });
    } catch (error) {
      return respond(callback, { success: false, text: `I couldn't enter the world: ${error instanceof Error ? error.message : String(error)}`, error: error as Error });
    }
  },
};

const chooseInWorld: Action = {
  name: "CHOOSE_IN_STORY_WORLD",
  similes: ["MAKE_STORY_CHOICE", "CONTINUE_WORLD", "TAKE_ACTION_IN_WORLD"],
  description: "Choose an available action in the current Agent World Kit session and advance the world.",
  examples: [[{ name: "user", content: { text: "Choose Open the lamp." } }]],
  validate: async (runtime, message) => Boolean(await getActiveSession(runtime, message)),
  handler: async (runtime, message, _state, _options, callback) => {
    try {
      const active = await getActiveSession(runtime, message);
      if (!active) return respond(callback, { success: false, text: "Start or enter a world before making a choice.", error: "session_missing" });
      const world = await request<World>(runtime, `/api/worlds/${active.worldId}`);
      const session = world.sessions.find((item) => item.id === active.sessionId);
      const scene = session?.scenes.find((item) => item.id === session.currentSceneId);
      if (!session || !scene) throw new Error("The active session could not be found");
      const text = (message.content.text || "").toLowerCase();
      const explicitId = idFromText(text, "choice");
      const choice = scene.choices.find((item) => item.id === explicitId)
        || scene.choices.find((item) => text.includes(item.label.toLowerCase()))
        || scene.choices.find((_, index) => text.includes(String(index + 1)));
      if (!choice) {
        return respond(callback, { success: false, text: `Choose one of: ${scene.choices.map((item) => `${item.label} [${item.id}]`).join(", ")}`, error: "choice_missing" });
      }
      const updated = await request<Session>(runtime, `/api/worlds/${active.worldId}/sessions/${active.sessionId}/choose`, { method: "POST", body: JSON.stringify({ choiceId: choice.id }) });
      const next = updated.scenes.find((item) => item.id === updated.currentSceneId)!;
      if (updated.status === "completed") await clearActiveSession(runtime, message);
      return respond(callback, { success: true, text: sceneText(world.title, next), data: { worldId: world.id, sessionId: updated.id, scene: next } });
    } catch (error) {
      return respond(callback, { success: false, text: `The world couldn't respond: ${error instanceof Error ? error.message : String(error)}`, error: error as Error });
    }
  },
};

const worldKitContext: Provider = {
  name: "WORLD_KIT_CONTEXT",
  description: "Provides the agent's available story worlds and current playable session.",
  dynamic: true,
  get: async (runtime: IAgentRuntime, message: Memory, _state: State) => {
    try {
      const payload = await request<{ worlds: WorldSummary[] }>(runtime, "/api/worlds");
      const active = await getActiveSession(runtime, message);
      const text = payload.worlds.length
        ? `Agent World Kit has ${payload.worlds.length} world(s): ${payload.worlds.map((world) => `${world.title} [${world.id}]`).join(", ")}.${active ? ` Active session: ${active.sessionId} in ${active.worldId}.` : ""}`
        : "Agent World Kit is connected but has no worlds yet.";
      return { text, data: { worlds: payload.worlds, activeSession: active || null } };
    } catch (error) {
      return { text: `Agent World Kit is unavailable at ${baseUrl(runtime)}: ${error instanceof Error ? error.message : String(error)}`, data: { available: false } };
    }
  },
};

export const agentWorldKitPlugin: Plugin = {
  name: "agent-world-kit",
  description: "Create, inspect, and run complete interactive story worlds through Agent World Kit.",
  config: { WORLDKIT_URL: process.env.WORLDKIT_URL || "http://127.0.0.1:4317" },
  actions: [createWorld, listWorlds, enterWorld, chooseInWorld],
  providers: [worldKitContext],
};

export default agentWorldKitPlugin;
