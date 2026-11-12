import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

/**
 * Uniform error strategy for route handlers:
 *  - ZodError  → 400 with field issues (safe to expose)
 *  - HttpError → its status + message
 *  - anything else → 500 with a generic message; details only in server logs
 */
export function route<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof ZodError) {
        return NextResponse.json({ error: "Requête invalide", issues: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 400 });
      }
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      console.error("[api] unhandled error", e);
      return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
    }
  };
}

/** Aggregates only change on import, so public data responses are cacheable. */
export const PUBLIC_CACHE = { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" };

/**
 * CSRF defence-in-depth for cookie-authenticated mutations (the session
 * cookie is already SameSite=Lax): reject requests whose Origin is not ours.
 */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) throw new HttpError(403, "Origine refusée");
}
