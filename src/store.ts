import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { WorldProject, WorldSummary } from "./types.js";
import { validateProject } from "./validation.js";

export interface WorldStore {
  listWorlds(): Promise<WorldSummary[]>;
  getWorld(id: string): Promise<WorldProject | null>;
  saveWorld(world: WorldProject): Promise<void>;
}

function summarize(world: WorldProject): WorldSummary {
  return {
    id: world.id,
    title: world.title,
    logline: world.canon.logline,
    genre: world.canon.genre,
    artifactTypes: world.artifacts.map((artifact) => artifact.type),
    sessions: world.sessions.length,
    updatedAt: world.updatedAt,
  };
}

export class MemoryWorldStore implements WorldStore {
  private readonly worlds = new Map<string, WorldProject>();

  async listWorlds(): Promise<WorldSummary[]> {
    return [...this.worlds.values()]
      .map((world) => summarize(structuredClone(world)))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getWorld(id: string): Promise<WorldProject | null> {
    const world = this.worlds.get(id);
    return world ? structuredClone(world) : null;
  }

  async saveWorld(world: WorldProject): Promise<void> {
    this.worlds.set(world.id, structuredClone(world));
  }
}

export class FileWorldStore implements WorldStore {
  readonly dataDir: string;

  constructor(dataDir = process.env.WORLDKIT_DATA_DIR || ".agent-worlds") {
    this.dataDir = dataDir;
  }

  private worldPath(id: string): string {
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error("Invalid world id");
    return join(this.dataDir, `${id}.json`);
  }

  async listWorlds(): Promise<WorldSummary[]> {
    await mkdir(this.dataDir, { recursive: true });
    const entries = await readdir(this.dataDir, { withFileTypes: true });
    const worlds = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map(async (entry) => {
          try {
            const value: unknown = JSON.parse(await readFile(join(this.dataDir, entry.name), "utf8"));
            validateProject(value);
            return summarize(value);
          } catch {
            return null;
          }
        }),
    );
    return worlds
      .filter((world): world is WorldSummary => world !== null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getWorld(id: string): Promise<WorldProject | null> {
    try {
      const value: unknown = JSON.parse(await readFile(this.worldPath(id), "utf8"));
      validateProject(value);
      return value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async saveWorld(world: WorldProject): Promise<void> {
    validateProject(world);
    await mkdir(this.dataDir, { recursive: true });
    const target = this.worldPath(world.id);
    const temporary = `${target}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(world, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, target);
  }
}
