import assert from "node:assert/strict";
import test from "node:test";
import type { IAgentRuntime, Memory } from "@elizaos/core";
import agentWorldKitPlugin from "../src/index.js";

const enterWorld = agentWorldKitPlugin.actions.find((action) => action.name === "ENTER_STORY_WORLD")!;
const chooseInWorld = agentWorldKitPlugin.actions.find((action) => action.name === "CHOOSE_IN_STORY_WORLD")!;

const scene = {
  id: "scene_1",
  title: "The beginning",
  narrative: "A lantern waits.",
  dialogue: [],
  choices: [{ id: "choice_1", label: "Light the lantern", consequenceHint: "The room wakes." }],
  isEnding: false,
};

const session = {
  id: "session_1",
  worldId: "world_1",
  currentSceneId: scene.id,
  scenes: [scene],
  status: "active" as const,
};

function createRuntime(cache: Map<string, unknown>): IAgentRuntime {
  return {
    agentId: "agent_1",
    getSetting: () => "http://worldkit.test",
    getCache: async <T>(key: string) => cache.get(key) as T | undefined,
    setCache: async <T>(key: string, value: T) => {
      cache.set(key, value);
      return true;
    },
    deleteCache: async (key: string) => cache.delete(key),
  } as unknown as IAgentRuntime;
}

function createMessage(): Memory {
  return {
    entityId: "entity_1",
    roomId: "room_1",
    content: { text: "Enter world_1" },
  } as Memory;
}

test("recovers an active session from the elizaOS runtime cache", async () => {
  const originalFetch = globalThis.fetch;
  const cache = new Map<string, unknown>();
  const message = createMessage();
  const firstRuntime = createRuntime(cache);
  const restartedRuntime = createRuntime(cache);
  let chooseRequestSeen = false;

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/api/worlds/world_1") && !init?.method) {
      return Response.json({ id: "world_1", title: "Lantern Room", canon: { logline: "A room remembers." }, sessions: [session] });
    }
    if (url.endsWith("/api/worlds/world_1/sessions") && init?.method === "POST") {
      return Response.json(session);
    }
    if (url.endsWith("/api/worlds/world_1/sessions/session_1/choose") && init?.method === "POST") {
      chooseRequestSeen = true;
      return Response.json({ ...session, status: "completed" });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  try {
    const entered = await enterWorld.handler(firstRuntime, message);
    assert.equal(entered?.success, true);
    assert.equal(await chooseInWorld.validate(restartedRuntime, message), true);

    const chosen = await chooseInWorld.handler(restartedRuntime, { ...message, content: { text: "1" } });
    assert.equal(chosen?.success, true);
    assert.equal(chooseRequestSeen, true);
    assert.equal(await chooseInWorld.validate(restartedRuntime, message), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
