---
description: Install the OpenCode Hindsight auto-memory plugin. Covers cloning the repo, creating the local plugin wrapper, and environment setup.
---

# Install OpenCode Hindsight Plugin

Use this skill when the user asks to install the OpenCode Hindsight plugin (the auto-memory plugin).

## Steps to Install

1. **Clone the Repository**:
   Clone the `opencode-hindsight` repository to a suitable local directory, such as `~/Projects/opencode-hindsight`.
   ```bash
   git clone https://github.com/Everyday-Workflows/opencode-hindsight.git ~/Projects/opencode-hindsight
   ```

2. **Create the Plugin Wrapper**:
   Create a JavaScript file in the OpenCode plugins directory (`~/.config/opencode/plugins/hindsight.js`) that exports the module from the cloned repository.

   Use the `bash` tool to create this file, ensuring you use the absolute path to where the repo was cloned. For example:
   ```javascript
   // ~/.config/opencode/plugins/hindsight.js
   export { default } from "/home/user/Projects/opencode-hindsight/index.js";
   ```
   *CRITICAL: The import path must be absolute. Do NOT use `~` in the import path.*

3. **Verify Configuration**:
   Instruct the user to ensure the following environment variables are set in their environment (or via their `.env` setup):
   - `HINDSIGHT_ENDPOINT`: URL to the Hindsight instance (default: `http://localhost:8888`)
   - `HINDSIGHT_BANK_ID`: The bank ID to use (default: `opencode-memory`)
   - Model API Keys: `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, or `ANTHROPIC_API_KEY` (depending on their `small_model` setting in `opencode.json`).

4. **Restart OpenCode**:
   Remind the user to restart OpenCode for the new plugin to be detected and loaded.

## Features & Tools Provided
After installation, this plugin automatically adds:
- **Auto-Recall**: Intercepts the first user message of a session and injects relevant past memories.
- **Auto-Retain**: Summarizes the conversation and stores key architectural decisions/bug fixes into Hindsight when the session goes idle (with an in-chat TUI Toast notification).
- **Manual Tools**: Exposes `hindsight_retain` and `hindsight_recall` for explicit memory operations.

## Important Rules
- **NEVER** add this plugin to the `plugin` array in `opencode.json`. OpenCode automatically discovers `.js` files in the `~/.config/opencode/plugins/` directory. Adding local paths to the `plugin` array will break OpenCode.
