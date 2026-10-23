import { expect, test, type Page } from "@playwright/test";
import { schema } from "@intu/db";
import { parseSecretKey, verifyCode } from "@intu/qr";
import { eq } from "drizzle-orm";
import { fakeSupabase, TEST_CODE } from "./support/fake-supabase";
import { E2E_QR_SIGNING_KEY } from "./support/keys";
import { addTravelAndDoctor, createWorld, db, fakePhone, sql } from "./support/world";

test.afterAll(async () => {
  await sql.end();
});

const server = parseSecretKey(E2E_QR_SIGNING_KEY);
const publicKeys = new Map([[server.keyId, server.publicKey]]);

async function signIn(page: Page, phone: string) {
  await fakeSupabase(page);
  await page.goto("/");
  await page.getByLabel("Phone number").fill(phone.replace(/^\+999/, "+999 "));
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel("Code").fill("000000");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("That code didn't work")).toBeVisible();
  await page.getByLabel("Code").fill(TEST_CODE);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Takes the selfie: the web build's camera is a file picker, given a JPEG made on the spot. */
async function takePhoto(page: Page) {
  const shot = await page.screenshot({ type: "jpeg", quality: 60, clip: { x: 0, y: 0, width: 200, height: 200 } });
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Take photo" }).click();
  await (await chooser).setFiles({ name: "selfie.jpg", mimeType: "image/jpeg", buffer: shot });
  await page.getByRole("button", { name: "Use this photo" }).click();
}

const passCode = (page: Page) => page.evaluate(() => document.body.dataset["passCode"] ?? "");

test("a member signs in, adds a photo, and shows a pass that scanners accept", async ({ page }) => {
  const world = await createWorld();
  await signIn(page, world.member.phone);
  await expect(page.getByRole("heading", { name: "Add your photo" })).toBeVisible();
  await takePhoto(page);

  await expect(page.getByText(world.member.fullName)).toBeVisible();
  await expect(page.getByText(`${world.plan.name} · ${world.membership.passNumber}`)).toBeVisible();
  await expect(page.getByLabel("Pass QR code")).toBeVisible();
  await expect(page.getByText(/New code in \d+s/)).toBeVisible();
  await expect(page.getByText(/Backup code \d{6}/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Message the concierge" })).toBeVisible();
  // The plan has no doctor-on-call benefit.
  await expect(page.getByRole("button", { name: "Doctor on call" })).toHaveCount(0);

  // The code on screen is one a scanner verifies, for this member's pass and this phone.
  const code = await passCode(page);
  const verified = verifyCode(code, { publicKeys });
  expect(verified.ok && verified.pass.membershipId).toBe(world.membership.id);
  const [device] = await db.select().from(schema.devices).where(eq(schema.devices.memberId, world.member.id));
  expect(verified.ok && verified.pass.deviceId).toBe(device?.id);
  expect(device?.platform).toBe("web");
  const [member] = await db.select().from(schema.members).where(eq(schema.members.id, world.member.id));
  expect(member?.photoPath).toBeTruthy();
});

test("benefits show what's left; discover marks what the plan includes; a booking goes to the concierge", async ({ page }) => {
  const world = await createWorld();
  await db.update(schema.members).set({ photoPath: `${world.member.id}/e2e.jpg` }).where(eq(schema.members.id, world.member.id));
  await signIn(page, world.member.phone);
  // A member with a photo goes straight to the pass.
  await expect(page.getByLabel("Pass QR code")).toBeVisible();

  await page.getByRole("tab", { name: "Benefits" }).click();
  await expect(page.getByText("Beach Clubs")).toBeVisible();
  await expect(page.getByText("4 of 4 left")).toBeVisible();

  await page.getByRole("tab", { name: "Discover" }).click();
  const beach = page.getByRole("link", { name: world.beach.name });
  await expect(beach).toContainText("In your plan");
  await expect(page.getByRole("link", { name: world.spa.name })).not.toContainText("In your plan");
  await page.getByRole("checkbox", { name: "In my plan" }).click();
  await expect(page.getByRole("link", { name: world.spa.name })).toHaveCount(0);
  await page.getByRole("radio", { name: "Night" }).click();
  await expect(beach).toHaveCount(0);
  await page.getByRole("radio", { name: "Day" }).click();

  await beach.click();
  await expect(page.getByRole("heading", { name: world.beach.name })).toBeVisible();
  await expect(page.getByText("Included", { exact: true }).first()).toBeVisible();
  // Entry is a scan at the door; only the cabana is booked ahead.
  await expect(page.getByText("Show your pass at the door")).toBeVisible();
  await expect(page.getByRole("button", { name: "Show my pass" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Request a booking" })).toHaveCount(0);
  await page.getByRole("button", { name: "Book ahead" }).click();
  // The venue page stays loaded behind the form.
  await expect(page.getByText("Cabana/daybed").last()).toBeVisible();
  await page.getByRole("radiogroup", { name: "Day" }).getByRole("radio").nth(1).click();
  await page.getByRole("button", { name: "More" }).click();
  await page.getByLabel("Anything the venue should know").fill("TEST e2e: a birthday");
  await page.getByRole("button", { name: "Send request" }).click();

  await expect(page.getByRole("heading", { name: "Bookings" })).toBeVisible();
  // The Discover tab stays loaded behind, so the venue's name is on the page twice.
  await expect(page.getByText(world.beach.name).last()).toBeVisible();
  await expect(page.getByText("Requested")).toBeVisible();
  const [booking] = await db.select().from(schema.bookings).where(eq(schema.bookings.memberId, world.member.id));
  expect(booking).toMatchObject({ status: "requested", partySize: 2, notes: "TEST e2e: a birthday", venueId: world.beach.id });
  expect(booking?.offerId).not.toBe(world.beachOffer.id);
});

test("someone new signs up with their details and the terms, then sees they have no pass yet", async ({ page }) => {
  const phone = fakePhone();
  await signIn(page, phone);
  await expect(page.getByRole("heading", { name: "Welcome to intu" })).toBeVisible();
  await page.getByLabel("Full name").fill("TEST E2E Newcomer");
  await page.getByLabel("Country").fill("gb");
  await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
  await page.getByRole("checkbox", { name: "I agree to the intu terms and privacy notice" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await takePhoto(page);
  await expect(page.getByText("No pass yet")).toBeVisible();
  const [member] = await db.select().from(schema.members).where(eq(schema.members.phone, phone));
  expect(member).toMatchObject({ fullName: "TEST E2E Newcomer", country: "GB", isTest: true });

  await page.getByRole("tab", { name: "Account" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByLabel("Phone number")).toBeVisible();
});

test("with no signal the pass keeps showing and makes a new code every 30 seconds", async ({ page, context }) => {
  const world = await createWorld();
  await db.update(schema.members).set({ photoPath: `${world.member.id}/e2e.jpg` }).where(eq(schema.members.id, world.member.id));
  await page.clock.install();
  await signIn(page, world.member.phone);
  await expect(page.getByLabel("Pass QR code")).toBeVisible();
  // The web build fetches each screen's code on first visit (the phone app is one bundle), so
  // open Benefits once while there's signal.
  await page.getByRole("tab", { name: "Benefits" }).click();
  await expect(page.getByText("4 of 4 left")).toBeVisible();
  await page.getByRole("tab", { name: "Pass" }).click();
  const first = await passCode(page);

  await context.setOffline(true);
  await page.clock.fastForward(31_000);
  await expect.poll(() => passCode(page)).not.toBe(first);
  const second = await passCode(page);
  const verified = verifyCode(second, { publicKeys, now: new Date(await page.evaluate(() => Date.now())) });
  expect(verified.ok).toBe(true);
  // Other screens show what was saved.
  await page.getByRole("tab", { name: "Benefits" }).click();
  await expect(page.getByText("Offline: showing what was saved")).toBeVisible();
  await expect(page.getByText("4 of 4 left")).toBeVisible();
  await context.setOffline(false);
});

test("a benefit's page says how to use it: show the pass, request an airport service with the flight, or call the doctor", async ({ page }) => {
  const world = await createWorld();
  const { desk } = await addTravelAndDoctor(world);
  await db.update(schema.members).set({ photoPath: `${world.member.id}/e2e.jpg` }).where(eq(schema.members.id, world.member.id));
  await signIn(page, world.member.phone);
  await expect(page.getByLabel("Pass QR code")).toBeVisible();
  // Doctor on call is on the pass, from the medical partner's line.
  await expect(page.getByRole("button", { name: "Doctor on call" })).toBeVisible();

  await page.getByRole("tab", { name: "Benefits" }).click();
  await page.getByRole("link", { name: "Beach Clubs" }).click();
  await expect(page.getByRole("heading", { name: "Beach Clubs" })).toBeVisible();
  // The Benefits list stays loaded behind the page, so the count is on it twice.
  await expect(page.getByText("4 of 4 left").last()).toBeVisible();
  await expect(page.getByText("Show your pass at the door.", { exact: false })).toBeVisible();
  await expect(page.getByText("Once per venue per day")).toBeVisible();
  await expect(page.getByRole("link", { name: world.beach.name })).toBeVisible();
  await expect(page.getByRole("link", { name: world.spa.name })).toHaveCount(0);
  await page.goBack();

  await page.getByRole("link", { name: "Doctor on call" }).click();
  await expect(page.getByText("Calls aren't counted", { exact: false })).toBeVisible();
  // "Call now", or "Call <line>" for each line when there's more than one.
  await expect(page.getByRole("button", { name: /^Call / }).first()).toBeVisible();
  await page.goBack();

  await page.getByRole("link", { name: "Meet-and-assist" }).click();
  await expect(page.getByText("Request it with your flight.", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: desk.name }).click();
  await page.getByRole("radiogroup", { name: "Day" }).getByRole("radio").nth(1).click();
  await expect(page.getByRole("button", { name: "Send request" })).toBeDisabled();
  await page.getByLabel("Flight number").fill("ba75");
  await page.getByLabel("Lands at").fill("15:20");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByText("Arriving on BA75 at 15:20")).toBeVisible();
  const [booking] = await db.select().from(schema.bookings).where(eq(schema.bookings.venueId, desk.id));
  expect(booking).toMatchObject({ status: "requested", trip: { direction: "arrival", flightNumber: "BA75", time: "15:20" } });
});
