# Agent integration

There are three supported integration levels.

## HTTP actions

Use `/api/capabilities` for discovery and call the API from any agent framework.
This is the best fit when the kit runs as a sidecar or on a media workstation.

## Library adapter

Instantiate `WorldEngine` inside a TypeScript agent and implement `ModelAdapter`
using the runtime's native model call. The adapter must return one JSON object;
the engine normalizes and validates canon, artifacts, and scenes.

## elizaOS plugin

The included plugin keeps only lightweight active-session ids. elizaOS owns
conversation memory and model policy; World Kit owns creative projects and
playthrough state. Set `WORLDKIT_URL` and register the default export. The
plugin targets the stable `Action`, `Provider`, and `runtime.getSetting`
contracts in `@elizaos/core` 1.7.x.

## Recommended agent loop

1. Ask for a seed, intended audience, and any hard content boundaries.
2. Create a world with the formats needed now; formats can be added later.
3. Present the canon and high-level package summaries before generating media.
4. Send asset briefs to an appropriate image/video/audio/3D provider.
5. Attach returned URIs with the brief id so lineage remains visible.
6. Run continuity audit after substantial media or narrative work.
7. Start a session and present only available choice ids/labels to the player.
8. Export the world JSON when handing it to another application.

Never let a downstream media adapter rewrite canon silently. If a generation
reveals a better direction, revise the source project explicitly and regenerate
the affected packages.
