# Agent World Kit for elizaOS

Adds four actions and one dynamic context provider to an elizaOS agent:

- `CREATE_STORY_WORLD`
- `LIST_STORY_WORLDS`
- `ENTER_STORY_WORLD`
- `CHOOSE_IN_STORY_WORLD`
- `WORLD_KIT_CONTEXT`

Start Agent World Kit first, set `WORLDKIT_URL` if it is not running at
`http://127.0.0.1:4317`, and add the plugin to your character or project:

```ts
import agentWorldKitPlugin from "@agent-world-kit/plugin-elizaos";

export const project = {
  agents: [{
    character,
    plugins: [agentWorldKitPlugin],
  }],
};
```

The plugin targets `@elizaos/core` 1.7.x and uses the stable action, provider,
and `runtime.getSetting` contracts. It talks to the model-agnostic World Kit
HTTP API, so the elizaOS agent's own model provider and the kit's production
model may be the same or different.
