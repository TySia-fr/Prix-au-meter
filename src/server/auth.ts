import "server-only";
import { betterAuth } from "better-auth";
import { headers } from "next/headers";
import { getPool } from "./pool";

/**
 * Email + password accounts (A7). Better Auth stores sessions server-side
 * (table "session"), sets an httpOnly/SameSite=Lax cookie, hashes passwords
 * with scrypt, rate-limits auth endpoints and checks the Origin header on
 * state-changing requests (CSRF).
 */
export const auth = betterAuth({
  database: getPool(),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  emailAndPassword: { enabled: true, minPasswordLength: 10, maxPasswordLength: 128, autoSignIn: true },
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  rateLimit: { enabled: process.env.NODE_ENV === "production" && process.env.E2E !== "1", window: 60, max: 30 },
  advanced: { useSecureCookies: process.env.NODE_ENV === "production" && process.env.BETTER_AUTH_URL?.startsWith("https") },
});

export async function getSessionUser(): Promise<{ id: string; email: string; name: string } | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session ? { id: session.user.id, email: session.user.email, name: session.user.name } : null;
}
