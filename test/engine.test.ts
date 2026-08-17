import assert from "node:assert/strict";
import test from "node:test";
import { WorldEngine } from "../src/engine.js";
import { DemoModelAdapter } from "../src/model.js";
import { MemoryWorldStore } from "../src/store.js";
import { ARTIFACT_TYPES } from "../src/types.js";

test("creates a portable complete world with every package", async () => {
  const engine = new WorldEngine({ store: new MemoryWorldStore(), model: new DemoModelAdapter() });
  const world = await engine.createWorld({ brief: "A city remembers every promise made after midnight." });

  assert.equal(world.status, "ready");
  assert.equal(world.schema, "agent-world-kit/world-project@1");
  assert.deepEqual(world.artifacts.map((artifact) => artifact.type), [...ARTIFACT_TYPES]);
  assert.ok(world.canon.characters.length >= 2);
  assert.ok(world.canon.locations.length >= 3);
  assert.ok(world.artifacts.every((artifact) => artifact.assetPlan.length > 0));
});

test("runs a session, applies state, audits continuity, and attaches an asset", async () => {
  const engine = new WorldEngine({ store: new MemoryWorldStore(), model: new DemoModelAdapter() });
  const world = await engine.createWorld({ brief: "A courier carries a memory that should not exist.", artifactTypes: ["visual_novel"] });
  const session = await engine.startSession(world.id);
  const choice = session.scenes[0]!.choices[0]!;
  const advanced = await engine.choose(world.id, session.id, choice.id);

  assert.equal(advanced.scenes.length, 2);
  assert.equal(advanced.history[0]?.choiceId, choice.id);
  assert.ok(advanced.inventory.includes("sealed_parcel"));

  const brief = world.artifacts[0]!.assetPlan[0]!;
  const asset = await engine.attachAsset(world.id, { briefId: brief.id, kind: "image", title: "Key art", uri: "https://example.test/key.webp" });
  const saved = await engine.getWorld(world.id);
  assert.equal(saved.assets[0]?.id, asset.id);
  assert.equal(saved.artifacts[0]?.assetPlan[0]?.status, "attached");

  const audit = await engine.auditWorld(world.id);
  assert.equal(audit.approved, true);
  assert.ok(audit.score >= 90);
});
