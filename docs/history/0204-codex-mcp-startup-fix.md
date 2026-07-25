# 0204 — Fix Codex MCP startup paths

Date: 2026-07-25
Status: accepted

## What changed

Updated the project MCP configurations to launch context-mode from the installed marketplace launcher and provide an explicit workspace path. Updated Codex's global node runtime configuration to use the installed ChatGPT application runtime instead of the removed Codex application path.

## Why

Codex could not start node_repl because its executable path no longer existed. context-mode also closed during initialization because it started from the plugin directory without a workspace path.

## Files touched

- `.mcp.json` — launches context-mode from the installed plugin and supplies the project directory.
- `.codex/config.toml` — points the active Codex project MCP entry at the installed context-mode launcher instead of the project root.
- `~/.codex/config.toml` — points node_repl, its Node runtime, and the Codex CLI to the installed `/Applications/ChatGPT.app` runtime.

## How the pieces connect

Codex reads the global MCP configuration for node_repl and the project MCP configuration for context-mode. Both MCP clients now resolve to existing executables and receive the workspace information needed during initialization. The `.codex/config.toml` entry is the active project-level source for the Codex CLI; `.mcp.json` keeps the equivalent launcher available to MCP clients that read that format.

## How to modify this later

If the desktop application moves or is renamed, update all matching runtime paths in `~/.codex/config.toml` together. If context-mode is upgraded, keep the stable marketplace launcher path valid and preserve `CONTEXT_MODE_PROJECT_DIR` in `.mcp.json` so startup does not depend on the plugin working directory.
