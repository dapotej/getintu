import { z } from "zod";

const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8787),
  DATABASE_URL: z.url(),
  // Supabase Auth: tokens are verified against the project's published signing keys.
  SUPABASE_URL: z.url(),
  // Server-only. Used to invite and deactivate staff. Never sent to a browser.
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // Only for projects still on Supabase's legacy shared JWT secret.
  SUPABASE_JWT_SECRET: z.string().min(1).optional(),
  // Browser origins allowed to call the API, comma-separated.
  CORS_ORIGINS: z.string().default("http://localhost:3001"),
  // Where Supabase sends invited staff to set their password.
  ADMIN_INVITE_REDIRECT_URL: z.url().optional(),
});

export type Env = z.infer<typeof Env>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return Env.parse(source);
}
