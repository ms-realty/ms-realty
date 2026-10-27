import { expect, it } from "vitest";
import { getEnv } from "../config/env";
import {
  clientInputClearCookie,
  clientInputCookieName,
  clientInputLifetime,
  openClientInput,
  sealClientInput,
} from "./client-input";

it("C01 encrypted native return binds host, locale, expiry and integrity without readable email", () => {
  const env = getEnv(),
    now = 1000,
    input = {
      email: "synthetic@example.test",
      locale: "he" as const,
      returnTo: "/he/saved/import",
    };
  const sealed = sealClientInput(input, env, now);
  expect(sealed).not.toContain(input.email);
  expect(openClientInput(sealed, "he", env, now)).toMatchObject(input);
  expect(openClientInput(sealed, "de", env, now)).toBeNull();
  expect(openClientInput(sealed, "he", env, now + clientInputLifetime)).toBeNull();
  expect(openClientInput(`${sealed.slice(0, -4)}AAAA`, "he", env, now)).toBeNull();
  expect(
    openClientInput(
      sealed,
      "he",
      { ...env, hosts: { ...env.hosts, client: "https://other.example.test" } },
      now,
    ),
  ).toBeNull();
  expect(clientInputClearCookie(env)).toContain(`${clientInputCookieName(env)}=; Path=/`);
  expect(clientInputClearCookie(env)).not.toContain("Domain=");
});
