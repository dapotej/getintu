import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "@intu/db";
import { createApp } from "../src/app.ts";

const url = process.env.DATABASE_URL;

describe.runIf(url)("GET /health", () => {
  const { db, sql } = createDb(url ?? "", { max: 1 });
  afterAll(() => sql.end());

  it("reports ok when the database answers", async () => {
    const res = await createApp({ db }).request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", database: "ok" });
  });
});

describe("GET /health without a database", () => {
  it("reports degraded with 503", async () => {
    const { db, sql } = createDb("postgres://nobody:nothing@127.0.0.1:1/none", { max: 1 });
    const res = await createApp({ db }).request("/health");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "degraded", database: "down" });
    await sql.end();
  });
});
