#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { WorldEngine } from "./engine.js";
import { createModelAdapterFromEnv } from "./model.js";
import { FileWorldStore } from "./store.js";
import { createWorldKitServer } from "./server.js";
import { ARTIFACT_TYPES, type ArtifactType } from "./types.js";
import { isArtifactType } from "./validation.js";

function arg(name: string, fallback = ""): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function has(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function loadDotEnv(path = resolve(".env")): Promise<void> {
  try {
    const source = await readFile(path, "utf8");
    for (const line of source.split(/\r?\n/)) {
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (!match?.[1] || process.env[match[1]] !== undefined) continue;
      const value = (match[2] || "").replace(/^(['"])(.*)\1$/, "$2");
      process.env[match[1]] = value;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function formats(value: string): ArtifactType[] {
  if (!value || value === "all") return [...ARTIFACT_TYPES];
  const result = value.split(",").map((item) => item.trim()).filter(isArtifactType);
  if (result.length === 0) throw new Error(`No valid formats in "${value}". Use: ${ARTIFACT_TYPES.join(", ")}`);
  return result;
}

function usage(): void {
  console.log(`Agent World Kit 0.1.0

Usage:
  worldkit serve [--port 4317] [--data .agent-worlds]
  worldkit create --brief "..." [--title "..."] [--formats all|narrative,storyboard]
  worldkit demo [--data .agent-worlds]
  worldkit list [--data .agent-worlds]
  worldkit doctor

Model configuration:
  WORLDKIT_MODEL_PROVIDER=demo                  No keys; deterministic sample output
  WORLDKIT_MODEL_PROVIDER=openai-compatible     Any chat-completions endpoint
  WORLDKIT_API_KEY, WORLDKIT_BASE_URL, WORLDKIT_MODEL
`);
}

export async function runCli(): Promise<void> {
  await loadDotEnv();
  const command = process.argv[2] || "serve";
  if (command === "help" || command === "--help" || command === "-h") {
    usage();
    return;
  }
  const dataDir = arg("data", process.env.WORLDKIT_DATA_DIR || ".agent-worlds");
  const store = new FileWorldStore(dataDir);
  const model = createModelAdapterFromEnv();
  const engine = new WorldEngine({ store, model });

  if (command === "serve") {
    const port = Number(arg("port", process.env.WORLDKIT_PORT || "4317"));
    const host = arg("host", process.env.WORLDKIT_HOST || "127.0.0.1");
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Port must be between 1 and 65535");
    const server = createWorldKitServer({ engine });
    await new Promise<void>((resolveListen) => server.listen(port, host, resolveListen));
    console.log(`Agent World Kit is ready at http://${host}:${port}`);
    console.log(`Model: ${model.id} · Data: ${resolve(dataDir)}`);
    return;
  }

  if (command === "create" || command === "demo") {
    const brief = command === "demo"
      ? "A rain-soaked city where promises become visible after midnight, and a courier must decide which memories deserve to survive."
      : arg("brief");
    if (!brief) throw new Error("create requires --brief");
    const world = await engine.createWorld({
      brief,
      ...(arg("title") || command === "demo" ? { title: arg("title", "The Lantern Archive") } : {}),
      artifactTypes: formats(arg("formats", "all")),
      metadata: { createdBy: "worldkit-cli" },
    });
    if (has("json")) console.log(JSON.stringify(world, null, 2));
    else console.log(`Created ${world.title} (${world.id}) with ${world.artifacts.length} creative packages in ${resolve(dataDir)}`);
    return;
  }

  if (command === "list") {
    const worlds = await engine.listWorlds();
    if (has("json")) console.log(JSON.stringify(worlds, null, 2));
    else if (worlds.length === 0) console.log("No worlds yet. Run: worldkit demo");
    else for (const world of worlds) console.log(`${world.id}  ${world.title}  [${world.artifactTypes.join(", ")}]`);
    return;
  }

  if (command === "doctor") {
    console.log(JSON.stringify({ ok: true, node: process.version, modelAdapter: model.id, dataDir: resolve(dataDir), capabilities: engine.capabilities().actions.map((item) => item.id) }, null, 2));
    return;
  }

  usage();
  throw new Error(`Unknown command: ${command}`);
}

runCli().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
