/** The few Supabase Auth admin calls the API makes, behind an interface so tests can fake them. */
export interface AuthAdmin {
  /** Emails an invitation; returns the new auth user's id. */
  inviteUser(email: string, redirectTo?: string): Promise<{ id: string }>;
  /** Signs a user out everywhere and stops them signing in. */
  banUser(id: string): Promise<void>;
}

export function createSupabaseAuthAdmin(opts: { supabaseUrl: string; serviceRoleKey: string }): AuthAdmin {
  const base = `${opts.supabaseUrl.replace(/\/$/, "")}/auth/v1`;
  // A new-style secret key (sb_secret_…) goes in the apikey header only; Supabase turns it into a
  // service-role token. A legacy service_role key is itself a JWT and is also sent as the bearer.
  const legacyJwt = opts.serviceRoleKey.startsWith("eyJ");
  const headers = { apikey: opts.serviceRoleKey, ...(legacyJwt ? { authorization: `Bearer ${opts.serviceRoleKey}` } : {}), "content-type": "application/json" };

  const call = async (path: string, init: RequestInit) => {
    const res = await fetch(`${base}${path}`, { ...init, headers });
    if (!res.ok) throw new Error(`Supabase Auth ${path} failed: ${res.status} ${await res.text()}`);
    return res.json() as Promise<Record<string, unknown>>;
  };

  return {
    async inviteUser(email, redirectTo) {
      const user = await call(`/invite${redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : ""}`, {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      if (typeof user["id"] !== "string") throw new Error("Supabase invite returned no user id");
      return { id: user["id"] };
    },
    async banUser(id) {
      await call(`/admin/users/${id}`, { method: "PUT", body: JSON.stringify({ ban_duration: "876000h" }) });
    },
  };
}
