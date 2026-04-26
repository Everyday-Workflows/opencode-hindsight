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

Add the plugin to your `~/.config/opencode/opencode.json`:

\`\`\`json
{
  "plugin": [
    "@everyday-workflows/opencode-hindsight"
  ]
}
\`\`\`

## Configuration

The plugin uses the following environment variables (set these in your environment or via a `.env` loader plugin):

- \`HINDSIGHT_ENDPOINT\`: URL to your Hindsight instance (default: \`http://localhost:8888\`)
- \`HINDSIGHT_BANK_ID\`: The specific bank ID to use (default: \`opencode-memory\`)

For the background Auto-Retain LLM calls, it reads \`small_model\` from \`opencode.json\` and uses one of the following API keys based on the provider:
- \`OPENROUTER_API_KEY\`
- \`OPENAI_API_KEY\`
- \`ANTHROPIC_API_KEY\`
