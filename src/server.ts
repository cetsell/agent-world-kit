import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { WorldEngine, NotFoundError } from "./engine.js";
import { ValidationError, isArtifactType, isRecord } from "./validation.js";
import type { AttachAssetInput, CreateWorldInput } from "./types.js";

export interface ServerOptions {
  engine: WorldEngine;
  webRoot?: string;
  corsOrigin?: string;
}

const defaultWebRoot = fileURLToPath(new URL("../web", import.meta.url));

function json(response: ServerResponse, status: number, payload: unknown, headers: Record<string, string> = {}): void {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...headers });
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 1_000_000) throw new ValidationError("Request body is too large", ["body_too_large"]);
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!isRecord(parsed)) throw new ValidationError("JSON body must be an object", ["body_not_object"]);
  return parsed;
}

function contentType(path: string): string {
  return ({
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
  } as Record<string, string>)[extname(path).toLowerCase()] || "application/octet-stream";
}

async function serveStatic(response: ServerResponse, webRoot: string, pathname: string): Promise<void> {
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
  const safe = normalize(relative).replace(/^(\.\.(\/|\\|$))+/, "");
  let target = join(webRoot, safe);
  try {
    const info = await stat(target);
    if (info.isDirectory()) target = join(target, "index.html");
  } catch {
    target = join(webRoot, "index.html");
  }
  response.writeHead(200, { "Content-Type": contentType(target), "Cache-Control": target.endsWith("index.html") ? "no-cache" : "public, max-age=300" });
  createReadStream(target).on("error", () => {
    if (!response.headersSent) response.writeHead(404);
    response.end("Not found");
  }).pipe(response);
}

function createOpenApi(): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    info: { title: "Agent World Kit API", version: "0.1.0" },
    paths: {
      "/api/health": { get: { summary: "Read service readiness" } },
      "/api/capabilities": { get: { summary: "List stable agent capabilities" } },
      "/api/worlds": { get: { summary: "List worlds" }, post: { summary: "Generate a complete world" } },
      "/api/worlds/{worldId}": { get: { summary: "Read a world and its packages" } },
      "/api/worlds/{worldId}/artifacts": { post: { summary: "Generate or replace one creative package" } },
      "/api/worlds/{worldId}/audit": { post: { summary: "Run a continuity audit" } },
      "/api/worlds/{worldId}/sessions": { post: { summary: "Start a playable session" } },
      "/api/worlds/{worldId}/sessions/{sessionId}/choose": { post: { summary: "Advance a session from a choice" } },
      "/api/worlds/{worldId}/assets": { post: { summary: "Attach an external or generated asset" } },
      "/api/worlds/{worldId}/export": { get: { summary: "Download the portable world JSON" } },
    },
  };
}

export function createWorldKitServer(options: ServerOptions): Server {
  const { engine } = options;
  const webRoot = options.webRoot || defaultWebRoot;
  return createServer(async (request, response) => {
    const origin = options.corsOrigin || "*";
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }
    const url = new URL(request.url || "/", "http://127.0.0.1");
    const path = url.pathname;

    try {
      if (request.method === "GET" && path === "/api/health") {
        json(response, 200, { ok: true, service: "agent-world-kit", version: "0.1.0", modelAdapter: engine.model.id });
        return;
      }
      if (request.method === "GET" && path === "/api/capabilities") {
        json(response, 200, engine.capabilities());
        return;
      }
      if (request.method === "GET" && path === "/api/openapi.json") {
        json(response, 200, createOpenApi());
        return;
      }
      if (request.method === "GET" && path === "/api/worlds") {
        json(response, 200, { worlds: await engine.listWorlds() });
        return;
      }
      if (request.method === "POST" && path === "/api/worlds") {
        const input = await body(request);
        const artifactTypes = Array.isArray(input.artifactTypes) ? input.artifactTypes.filter(isArtifactType) : undefined;
        const world = await engine.createWorld({
          brief: typeof input.brief === "string" ? input.brief : "",
          ...(typeof input.title === "string" ? { title: input.title } : {}),
          ...(artifactTypes ? { artifactTypes } : {}),
          ...(isRecord(input.metadata) ? { metadata: input.metadata } : {}),
        } satisfies CreateWorldInput);
        json(response, 201, world);
        return;
      }

      const exportMatch = /^\/api\/worlds\/([^/]+)\/export$/.exec(path);
      if (request.method === "GET" && exportMatch?.[1]) {
        const world = await engine.getWorld(exportMatch[1]);
        json(response, 200, world, { "Content-Disposition": `attachment; filename="${world.metadata.slug || world.id}.world.json"` });
        return;
      }
      const artifactMatch = /^\/api\/worlds\/([^/]+)\/artifacts$/.exec(path);
      if (request.method === "POST" && artifactMatch?.[1]) {
        const input = await body(request);
        if (!isArtifactType(input.type)) throw new ValidationError("A valid artifact type is required", ["artifact_type_invalid"]);
        json(response, 201, await engine.createArtifact(artifactMatch[1], input.type));
        return;
      }
      const auditMatch = /^\/api\/worlds\/([^/]+)\/audit$/.exec(path);
      if (request.method === "POST" && auditMatch?.[1]) {
        json(response, 201, await engine.auditWorld(auditMatch[1]));
        return;
      }
      const sessionsMatch = /^\/api\/worlds\/([^/]+)\/sessions$/.exec(path);
      if (request.method === "POST" && sessionsMatch?.[1]) {
        const input = await body(request);
        json(response, 201, await engine.startSession(sessionsMatch[1], typeof input.title === "string" ? input.title : undefined));
        return;
      }
      const choiceMatch = /^\/api\/worlds\/([^/]+)\/sessions\/([^/]+)\/choose$/.exec(path);
      if (request.method === "POST" && choiceMatch?.[1] && choiceMatch[2]) {
        const input = await body(request);
        if (typeof input.choiceId !== "string") throw new ValidationError("choiceId is required", ["choice_id_missing"]);
        json(response, 200, await engine.choose(choiceMatch[1], choiceMatch[2], input.choiceId));
        return;
      }
      const assetMatch = /^\/api\/worlds\/([^/]+)\/assets$/.exec(path);
      if (request.method === "POST" && assetMatch?.[1]) {
        const input = await body(request);
        const kind = ["image", "video", "audio", "music", "model3d"].includes(String(input.kind)) ? input.kind as AttachAssetInput["kind"] : "image";
        json(response, 201, await engine.attachAsset(assetMatch[1], {
          kind,
          title: typeof input.title === "string" ? input.title : "Untitled asset",
          uri: typeof input.uri === "string" ? input.uri : "",
          ...(typeof input.briefId === "string" ? { briefId: input.briefId } : {}),
          ...(typeof input.mimeType === "string" ? { mimeType: input.mimeType } : {}),
          ...(typeof input.alt === "string" ? { alt: input.alt } : {}),
          ...(Array.isArray(input.characterIds) ? { characterIds: input.characterIds.filter((item): item is string => typeof item === "string") } : {}),
          ...(typeof input.locationId === "string" ? { locationId: input.locationId } : {}),
          ...(typeof input.targetBlockId === "string" ? { targetBlockId: input.targetBlockId } : {}),
          ...(isRecord(input.metadata) ? { metadata: input.metadata } : {}),
        }));
        return;
      }
      const worldMatch = /^\/api\/worlds\/([^/]+)$/.exec(path);
      if (request.method === "GET" && worldMatch?.[1]) {
        json(response, 200, await engine.getWorld(worldMatch[1]));
        return;
      }
      if (path.startsWith("/api/")) {
        json(response, 404, { error: "not_found", message: `No route for ${request.method} ${path}` });
        return;
      }
      await serveStatic(response, webRoot, path);
    } catch (error) {
      if (error instanceof SyntaxError) {
        json(response, 400, { error: "invalid_json", message: error.message });
      } else if (error instanceof ValidationError) {
        json(response, 400, { error: "validation_error", message: error.message, issues: error.issues });
      } else if (error instanceof NotFoundError) {
        json(response, 404, { error: "not_found", message: error.message });
      } else {
        json(response, 500, { error: "internal_error", message: error instanceof Error ? error.message : String(error) });
      }
    }
  });
}
