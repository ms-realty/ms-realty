#!/usr/bin/env node
// Stdio MCP server exposing the Hermes drafting framework to the operator's
// desktop AI (Claude Desktop / Claude Code / Codex). Register it as a local
// MCP server; the AI drafts, the framework validates and records. See
// production/OPERATOR_AI.md for one-paste setup.
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";
import {
  BRIDGE_GUARDRAILS,
  bridgeNextTasks,
  bridgeStatus,
  bridgeSubmitDraft,
} from "../lib/hermes-desktop-bridge.mjs";

const server = new McpServer({ name: "ms-realty-hermes", version: "1.0.0" });

const text = (value) => ({
  content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  structuredContent: value,
});

server.registerTool(
  "hermes_status",
  {
    description:
      "Hermes drafting queue status: how many tasks are eligible for desktop drafting, what is withheld as sensitive, and the guardrails that apply.",
    inputSchema: z.object({}).strict(),
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  async () => text(bridgeStatus()),
);

server.registerTool(
  "hermes_next_tasks",
  {
    description:
      "Pull the next drafting tasks (translations) with the exact model messages the hosted Hermes worker would use. Draft each one, then call hermes_submit_draft.",
    inputSchema: z
      .object({
        limit: z.number().int().min(1).max(10).default(3),
        target_locale: z.string().min(2).max(5).optional(),
      })
      .strict(),
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  async ({ limit, target_locale: targetLocale }) => text(bridgeNextTasks({ limit, targetLocale })),
);

server.registerTool(
  "hermes_submit_draft",
  {
    description:
      "Validate and persist one completed draft into the translation ledger (draft-only; human review still required). Rejects fact drift and sensitive rows.",
    inputSchema: z
      .object({
        id: z.string().min(1),
        draft: z
          .object({
            title: z.string().min(1),
            body: z.string().min(1),
            seo_title: z.string().min(1),
            meta_description: z.string().min(1),
            citations: z.array(z.unknown()).optional(),
          })
          .passthrough(),
        model: z.string().min(1).max(120).optional(),
      })
      .strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  },
  async ({ id, draft, model }) => {
    try {
      return text(bridgeSubmitDraft({ id, draft, model }));
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({ rejected: id, reason: error.message, guardrails: BRIDGE_GUARDRAILS }, null, 2),
          },
        ],
      };
    }
  },
);

await serveStdio(server);
