/**
 * Hindsight Memory Plugin for OpenCode
 *
 * Registers two custom tools:
 * - hindsight_retain: store content to Hindsight memory bank
 * - hindsight_recall: semantic search from Hindsight memory bank
 *
 * Requires env vars:
 *   HINDSIGHT_ENDPOINT (default: http://localhost:8888)
 *   HINDSIGHT_BANK_ID   (default: opencode-memory)
 */

import { tool } from "@opencode-ai/plugin"
import os from "os";
import path from "path";
import fs from "fs/promises";


const DEFAULT_ENDPOINT = "http://localhost:8888"
const DEFAULT_BANK_ID = "opencode-memory"  // Deliberately separate from Hermes bank

function getEndpoint() {
  return (process.env.HINDSIGHT_ENDPOINT || DEFAULT_ENDPOINT).replace(/\/$/, "")
}

function getBankId() {
  return process.env.HINDSIGHT_BANK_ID || DEFAULT_BANK_ID
}

async function hindsightFetch(path, body) {
  const endpoint = getEndpoint()
  const url = `${endpoint}${path}`
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Hindsight API error ${res.status}: ${text}`)
  }
  return res.json()
}


// --- Auto-Memory Helpers ---
async function callModel(model, prompt) {
  const slashIdx = model.indexOf("/");
  const providerID = slashIdx > -1 ? model.slice(0, slashIdx) : "openai";
  const modelID = slashIdx > -1 ? model.slice(slashIdx + 1) : model;

  const providerConfigs = {
    openai: { url: "https://api.openai.com/v1/chat/completions", key: process.env.OPENAI_API_KEY },
    openrouter: { url: "https://openrouter.ai/api/v1/chat/completions", key: process.env.OPENROUTER_API_KEY },
    anthropic: { url: "https://api.anthropic.com/v1/messages", key: process.env.ANTHROPIC_API_KEY },
  };

  const provider = providerConfigs[providerID];
  if (!provider?.key) throw new Error(`No API key found for provider: ${providerID}`);

  const res = await fetch(provider.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.key}` },
    body: JSON.stringify({
      model: modelID,
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      max_tokens: 1500,
    }),
  });

  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return providerID === "anthropic" ? data.content[0].text : data.choices[0].message.content;
}

function extractTextOnly(parts) {
  return parts
    .filter((p) => p.type === "text" && !p.synthetic)
    .map((p) => p.text || "")
    .join("\n")
    .trim();
}

async function extractTurns(client, sessionId) {
  const { data: messages } = await client.session.messages({ path: { id: sessionId } });
  const turns = [];
  let currentUser = null;
  let assistantParts = [];

  for (const msg of messages) {
    const role = msg.info?.role;
    if (role === "user") {
      if (currentUser !== null) {
        turns.push({ user: currentUser, assistant: assistantParts.join(" ").trim() || null });
      }
      currentUser = extractTextOnly(msg.parts);
      assistantParts = [];
    } else if (role === "assistant") {
      const text = extractTextOnly(msg.parts);
      if (text) assistantParts.push(text);
    }
  }
  if (currentUser !== null) {
    turns.push({ user: currentUser, assistant: assistantParts.join(" ").trim() || null });
  }
  return turns;
}

function formatContext(turns) {
  return turns
    .map((turn) => `User: ${turn.user}\nAssistant: ${turn.assistant || ""}`)
    .join("\n\n");
}

const sessionRecalled = new Set();
const sessionIdleCount = new Map();

export default async (ctx) => {
  
  const { client } = ctx;
  let opencodeConfig = {};
  const os = require("os");
  const path = require("path");
  const fs = require("fs/promises");
  try {
    const rawConfig = await fs.readFile(path.join(os.homedir(), ".config", "opencode", "opencode.json"), "utf8");
    opencodeConfig = JSON.parse(rawConfig);
  } catch (e) {
    console.error("[hindsight] Failed to read opencode.json:", e.message);
  }
  const smallModel = opencodeConfig.small_model || "openrouter/google/gemini-3-flash-preview";

  return {
    event: async ({ event }) => {
      const isIdle = event.type === "session.idle" || (event.type === "session.status" && event.properties?.status?.type === "idle");
      const sessionId = event.properties?.sessionID || ctx.sessionID;

      // 1. AUTO-RECALL: Intercept first user message and silently inject memory context
      if (event.type === "message.updated" && event.message?.role === "user" && event.message?.id) {
        const text = event.message.content || event.message.text || event.message.parts?.[0]?.text || "";
        
        // Only run recall once per session on the first substantial message
        if (text.length > 20 && !sessionRecalled.has(sessionId)) {
          sessionRecalled.add(sessionId);
          
          (async () => {
            try {
              const bankId = getBankId();
              // Fetch memories matching the user's initial request
              const result = await hindsightFetch(`/v1/default/banks/${bankId}/memories/recall`, {
                query: text,
                limit: 5
              });

              const memories = result?.results || [];
              if (memories.length > 0 && memories[0].score > 0.75) {
                // Only inject highly relevant memories
                const validMemories = memories.filter(m => m.score > 0.70);
                if (validMemories.length > 0) {
                  const lines = validMemories.map((m, i) => `[Memory ${i + 1}] ${m.text || ""}`);
                  const contextText = `[System: Auto-Recall]\nBased on your request, here is relevant context retrieved from your past memory bank:\n\n${lines.join("\n\n")}\n\nUse this context to inform your response if it applies.`;

                  await client.session.prompt({
                    path: { id: sessionId },
                    body: {
                      parts: [{ type: "text", text: contextText }],
                      noReply: true,
                      system: "Acknowledge this internal memory recall silently."
                    }
                  });
                  console.log(`[hindsight] Injected ${validMemories.length} relevant memories for session ${sessionId}`);
                }
              }
            } catch (err) {
              console.error("[hindsight] Auto-recall failed:", err.message);
            }
          })();
        }
      }

      // 2. AUTO-RETAIN: Summarize session and store decisions when idle
      if (isIdle && sessionId) {
        // Prevent storing every single turn. We'll store every 3 idle states (like smart-title)
        const count = (sessionIdleCount.get(sessionId) ?? 0) + 1;
        sessionIdleCount.set(sessionId, count);
        
        if (count % 3 !== 0) return;

        (async () => {
          try {
            const turns = await extractTurns(client, sessionId);
            if (turns.length < 2) return; // Too short to matter

            const contextText = formatContext(turns);
            const prompt = `Analyze the following conversation between a user and an AI coding assistant.
Identify if any of the following occurred:
1. A significant architectural decision or design choice was made.
2. A non-obvious bug was resolved (extract the root cause and solution).
3. A new workflow pattern or project convention was established.
4. An integration or environment quirk was discovered.

Conversation:
${contextText}

If none of those occurred (e.g. just minor code edits, generic chatting, or failures), return exactly {"retain": false}.
If something valuable occurred that should be remembered in future sessions, return a JSON object in this exact format:
{
  "retain": true,
  "content": "A dense, high-fidelity summary of the facts, decisions, or fixes. Include exact file paths or code snippets if necessary.",
  "tags": ["tag1", "tag2"]
}`;

            const raw = await callModel(smallModel, prompt);
            const jsonStr = raw.replace(/^\s*\x60\x60\x60json\n/, '').replace(/\n\x60\x60\x60\s*$/, '').trim();
            const analysis = JSON.parse(jsonStr);

            if (analysis.retain && analysis.content) {
              const bankId = getBankId();
              await hindsightFetch(`/v1/default/banks/${bankId}/memories`, {
                items: [{
                  content: analysis.content,
                  tags: analysis.tags || ["auto-retained"],
                  source: `session-${sessionId}`
                }]
              });
              console.log(`[hindsight] Auto-retained valuable memory from session ${sessionId}`);
            }
          } catch (err) {
            console.error("[hindsight] Auto-retain failed:", err.message);
          }
        })();
      }
    },
    tool: {
      hindsight_retain: tool({
        description:
          "Store content into the Hindsight memory bank. Use this to persist important facts, decisions, context, or summaries that should be recalled in future sessions.",
        args: {
          content: tool.schema
            .string()
            .min(1)
            .describe("The text content to store in memory."),
          tags: tool.schema
            .array(tool.schema.string())
            .optional()
            .describe("Optional tags to categorize this memory (e.g., ['architecture', 'decision'])."),
          source: tool.schema
            .string()
            .optional()
            .describe("Optional source identifier (e.g., filename or context)."),
        },
        async execute({ content, tags, source }) {
          const bankId = getBankId()
          const item = { content }
          if (tags?.length) item.tags = tags
          if (source) item.source = source

          const result = await hindsightFetch(
            `/v1/default/banks/${bankId}/memories`,
            { items: [item] }
          )

          const count = result?.items_count ?? "?"
          return `Retained ${count} item(s) to Hindsight bank '${bankId}'.`
        },
      }),

      hindsight_recall: tool({
        description:
          "Search the Hindsight memory bank using semantic similarity. Use this to retrieve relevant past context, decisions, or facts before making changes.",
        args: {
          query: tool.schema
            .string()
            .min(1)
            .describe("The search query. Hindsight returns semantically similar memories."),
          limit: tool.schema
            .number()
            .int()
            .min(1)
            .max(50)
            .optional()
            .describe("Maximum number of memories to return (default: 10)."),
          tags: tool.schema
            .array(tool.schema.string())
            .optional()
            .describe("Optional tags to filter results."),
        },
        async execute({ query, limit = 10, tags }) {
          const bankId = getBankId()
          const payload = { query, limit }
          if (tags?.length) payload.tags = tags

          const result = await hindsightFetch(
            `/v1/default/banks/${bankId}/memories/recall`,
            payload
          )

          const memories = result?.results || []
          if (!memories.length) {
            return `No memories found in bank '${bankId}' for query: "${query}"`
          }

          const lines = memories.map((m, i) => {
            const id = m.id || "?"
            const text = m.text || "(empty)"
            const memTags = m.tags?.length ? ` [tags: ${m.tags.join(", ")}]` : ""
            const type = m.type ? ` (${m.type})` : ""
            return `${i + 1}. [${id}]${type}${memTags}\n${text}`
          })

          return `Recalled ${memories.length} memory(s) from bank '${bankId}':\n\n${lines.join("\n\n")}`
        },
      }),
    },
  }
}
