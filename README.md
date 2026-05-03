![Hindsight Plugin Banner](banner.png)

# OpenCode Hindsight Plugin

A magical Auto-Memory plugin for OpenCode. It silently integrates with a [Hindsight](https://github.com/hindsight-memory/hindsight) memory bank to give your AI coding assistant perfect recall.

## Features

**🧠 Auto-Recall**
When you start a new session, the plugin intercepts your first substantial user message, performs a semantic search against your Hindsight memory bank, and seamlessly injects highly relevant past decisions, bugs, and conventions directly into the primary agent's context.

**💾 Auto-Retain**
When the session goes idle, a background LLM process (using your configured `small_model`) automatically analyzes the newest turns in the conversation. If a significant architectural decision was made or a non-obvious bug was resolved, it generates a high-fidelity summary and saves it to Hindsight. Only new turns since the last successful retain are analyzed, so each event captures incremental progress.

**🛠️ Manual Tools**
It still exposes `hindsight_retain` and `hindsight_recall` for explicit memory management by the primary agent or the user.

**📁 Per-Project Memory Banks (v2.0)**
By default, each Git repository gets its own memory bank (derived from the repo root name). Memories from one project stay scoped to that project. Set `HINDSIGHT_BANK_ID` to override this behavior.

**🔔 Unified Notifications**
All success and error feedback flows through OpenCode's toast system. Nothing is printed to stderr, so plugin output never leaks into the chat field. Structured diagnostics are written to `/tmp/hindsight-plugin.log` for debugging.

**🛡️ Built-in Safety**
- 30-second timeout on background LLM calls (prevents hangs)
- Race-condition guard prevents overlapping auto-retain runs per session
- Incremental turn processing (never re-analyzes the same conversation twice)
- Graceful fallback when the small model returns empty/malformed responses

## Installation

Because this plugin runs locally and is not published to the npm registry, install it by cloning the repository and wrapping it in your OpenCode plugins directory.

1. Clone this repository:
   ```bash
   git clone https://github.com/Everyday-Workflows/opencode-hindsight.git ~/Projects/opencode-hindsight
   ```

2. Create a plugin wrapper file in your OpenCode plugins directory (e.g. `~/.config/opencode/plugins/hindsight.js`):
   ```javascript
   // ~/.config/opencode/plugins/hindsight.js
   export { default } from "/path/to/your/clone/opencode-hindsight/index.js";
   ```

*Note: OpenCode automatically discovers `.js` files in the `plugins` directory. Do not add local paths to the `plugin` array in `opencode.json`.*

## Configuration

Environment variables (set in your shell, via `.env` plugin, or via `opencode-serve.env`):

- `HINDSIGHT_ENDPOINT`: URL to your Hindsight instance (default: `http://localhost:8888`)
- `HINDSIGHT_BANK_ID`: Override the auto-detected bank ID. If unset, the plugin uses a sanitized version of the Git repo root's basename (e.g. `/home/user/projects/my-app` → `my-app`). If the current directory is not inside a Git repo, the plugin falls back to the session working directory.

For background Auto-Retain LLM calls, the plugin reads `small_model` from `~/.config/opencode/opencode.json`. Supported provider prefixes and their required API keys:

| Provider prefix | Env var for API key   |
| --------------- | --------------------- |
| `openai`        | `OPENAI_API_KEY`      |
| `openrouter`    | `OPENROUTER_API_KEY`  |
| `anthropic`     | `ANTHROPIC_API_KEY`   |
| `ollama-cloud`  | `OLLAMA_API_KEY`      |

If `small_model` is not set, the plugin falls back to `openrouter/google/gemini-3-flash-preview`.

> **Tip:** Avoid reasoning models (e.g. `kimi-k2.6:cloud`, `o1-*`) for `small_model`. They consume the output budget on hidden reasoning tokens and return empty content, which makes auto-retain no-op silently.

## Logging

All plugin activity (successes, failures, stack traces) is appended to `/tmp/hindsight-plugin.log`. Useful for debugging auto-retain failures without scrolling the TUI. Example entry:

```
2026-05-03T17:16:16.329Z [success] Hindsight Retain: Stored 1 item(s) to bank 'my-app'. {"bankId":"my-app","count":1}
```

User-visible feedback is delivered exclusively via toasts — the plugin never writes to stdout or stderr.

## Migration from v1.x

Version 2.0 changed the default bank ID behavior.

- **v1.x default**: all projects shared one bank named `opencode-memory`.
- **v2.0 default**: each Git repo gets its own bank (e.g. `my-app`, `client-site`).

If you want v1.x behavior back, set the env var:

```bash
export HINDSIGHT_BANK_ID=opencode-memory
```

Memories stored in v1.x under `opencode-memory` remain accessible through that env override. You can also recall from the old bank using the `hindsight_recall` tool and re-store into the new per-project banks if desired.
