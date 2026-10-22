import {
  type ArtifactProposal,
  type PlannerTurn,
  plannerTurnSchema,
  validateArtifactSources,
  type WorkspaceContext,
  type WorkspaceSource,
  type WorkspaceTool,
  workspaceToolSchema,
} from "@/domain/generative";

const encoder = new TextEncoder();
export const workspaceToolResultByteLimit = 16_384;
const maximumMatches = 6;

/** Prefixes remain exact source substrings, including when a code point spans several bytes. */
function prefix(text: string, maxBytes: number) {
  let bytes = 0;
  let result = "";
  for (const character of text) {
    const size = encoder.encode(character).byteLength;
    if (bytes + size > maxBytes) break;
    bytes += size;
    result += character;
  }
  return result;
}

function sourceView(source: WorkspaceSource, withText: boolean) {
  const facts: Record<string, string> = {};
  let factsBytes = 0;
  for (const [key, value] of Object.entries(source.facts)) {
    const size = encoder.encode(JSON.stringify({ [key]: value })).byteLength;
    if (Object.keys(facts).length >= 24 || factsBytes + size > 1400) continue;
    facts[key] = value;
    factsBytes += size;
  }
  const text = withText ? prefix(source.text, 5000) : undefined;
  return {
    source: source.key,
    type: source.type,
    id: source.id,
    revision: source.revision,
    digest: source.digest,
    audience: source.audience,
    title: prefix(source.title, 300),
    facts,
    ...(withText ? { text } : {}),
    truncated:
      Object.keys(facts).length !== Object.keys(source.facts).length ||
      (withText && text !== source.text) ||
      encoder.encode(source.title).byteLength > 300,
  };
}

function matches(source: WorkspaceSource, query: string) {
  const haystack = `${source.title}\n${source.text}\n${Object.values(source.facts).join("\n")}`
    .normalize("NFKC")
    .toLowerCase();
  return query
    .normalize("NFKC")
    .toLowerCase()
    .split(/\s+/u)
    .filter(Boolean)
    .every((token) => haystack.includes(token));
}

function checkedTool(tool: unknown): WorkspaceTool {
  const parsed = workspaceToolSchema.safeParse(tool);
  if (!parsed.success) throw new Error("workspace_invalid_tool");
  return parsed.data;
}

/** Strict application commands never acquire business authority from a model message. */
export function validatePlannerTurn(output: unknown, context: WorkspaceContext): PlannerTurn {
  const parsed = plannerTurnSchema.safeParse(output);
  if (!parsed.success) throw new Error("workspace_invalid_turn");
  if (parsed.data.tool?.name === "draft.prepare")
    validateArtifactSources(parsed.data.tool.proposal, context);
  return parsed.data;
}

export async function executeWorkspaceTool(
  tool: WorkspaceTool,
  context: WorkspaceContext,
): Promise<{ result: unknown; artifact?: ArtifactProposal }> {
  const command = checkedTool(tool);
  let result: unknown;
  let artifact: ArtifactProposal | undefined;
  switch (command.name) {
    case "context.search": {
      const found = context.sources.filter((source) => matches(source, command.query));
      const selected = found.slice(0, maximumMatches).map((source) => ({
        source: source.key,
        type: source.type,
        id: source.id,
        audience: source.audience,
        title: prefix(source.title, 300),
        quote: prefix(source.text, 700),
      }));
      result = {
        matches: selected,
        missing: found.length === 0,
        truncated:
          context.truncated ||
          found.length > maximumMatches ||
          found
            .slice(0, maximumMatches)
            .some(
              (source) =>
                encoder.encode(source.text).length > 700 ||
                encoder.encode(source.title).length > 300,
            ),
      };
      break;
    }
    case "context.read": {
      const source = context.sources.find((item) => item.key === command.source);
      const view = source ? sourceView(source, true) : null;
      result = {
        source: view,
        missing: source ? [] : [command.source],
        truncated: context.truncated || (view?.truncated ?? false),
      };
      break;
    }
    case "listings.search": {
      const found = context.sources.filter(
        (source) =>
          source.type === "listing" &&
          source.audience === "approved_public" &&
          matches(source, command.query),
      );
      const listings = found.slice(0, maximumMatches).map((source) => sourceView(source, false));
      result = {
        listings,
        missing: found.length === 0,
        truncated:
          context.truncated ||
          found.length > maximumMatches ||
          listings.some((listing) => listing.truncated),
      };
      break;
    }
    case "listings.compare": {
      const ids = [...new Set(command.ids)];
      const listings = ids.flatMap((id) => {
        const source = context.sources.find(
          (item) =>
            item.id === id && item.type === "listing" && item.audience === "approved_public",
        );
        return source ? [sourceView(source, false)] : [];
      });
      result = {
        listings,
        missing: ids.filter((id) => !listings.some((listing) => listing.id === id)),
        truncated: context.truncated || listings.some((listing) => listing.truncated),
      };
      break;
    }
    case "calculate": {
      const [initial, ...rest] = command.values;
      let value = initial as number;
      for (const operand of rest) {
        switch (command.operation) {
          case "add":
            value += operand;
            break;
          case "subtract":
            value -= operand;
            break;
          case "multiply":
            value *= operand;
            break;
          case "divide":
            if (operand === 0) throw new Error("workspace_division_by_zero");
            value /= operand;
            break;
        }
        if (!Number.isFinite(value)) throw new Error("workspace_nonfinite_calculation");
      }
      result = { operation: command.operation, value, missing: false, truncated: false };
      break;
    }
    case "draft.prepare": {
      validateArtifactSources(command.proposal, context);
      artifact = command.proposal;
      result = {
        prepared: true,
        requiresReview: true,
        kind: artifact.kind,
        title: artifact.title,
        sources: [...new Set(artifact.citations.map((citation) => citation.source))],
        missing: context.sources.length === 0,
        truncated: context.truncated,
      };
      break;
    }
  }
  if (encoder.encode(JSON.stringify(result)).byteLength > workspaceToolResultByteLimit)
    throw new Error("workspace_tool_result_oversize");
  return { result, ...(artifact ? { artifact } : {}) };
}
