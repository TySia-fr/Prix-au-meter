import { expect, request as pwRequest, test, type APIRequestContext } from "@playwright/test";
import { PASSWORD, uniqueEmail } from "./helpers";

/** Real HTTP + real session cookies: two users, each with their own cookie jar. */
async function signUp(baseURL: string, tag: string): Promise<APIRequestContext> {
  const ctx = await pwRequest.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL } });
  const res = await ctx.post("/api/auth/sign-up/email", { data: { email: uniqueEmail(tag), password: PASSWORD, name: tag } });
  expect(res.status(), await res.text()).toBe(200);
  return ctx;
}

test("a user cannot read or modify another user's favourites", async ({ baseURL }) => {
  const alice = await signUp(baseURL!, "alice");
  const bob = await signUp(baseURL!, "bob");

  const created = await alice.post("/api/favorites", { data: { irisCode: "341720102" } });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()) as { id: string };

  // Bob cannot see Alice's favourite…
  const bobList = await (await bob.get("/api/favorites")).json();
  expect(bobList.favorites.map((f: { id: string }) => f.id)).not.toContain(id);

  // …nor delete it by id (404, not 403: existence is not revealed)
  expect((await bob.delete(`/api/favorites/${id}`)).status()).toBe(404);

  // Alice's favourite is untouched
  const aliceList = await (await alice.get("/api/favorites")).json();
  expect(aliceList.favorites.map((f: { id: string }) => f.id)).toContain(id);

  // Anonymous access is refused
  const anon = await pwRequest.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL! } });
  expect((await anon.get("/api/favorites")).status()).toBe(401);
  expect((await anon.delete(`/api/favorites/${id}`)).status()).toBe(401);

  // Cross-site request with Alice's cookie is refused (CSRF defence)
  const forged = await alice.post("/api/favorites", { data: { irisCode: "341720101" }, headers: { Origin: "https://evil.example" } });
  expect(forged.status()).toBe(403);

  // Input is validated server-side (Zod)
  expect((await alice.post("/api/favorites", { data: { irisCode: "<script>" } })).status()).toBe(400);
  expect((await alice.delete("/api/favorites/not-a-uuid")).status()).toBe(400);

  // Alice can delete her own
  expect((await alice.delete(`/api/favorites/${id}`)).status()).toBe(204);
  await Promise.all([alice.dispose(), bob.dispose(), anon.dispose()]);
});
