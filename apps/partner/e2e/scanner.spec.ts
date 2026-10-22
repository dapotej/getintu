import { expect, test, type Page } from "@playwright/test";
import { schema } from "@intu/db";
import { toLagos } from "@intu/rules";
import { and, eq } from "drizzle-orm";
import { createWorld, db, sql } from "./support/world";

type World = Awaited<ReturnType<typeof createWorld>>;

test.afterAll(async () => {
  await sql.end();
});

async function signIn(page: Page, world: World) {
  await page.goto("/");
  await page.getByLabel("Venue code").fill(world.loginCode.toLowerCase());
  await page.getByLabel("Your PIN").fill(world.pin);
  await page.getByRole("button", { name: "Start shift" }).click();
  await expect(page.getByText(world.venue.name)).toBeVisible();
}

/** What the camera does when it reads a QR code. */
const scan = (page: Page, code: string) => page.evaluate((c) => window.__intuScan?.(c), code);

const visitsOf = (membershipId: string) => db.select().from(schema.redemptions).where(eq(schema.redemptions.membershipId, membershipId));

test("door staff sign in with the venue code and their PIN, and stay signed in", async ({ page }) => {
  const world = await createWorld();
  await page.goto("/");
  await page.getByLabel("Venue code").fill(world.loginCode);
  await page.getByLabel("Your PIN").fill("000000");
  await page.getByRole("button", { name: "Start shift" }).click();
  await expect(page.getByText("That venue code and PIN don't match")).toBeVisible();

  await signIn(page, world);
  await page.reload();
  await expect(page.getByText(world.venue.name)).toBeVisible();
  // Installable: a manifest with icons.
  const manifest = await (await page.request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ display: "standalone", start_url: "/" });
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
});

test("approves a member online with their name and what's left, then calls the same code already claimed", async ({ page }) => {
  const world = await createWorld();
  await signIn(page, world);
  const code = world.code();
  await scan(page, code);
  await expect(page.getByText("Approved", { exact: true })).toBeVisible();
  await expect(page.getByText(world.member.fullName)).toBeVisible();
  await expect(page.getByText("3 left on this pass")).toBeVisible();
  await page.getByRole("button", { name: "Next scan" }).click();

  await scan(page, code);
  await expect(page.getByText("Declined", { exact: true })).toBeVisible();
  await expect(page.getByText(/Already claimed at \d\d:\d\d/)).toBeVisible();
  expect((await visitsOf(world.membership.id)).map((v) => [v.result, v.method])).toEqual(expect.arrayContaining([["approved", "online"], ["declined", "online"]]));
});

test("shows the result in under 2 seconds on a throttled 3G phone", async ({ page }) => {
  const world = await createWorld();
  await signIn(page, world);
  const cdp = await page.context().newCDPSession(page);
  // Chrome's "Fast 3G" profile and a 4x slower CPU, as for a mid-range Android phone.
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 562.5, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const started = Date.now();
  await scan(page, world.code());
  await expect(page.getByText("Approved", { exact: true })).toBeVisible();
  const elapsed = Date.now() - started;
  console.log(`Scan to result on throttled 3G: ${elapsed} ms`);
  expect(elapsed).toBeLessThan(2000);
});

test("accepts the 6-digit backup code when the camera can't read the pass", async ({ page }) => {
  const world = await createWorld();
  await db.insert(schema.passCodes).values({ membershipId: world.membership.id, code: "482913", validOn: toLagos(new Date()).date }).onConflictDoNothing();
  await signIn(page, world);
  await page.getByRole("button", { name: "Enter backup code" }).click();
  await page.getByLabel("Backup code").fill("482913");
  await page.getByRole("button", { name: "Check" }).click();
  await expect(page.getByText("Approved", { exact: true })).toBeVisible();
  await expect(page.getByText(world.member.fullName)).toBeVisible();
});

test("scans with no signal, survives a reload offline, and syncs when signal returns", async ({ page, context }) => {
  const world = await createWorld();
  await signIn(page, world);
  await page.evaluate(() => navigator.serviceWorker.ready);

  await context.setOffline(true);
  const code = world.code();
  await scan(page, code);
  await expect(page.getByText("Approved", { exact: true })).toBeVisible();
  await expect(page.getByText("Offline approval: checked on this phone")).toBeVisible();
  await expect(page.getByRole("status")).toContainText("1 waiting");

  // The scanner reopens with no signal, and still knows the visit it holds.
  await page.reload();
  await expect(page.getByText(world.venue.name)).toBeVisible();
  await scan(page, code);
  await expect(page.getByText(/Already claimed/)).toBeVisible();
  await page.getByRole("button", { name: "Next scan" }).click();
  // Backup codes need the server.
  await page.getByRole("button", { name: "Enter backup code" }).click();
  await page.getByLabel("Backup code").fill("123456");
  await page.getByRole("button", { name: "Check" }).click();
  await expect(page.getByText("Backup codes need signal. Scan the QR code instead.")).toBeVisible();
  expect(await visitsOf(world.membership.id)).toHaveLength(0);

  await context.setOffline(false);
  await expect(page.getByRole("status")).toHaveCount(0, { timeout: 15_000 });
  const visits = await visitsOf(world.membership.id);
  expect(visits.map((v) => [v.result, v.method, v.flagged])).toEqual([["approved", "offline", false]]);
});

test("flags to intu an offline approval the server says broke a rule, instead of reversing it", async ({ page, context }) => {
  const world = await createWorld({ quantity: 1 });
  await signIn(page, world);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await scan(page, world.code());
  await expect(page.getByText("0 left on this pass")).toBeVisible();
  await page.getByRole("button", { name: "Next scan" }).click();

  // Signal drops; the phone doesn't know about the visit it just sent to the server.
  await context.setOffline(true);
  await scan(page, world.code(new Date(Date.now() + 30_000)));
  await expect(page.getByText("Offline approval: checked on this phone")).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByRole("status")).toHaveCount(0, { timeout: 15_000 });

  const flagged = await db.select().from(schema.redemptions).where(and(eq(schema.redemptions.membershipId, world.membership.id), eq(schema.redemptions.flagged, true)));
  expect(flagged).toHaveLength(1);
  expect(flagged[0]?.flagReason).toMatch(/Offline visit broke a rule/);
  await page.getByRole("button", { name: "Today" }).click();
  await expect(page.getByText("sent to intu")).toBeVisible();
});

test("lists today's visits and reports a problem with one to intu", async ({ page }) => {
  const world = await createWorld({ offers: 2 });
  await signIn(page, world);
  await page.getByRole("button", { name: "Entry + F&B credit" }).click();
  await page.getByRole("button", { name: "More people" }).click();
  await scan(page, world.code());
  await expect(page.getByText("Entry + F&B credit · party of 2")).toBeVisible();
  await page.getByRole("button", { name: "Next scan" }).click();

  await page.getByRole("button", { name: "Today" }).click();
  await expect(page.getByText("Visits · 1 approved")).toBeVisible();
  await expect(page.getByText(world.member.fullName)).toBeVisible();
  await page.getByRole("button", { name: "Report" }).click();
  await page.getByLabel("What happened").selectOption({ label: "Wrong person" });
  await page.getByLabel("Details for intu").fill("TEST e2e: face didn't match");
  await page.getByRole("button", { name: "Send to intu" }).click();
  await expect(page.getByText("sent to intu")).toBeVisible();
  const [visit] = await visitsOf(world.membership.id);
  expect(visit?.flagReason).toContain("Wrong person. TEST e2e: face didn't match");
});
