import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { WorldEngine } from "../src/engine.js";
import { DemoModelAdapter } from "../src/model.js";
import { createWorldKitServer } from "../src/server.js";
import { MemoryWorldStore } from "../src/store.js";

test("serves health and the complete agent workflow", async (context) => {
  const engine = new WorldEngine({ store: new MemoryWorldStore(), model: new DemoModelAdapter() });
  const server = createWorldKitServer({ engine });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => server.close());
  const port = (server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;

  const health = await fetch(`${base}/api/health`).then((response) => response.json()) as { ok: boolean; modelAdapter: string };
  assert.equal(health.ok, true);
  assert.equal(health.modelAdapter, "demo");

  const createResponse = await fetch(`${base}/api/worlds`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ brief: "A moon garden grows decisions instead of flowers.", artifactTypes: ["storyboard", "visual_novel"] }),
  });
  assert.equal(createResponse.status, 201);
  const world = await createResponse.json() as { id: string; artifacts: unknown[] };
  assert.equal(world.artifacts.length, 2);

  const sessionResponse = await fetch(`${base}/api/worlds/${world.id}/sessions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  const session = await sessionResponse.json() as { id: string; currentSceneId: string; scenes: Array<{ id: string; choices: Array<{ id: string }> }> };
  const scene = session.scenes.find((item) => item.id === session.currentSceneId)!;
  const advanceResponse = await fetch(`${base}/api/worlds/${world.id}/sessions/${session.id}/choose`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ choiceId: scene.choices[0]!.id }),
  });
  assert.equal(advanceResponse.status, 200);
  const advanced = await advanceResponse.json() as { scenes: unknown[] };
  assert.equal(advanced.scenes.length, 2);
});
