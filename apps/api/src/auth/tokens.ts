import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

/** The claims the API relies on from a Supabase Auth access token. */
export interface AccessClaims {
  /** Supabase Auth user id. */
  sub: string;
  /** "aal2" once the user has passed two-step verification in this session. */
  aal: "aal1" | "aal2";
  email?: string;
  /** Members sign in by phone; E.164 with the leading +. */
  phone?: string;
}

export type TokenVerifier = (token: string) => Promise<AccessClaims>;

export class InvalidTokenError extends Error {}

/**
 * Verifies Supabase access tokens. New Supabase projects sign with asymmetric keys published
 * at the project's JWKS URL; pass `jwks` to override it (tests), or `secret` for a project
 * still on the legacy shared secret.
 */
export function createTokenVerifier(opts: { supabaseUrl: string; jwks?: JWTVerifyGetKey; secret?: string }): TokenVerifier {
  const issuer = `${opts.supabaseUrl.replace(/\/$/, "")}/auth/v1`;
  const key = opts.secret ? new TextEncoder().encode(opts.secret) : (opts.jwks ?? createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`)));

  return async (token) => {
    try {
      const { payload } =
        key instanceof Uint8Array
          ? await jwtVerify(token, key, { issuer, audience: "authenticated" })
          : await jwtVerify(token, key, { issuer, audience: "authenticated" });
      if (typeof payload.sub !== "string") throw new InvalidTokenError("Token has no subject");
      const aal = payload["aal"] === "aal2" ? "aal2" : "aal1";
      const claims: AccessClaims = { sub: payload.sub, aal };
      if (typeof payload["email"] === "string" && payload["email"]) claims.email = payload["email"];
      // Supabase gives the phone without its +.
      if (typeof payload["phone"] === "string" && payload["phone"]) claims.phone = `+${payload["phone"].replace(/^\+/, "")}`;
      return claims;
    } catch (err) {
      if (err instanceof InvalidTokenError) throw err;
      throw new InvalidTokenError(err instanceof Error ? err.message : "Invalid token");
    }
  };
}
