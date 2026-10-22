// Application-owned operator OAuth bootstrap. Run with --conditions=react-server --import tsx.
import { createServer } from "node:http";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import {
  accessToken,
  beginAuthorization,
  boundedJson,
  finishAuthorization,
  revokeSession,
  saveRegistration,
  verifiedIdentity,
} from "../src/server/ai/chatgpt/oauth";
import { openChatGptDatabaseStore } from "../src/server/ai/chatgpt/runtime";
import { FileChatGptStore } from "../src/server/ai/chatgpt/store";
import {
  type ChatGptCredential,
  type ChatGptCredentialStore,
  ChatGptError,
  directScope,
} from "../src/server/ai/chatgpt/types";

const help = `MS Realty Butler ChatGPT OAuth
  login [--account REGISTRATION_ID] [--dir PRIVATE_DIRECTORY] [--database]
  status [--dir PRIVATE_DIRECTORY]
  models --account REGISTRATION_ID [--dir PRIVATE_DIRECTORY]
  import --account REGISTRATION_ID --dir PRIVATE_DIRECTORY --database
  signout --account REGISTRATION_ID [--dir PRIVATE_DIRECTORY] [--database]

login prints a new app-owned authorization link and listens on 127.0.0.1 only.
Confirm the selected ChatGPT account, workspace and plan-use permissions in your browser.
No model inference is sent. --database on login reuses the destination's stable host only.
import is explicit and requires dedicated operator DB/key/host settings.
After transferring a session, use only the destination for refreshes. Never import Codex credentials.
`;
export function parseArguments(args: readonly string[]) {
  const [command = "help", ...rest] = args;
  if (!["help", "login", "status", "models", "import", "signout"].includes(command))
    throw new ChatGptError("chatgpt_cli_command", "configuration");
  let directory = join(homedir(), ".config", "ms-realty", "chatgpt"),
    account: string | undefined,
    database = false;
  const seen = new Set<string>();
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (!arg || seen.has(arg)) throw new ChatGptError("chatgpt_cli_arguments", "configuration");
    seen.add(arg);
    if (arg === "--database") database = true;
    else if (arg === "--dir" || arg === "--account") {
      const value = rest[++i];
      if (!value || value.startsWith("--"))
        throw new ChatGptError("chatgpt_cli_arguments", "configuration");
      if (arg === "--dir") directory = resolve(value);
      else account = value;
    } else throw new ChatGptError("chatgpt_cli_arguments", "configuration");
  }
  if (account && !/^[a-f0-9]{64}$/.test(account))
    throw new ChatGptError("chatgpt_registration_invalid", "configuration");
  if (["models", "import", "signout"].includes(command) && !account)
    throw new ChatGptError("chatgpt_cli_account_required", "configuration");
  if (command === "import" && !database)
    throw new ChatGptError("chatgpt_cli_explicit_import_required", "configuration");
  if (database && ["models", "status"].includes(command))
    throw new ChatGptError("chatgpt_cli_local_bootstrap_required", "configuration");
  return { command, directory, account, database };
}
async function readAccount(store: ChatGptCredentialStore, id: string): Promise<ChatGptCredential> {
  const result = await store.withRegistration(id, (session) => session.load());
  if (!result) throw new ChatGptError("chatgpt_account_missing", "configuration");
  return result;
}
/** Listener starts before emitting the URL; callbacks are one-use and every failure is redacted. */
export async function login(
  store: FileChatGptStore,
  selected: ChatGptCredential | null,
  write: (text: string) => void,
) {
  const hostId = await store.hostId();
  const issuedClientId = selected ? undefined : await store.pendingClient();
  return new Promise<string>((done, fail) => {
    let pending: ReturnType<typeof beginAuthorization> | undefined;
    const server = createServer(async (request, response) => {
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Content-Security-Policy", "default-src 'none'");
      response.setHeader("Referrer-Policy", "no-referrer");
      if (
        !pending ||
        request.method !== "GET" ||
        request.headers.host !== new URL(pending.attempt.redirectUri).host
      ) {
        response.writeHead(404);
        response.end();
        return;
      }
      let callback: URL;
      try {
        callback = new URL(request.url ?? "/", pending.attempt.redirectUri);
        if (
          callback.origin !== new URL(pending.attempt.redirectUri).origin ||
          callback.pathname !== "/auth/callback"
        )
          throw new Error("callback_path");
      } catch {
        response.writeHead(404);
        response.end();
        return;
      }
      if (pending.attempt.consumed) {
        response.writeHead(409);
        response.end();
        return;
      }
      try {
        const credential = await finishAuthorization(pending.attempt, callback.href);
        const id = await saveRegistration(store, credential);
        await store.savePendingClient(null);
        response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Connected to MS Realty Butler. You may close this window.");
        clearTimeout(timer);
        server.close();
        done(id);
      } catch (error) {
        response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Authorization was not completed. Return to the operator command.");
        if (pending.attempt.consumed) {
          let failure = error;
          try {
            if (!selected && pending.attempt.clientId !== "dynamic_agent_client")
              await store.savePendingClient(pending.attempt.clientId);
          } catch {
            failure = new ChatGptError("chatgpt_client_retention_failed", "configuration");
          } finally {
            clearTimeout(timer);
            server.close();
            fail(
              new ChatGptError(
                failure instanceof ChatGptError ? failure.code : "chatgpt_identity_invalid",
                "reauthorize",
              ),
            );
          }
        }
      }
    });
    const timer = setTimeout(() => {
      server.close();
      fail(new ChatGptError("chatgpt_attempt_expired", "reauthorize"));
    }, 600_000);
    server.once("error", (error) => {
      clearTimeout(timer);
      fail(error);
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        clearTimeout(timer);
        server.close();
        fail(new ChatGptError("chatgpt_callback_invalid"));
        return;
      }
      try {
        pending = beginAuthorization({
          redirectUri: `http://127.0.0.1:${address.port}/auth/callback`,
          hostId,
          selected,
          issuedClientId,
        });
        // Hints are omitted: the printed URL never contains retained identity tokens or email.
        write(`Continue with ChatGPT:\n${pending.url}\n`);
      } catch {
        clearTimeout(timer);
        server.close();
        fail(new ChatGptError("chatgpt_callback_failed", "configuration"));
      }
    });
  });
}
export async function runCli(
  args: readonly string[],
  write: (text: string) => void = (text) => process.stdout.write(text),
  env: Record<string, string | undefined> = process.env,
) {
  const options = parseArguments(args);
  if (options.command === "help") {
    write(help);
    return;
  }
  const local = new FileChatGptStore(options.directory);
  if (options.command === "status") {
    write(`${JSON.stringify(await local.list())}\n`);
    return;
  }
  if (options.command === "login") {
    if (options.database) {
      const destination = openChatGptDatabaseStore(env, "operator");
      try {
        await local.initializeHost(await destination.store.hostId());
      } finally {
        await destination.close();
      }
    }
    const selected = options.account ? await readAccount(local, options.account) : null;
    const id = await login(local, selected, write);
    write(`Connected registration: ${id}\n`);
    return;
  }
  const id = options.account;
  if (!id) throw new ChatGptError("chatgpt_cli_account_required");
  if (options.command === "models") {
    const bearer = await accessToken(local, id);
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${bearer}` },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new ChatGptError("chatgpt_models_unavailable");
    const result = z
      .object({
        models: z
          .array(
            z.object({
              slug: z.string().min(1).max(256),
              display_name: z.string().min(1).max(512),
              visibility: z.string().min(1).max(32),
            }),
          )
          .max(4096),
      })
      // Catalogs include provider capability metadata and are larger than token responses.
      .safeParse(await boundedJson(response, 4 * 1024 * 1024));
    if (!result.success) throw new ChatGptError("chatgpt_models_invalid", "configuration");
    write(
      `${JSON.stringify(result.data.models.filter((model) => model.visibility === "list").map(({ slug, display_name }) => ({ slug, display_name })))}\n`,
    );
    return;
  }
  const database = options.database ? openChatGptDatabaseStore(env, "operator") : undefined;
  try {
    if (options.command === "import") {
      if (!database) throw new ChatGptError("chatgpt_cli_explicit_import_required");
      await local.withRegistration(id, async (session) => {
        const source = await session.load();
        if (!source?.tokens?.scopes.includes(directScope))
          throw new ChatGptError("chatgpt_plan_scope_missing");
        const identity = await verifiedIdentity(source.tokens.idToken, source.clientId);
        if (identity.subject !== source.subject) throw new ChatGptError("chatgpt_account_mismatch");
        await database.store.initializeHost(source.hostId);
        await saveRegistration(database.store, source);
        // Transfer ownership of this refresh session. Keep the local account/client mapping.
        await session.save({ ...source, tokens: null });
      });
      write(`Imported registration: ${id}. Local tokens cleared; destination owns refresh.\n`);
    } else if (options.command === "signout") {
      const store = database?.store ?? local;
      const confirmed = await store.withRegistration(id, async (session) => {
        const source = await session.load();
        if (!source) throw new ChatGptError("chatgpt_account_missing");
        const revoked = await revokeSession(source);
        await session.save({ ...source, tokens: null });
        return revoked;
      });
      write(
        confirmed
          ? "Signed out; renewable session revoked.\n"
          : "Local sign-out complete; remote revocation is unconfirmed. Disconnect MS Realty Butler in ChatGPT Settings.\n",
      );
    }
  } finally {
    await database?.close();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runCli(process.argv.slice(2)).catch((error: unknown) => {
    // Never serialize token endpoints, credential values, callback query strings or ID-token hints.
    process.stderr.write(
      `${error instanceof ChatGptError ? error.code : "chatgpt_operator_failed"}\n`,
    );
    process.exitCode = 1;
  });
}
