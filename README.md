# OpenCode Hindsight Plugin

A magical Auto-Memory plugin for OpenCode. It silently integrates with a [Hindsight](https://github.com/hindsight-memory/hindsight) memory bank to give your AI coding assistant perfect recall.

## Features

**🧠 Auto-Recall**
When you start a new session, the plugin intercepts your first message, performs a semantic search against your Hindsight memory bank, and seamlessly injects highly relevant past decisions, bugs, and conventions directly into the primary agent's context.

**💾 Auto-Retain**
When the session goes idle, a background LLM process (using your configured `small_model`) automatically analyzes the conversation. If a significant architectural decision was made or a non-obvious bug was resolved, it generates a high-fidelity summary and saves it to Hindsight.

**🛠️ Manual Tools**
It still exposes `hindsight_retain` and `hindsight_recall` for explicit memory management by the primary agent or the user.

## Installation

Because this plugin runs locally and is not published to the npm registry, you should install it by cloning the repository and wrapping it in your OpenCode plugins directory.

1. Clone this repository to your local machine:
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

The plugin uses the following environment variables (set these in your environment or via a `.env` loader plugin):

- `HINDSIGHT_ENDPOINT`: URL to your Hindsight instance (default: `http://localhost:8888`)
- `HINDSIGHT_BANK_ID`: The specific bank ID to use (default: `opencode-memory`)

For the background Auto-Retain LLM calls, it reads `small_model` from `opencode.json` and uses one of the following API keys based on the provider:
- `OPENROUTER_API_KEY`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
