// POST /api/search/interpret (spec F01/F02 language assistance, F29): free search text in a
// public locale becomes reviewable chips and questions. It never runs a search and never
// applies a criterion; the client shows the chips and applies only the ones the visitor accepts.
import { z } from "zod";
import { publicLocales } from "@/domain/ids";
import { AppError } from "@/server/errors";
import { route } from "@/server/http/next";
import { clientIpFrom } from "@/server/http/request";
import { enforceRateLimit } from "@/server/rate-limit";
import { interpretSearchText, maxInterpretTextBytes } from "@/server/search/interpret-service";

/** JSON envelope around the 2 kB text: the locale, quotes and escapes. */
const maxBodyBytes = maxInterpretTextBytes * 3;

const bodySchema = z.object({ text: z.string(), locale: z.enum(publicLocales) });

async function readBody(request: Request): Promise<z.infer<typeof bodySchema>> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > maxBodyBytes) {
    throw new AppError("validation_failed", { fieldErrors: { text: ["too_long"] } });
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > maxBodyBytes) {
    throw new AppError("validation_failed", { fieldErrors: { text: ["too_long"] } });
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    // The parser's message can quote the body; it is never passed on.
    throw new AppError("validation_failed", { fieldErrors: { body: ["invalid_json"] } });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    const fields = new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? "body")));
    throw new AppError("validation_failed", {
      fieldErrors: Object.fromEntries([...fields].map((field) => [field, ["invalid"]])),
    });
  }
  return parsed.data;
}

export const POST = route(async (request, ctx) => {
  await enforceRateLimit(ctx.db, "search.interpret.ip", clientIpFrom(request.headers));
  const input = await readBody(request);
  const result = await interpretSearchText(ctx.db, input);
  return Response.json(result, { headers: { "cache-control": "no-store" } });
});
