import { afterEach, describe, expect, it, vi } from "vitest";
import { createSupabaseAuthAdmin } from "../src/auth/supabase-admin.ts";

describe("Supabase Auth admin calls", () => {
  afterEach(() => vi.unstubAllGlobals());

  const headersSent = async (serviceRoleKey: string) => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "user-1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await createSupabaseAuthAdmin({ supabaseUrl: "https://project.supabase.co", serviceRoleKey }).inviteUser("staff@example.com", "https://admin.example.com/set-password");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    return { url, headers: init.headers as Record<string, string> };
  };

  it("sends a new-style secret key as the apikey only", async () => {
    const { url, headers } = await headersSent("sb_secret_test");
    expect(url).toBe("https://project.supabase.co/auth/v1/invite?redirect_to=https%3A%2F%2Fadmin.example.com%2Fset-password");
    expect(headers).toMatchObject({ apikey: "sb_secret_test" });
    expect(headers).not.toHaveProperty("authorization");
  });

  it("also sends a legacy service_role key as the bearer token", async () => {
    const { headers } = await headersSent("eyJlegacy.jwt.key");
    expect(headers).toMatchObject({ apikey: "eyJlegacy.jwt.key", authorization: "Bearer eyJlegacy.jwt.key" });
  });
});
