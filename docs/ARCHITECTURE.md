# Architecture

Agent World Kit has five narrow layers.

1. `ModelAdapter` turns a structured prompt and output contract into a JSON
   object. It knows the model provider and nothing about persistence or UI.
2. `WorldEngine` owns the sequence: canon, adaptations, audit, sessions, assets.
3. `WorldStore` persists complete versioned world projects. The built-in file
   store uses atomic replacement; the memory store is useful for embedding/tests.
4. The HTTP server maps stable agent actions onto the engine and serves the UI.
5. Framework integrations, including elizaOS, call that API and keep their own
   agent memory, identity, transport, and model policy.

The frozen canon is the authority for every downstream package. A creative
package contains structured format content, renderable blocks, and a media asset
plan. Runtime sessions are stored beside packages because their choices and
state are part of the evolving world, but they never silently rewrite canon.

The file format is intentionally boring JSON. A future database store or game
engine projection implements `WorldStore` or consumes exports without changing
the generation engine.
