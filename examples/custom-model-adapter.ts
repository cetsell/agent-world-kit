import type { ModelAdapter, ModelRequest } from "agent-world-kit";

// Bridge World Kit to any agent runtime that can return structured JSON.
export class RuntimeModelAdapter implements ModelAdapter {
  readonly id = "my-agent-runtime";

  constructor(
    private readonly generate: (input: {
      system: string;
      prompt: string;
      schema: Record<string, unknown>;
    }) => Promise<Record<string, unknown>>,
  ) {}

  generateObject<T extends Record<string, unknown>>(request: ModelRequest): Promise<T> {
    return this.generate({
      system: request.system,
      prompt: request.prompt,
      schema: request.schema,
    }) as Promise<T>;
  }
}
