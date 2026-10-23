import { randomInt, randomUUID } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { createDb, one, schema } from "@intu/db";
import { eq } from "drizzle-orm";
import { signIn } from "./support/session";

/** Picks a catalogue entry in a category dropdown by its name (options are indented by depth). */
async function pickCategory(select: Locator, name: string) {
  const value = await select.locator("option", { hasText: name }).first().getAttribute("value");
  await select.selectOption(value ?? "");
}

/** The card with this heading, and the side panel that's open. */
const cardOf = (page: Page, name: string) => page.locator("section").filter({ has: page.getByRole("heading", { name, exact: true }) });
const panelOf = (page: Page) => page.getByRole("dialog");

test.beforeEach(async ({ page }) => {
  await signIn(page, "founder");
  await expect(page.getByRole("heading", { name: /^Hello/ })).toBeVisible();
});

test("find a member, see their allowances, suspend and reinstate with a reason", async ({ page }) => {
  await page.getByLabel("Search members").fill("TEST Kemi");
  await page.getByLabel("Search members").press("Enter");
  await page.getByRole("link", { name: "TEST Kemi Crew" }).click();

  await expect(page.getByRole("heading", { name: "TEST Kemi Crew" })).toBeVisible();
  const card = page.locator("section", { hasText: "TEST December Pass Crew" });
  await expect(card.getByText("Shared by Crew")).toHaveCount(3);
  await expect(card.getByText("Hosted member access")).toBeVisible();
  await expect(card).toContainText("Beach Clubs");

  await card.getByRole("button", { name: "Suspend" }).click();
  await card.getByLabel("Reason").fill("TEST e2e: phone reported lost");
  await card.getByRole("button", { name: "Suspend membership" }).click();
  await expect(card.getByText("Suspended", { exact: true })).toBeVisible();

  await card.getByRole("button", { name: "Reinstate" }).click();
  await card.getByLabel("Reason").fill("TEST e2e: new phone set up");
  await card.getByRole("button", { name: "Reinstate membership" }).click();
  await expect(card.getByText("Active", { exact: true })).toBeVisible();
});

test("add a member and give them a gifted pass", async ({ page }) => {
  const name = `TEST E2E ${randomUUID().slice(0, 6)}`;
  await page.goto("/members");
  await page.getByRole("button", { name: "New member" }).click();
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Phone (WhatsApp)").fill(`+999 ${randomInt(10 ** 8, 10 ** 9)}`);
  await page.getByRole("button", { name: "Add member" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();

  await page.getByRole("button", { name: "Add a membership" }).click();
  await page.getByLabel("Plan").selectOption({ label: "TEST December Pass Plus" });
  await page.getByLabel("Note").fill("TEST e2e gift");
  await page.getByRole("button", { name: "Add membership", exact: true }).click();
  const card = page.locator("section", { hasText: "TEST December Pass Plus" });
  await expect(card.getByText("Golf")).toBeVisible();
  await expect(card.getByText(/Gift/)).toBeVisible();
});

test("create a plan, price it, and open a benefit to top-tier venues", async ({ page }) => {
  const code = `E2E-${randomUUID().slice(0, 6).toUpperCase()}`;
  const panel = panelOf(page);
  await page.goto("/plans");
  await page.getByRole("button", { name: "New plan" }).click();
  await panel.getByLabel("Name").fill(`TEST Gold ${code}`);
  await panel.getByLabel("Duration (days)").fill("365");
  await panel.getByRole("button", { name: "Create plan" }).click();
  await expect(page.getByRole("heading", { name: `TEST Gold ${code}` })).toBeVisible();
  // The code comes from the name.
  await expect(page.getByText(/^TEST-GOLD-E2E-[A-Z0-9]+/)).toBeVisible();

  await cardOf(page, "Prices").getByRole("button", { name: "Edit" }).click();
  await panel.getByLabel("NGN").fill("1,500,000");
  await panel.getByLabel("GBP").fill("849.99");
  await panel.getByRole("button", { name: "Save prices" }).click();
  await expect(panel).toHaveCount(0);
  await expect(cardOf(page, "Prices")).toContainText("£849.99");

  await cardOf(page, "Benefits").getByRole("button", { name: "Add benefit" }).click();
  await pickCategory(panel.getByLabel("Covers"), "Spa & Massage");
  await panel.getByLabel("Quantity").fill("3");
  await panel.getByLabel("Period").selectOption({ label: "Per membership year" });
  await panel.getByRole("button", { name: "Add benefit" }).click();
  // The benefits table comes first; the cost and margin table lists the benefit again.
  const row = page.getByRole("row", { name: /Spa & Massage/ }).first();
  await expect(row).toContainText("per membership year");

  await row.getByRole("button", { name: "Edit" }).click();
  await panel.getByLabel("Top tier").check();
  await panel.getByLabel("Uses one per person in the party").check();
  await panel.getByRole("button", { name: "Save benefit" }).click();
  const saved = page.getByRole("row", { name: /Spa & Massage/ }).first();
  await expect(saved).toContainText("one per person");
  await expect(saved).toContainText("top");

  await page.goto("/plans");
  await expect(page.getByRole("row", { name: new RegExp(code) })).toContainText("₦1,500,000");
  await expect(page.getByRole("row", { name: new RegExp(code) })).toContainText("£849.99");
});

test("Settings holds the team and the exchange rates for margins", async ({ page }) => {
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/settings\/team$/);
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Team" })).toHaveCount(0);
  await page.getByRole("button", { name: "Invite someone" }).click();
  await expect(panelOf(page).getByRole("button", { name: "Send invitation" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panelOf(page)).toHaveCount(0);

  await page.getByRole("navigation", { name: "Settings" }).getByRole("link", { name: "Exchange rates" }).click();
  const rates = cardOf(page, "Exchange rates for margins");
  await rates.getByRole("button", { name: "Edit" }).click();
  await panelOf(page).getByLabel("Naira per £1").fill("1,770");
  await panelOf(page).getByRole("button", { name: "Save rates" }).click();
  await expect(rates).toContainText("₦1,770");
  await page.goto("/plans");
  await expect(page.getByText("Exchange rates for margins")).toHaveCount(0);
});

test("see a plan's cost and margin, and price a benefit no venue offers yet", async ({ page }) => {
  const code = `E2E-${randomUUID().slice(0, 6).toUpperCase()}`;
  const panel = panelOf(page);
  await page.goto("/plans");
  await page.getByRole("button", { name: "New plan" }).click();
  await panel.getByLabel("Name").fill(`TEST Costed ${code}`);
  await panel.getByLabel("Season starts").fill("2026-12-01");
  await panel.getByLabel("Season ends").fill("2027-01-10");
  await panel.getByRole("button", { name: "Create plan" }).click();
  await expect(page.getByRole("heading", { name: `TEST Costed ${code}` })).toBeVisible();

  await cardOf(page, "Prices").getByRole("button", { name: "Edit" }).click();
  await panel.getByLabel("NGN").fill("100,000");
  await panel.getByRole("button", { name: "Save prices" }).click();
  await cardOf(page, "Details").getByRole("button", { name: "Edit" }).click();
  await panel.getByLabel("Fixed costs per member (₦)").fill("10,000");
  await panel.getByRole("button", { name: "Save details" }).click();
  await expect(cardOf(page, "Details")).toContainText("₦10,000");

  // No listing offers theatre tickets yet, so it has nothing to be costed from.
  await cardOf(page, "Benefits").getByRole("button", { name: "Add benefit" }).click();
  await pickCategory(panel.getByLabel("Covers"), "Theatre ticket");
  await panel.getByLabel("Quantity").fill("2");
  await panel.getByRole("button", { name: "Add benefit" }).click();
  const cost = page.getByRole("row", { name: /Theatre ticket/ }).last();
  await expect(cost).toContainText("No listing offers it yet: set a planning cost");
  // Flagged on the benefit too, and still flagged once it has a planning cost.
  await expect(page.getByRole("row", { name: /Theatre ticket/ }).first()).toContainText("No partner yet");
  await expect(page.getByText("Leaves out 1 unpriced benefit")).toBeVisible();

  await page.getByRole("row", { name: /Theatre ticket/ }).first().getByRole("button", { name: "Edit" }).click();
  await panel.getByLabel("Planning cost (₦)").fill("20,000");
  await panel.getByLabel("Expected use (%)").fill("50");
  await panel.getByRole("button", { name: "Save benefit" }).click();
  await expect(cost).toContainText("Planning cost");
  await expect(cost).toContainText("₦40,000");
  await expect(page.getByRole("row", { name: /Theatre ticket/ }).first()).toContainText("No partner yet");
  await expect(cost).toContainText("₦20,000");
  await expect(page.getByRole("row", { name: /Total cost/ })).toContainText("₦50,000");
  await expect(page.getByRole("row", { name: /Total cost/ })).toContainText("₦30,000");
  await expect(page.getByText("₦70,000 70%")).toBeVisible();
});

test("add a partner and a late-night top-tier venue with a naira offer", async ({ page }) => {
  const tag = randomUUID().slice(0, 6);
  const panel = panelOf(page);
  await page.goto("/partners");
  await page.getByRole("button", { name: "Add partner" }).click();
  await panel.getByLabel("Legal name").fill(`TEST Nights ${tag} Ltd`);
  await panel.getByLabel("Trading name").fill(`TEST Nights ${tag}`);
  await panel.getByRole("button", { name: "Add partner" }).click();
  await expect(page.getByRole("heading", { name: `TEST Nights ${tag}` })).toBeVisible();

  await page.getByRole("button", { name: "Add listing" }).click();
  // The fields follow the type: a phone service has a service line and no map location.
  await panel.getByLabel("Type").selectOption({ label: "A service by phone or video" });
  await expect(panel.getByLabel("Kind of service")).toBeVisible();
  await expect(panel.getByLabel("Service line")).toBeVisible();
  await expect(panel.getByLabel("Map location")).toHaveCount(0);
  await panel.getByLabel("Type").selectOption({ label: "A place members visit" });
  await expect(panel.getByLabel("Service line")).toHaveCount(0);
  await panel.getByLabel("Name").fill(`TEST Rooftop ${tag}`);
  await panel.getByLabel("Area").fill("Ikoyi");
  await pickCategory(panel.getByLabel("Kind of place"), "Members' Clubs");
  await panel.getByLabel("Tier").selectOption({ label: "Top tier" });
  await panel.getByLabel("Sat opens").fill("22:00");
  await panel.getByLabel("Sat closes").fill("04:00");
  await panel.getByRole("button", { name: "Add listing" }).click();

  await expect(page.getByRole("heading", { name: `TEST Rooftop ${tag}` })).toBeVisible();
  const details = cardOf(page, "Listing");
  await expect(details.getByRole("listitem").filter({ hasText: "Sat" })).toContainText("22:00–04:00");
  await expect(details.getByRole("listitem").filter({ hasText: "Sun" })).toContainText("Closed");

  await cardOf(page, "Offers").getByRole("button", { name: "Add offer" }).click();
  await pickCategory(panel.getByLabel("Service"), "Hosted member access");
  await panel.getByLabel("Rate (₦ per visit)").fill("25,000");
  await panel.getByLabel("Retail (₦)").fill("37,500");
  await panel.getByLabel("Daily cap").fill("10");
  await panel.getByRole("button", { name: "Add offer" }).click();
  const offer = page.getByRole("row", { name: /Hosted member access/ });
  await expect(offer).toContainText("₦25,000");
  await expect(offer).toContainText("₦37,500");
  await expect(offer).toContainText("50%");

  // The catalogue entry lists this venue among those offering it.
  await page.goto("/catalogue");
  await page.getByRole("button", { name: "Expand Nightlife & Social" }).click();
  await page.getByRole("button", { name: "Expand Members' Clubs" }).click();
  await page.getByRole("link", { name: "Hosted member access" }).click();
  await expect(cardOf(page, "Offered by").getByRole("row", { name: new RegExp(`TEST Rooftop ${tag}`) })).toContainText("₦25,000");

  // Back up to the partner: the venue is listed under it, and on the partners list.
  await cardOf(page, "Offered by").getByRole("link", { name: `TEST Rooftop ${tag}` }).click();
  await page.getByRole("link", { name: `TEST Nights ${tag}` }).click();
  await expect(page.getByRole("link", { name: `TEST Rooftop ${tag}` })).toBeVisible();
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Partners" }).click();
  await expect(page.getByRole("row", { name: new RegExp(`TEST Nights ${tag}`) })).toContainText(`TEST Rooftop ${tag}`);
});

test("import the pilot sheet: dry run first, then commit", async ({ page }) => {
  const run = randomUUID().slice(0, 4).toUpperCase();
  const csv = (name: string, rows: string[]) => ({ name, mimeType: "text/csv", buffer: Buffer.from(rows.join("\n")) });
  await page.goto("/import");

  await page.getByLabel("Partners CSV").setInputFiles(csv("partners.csv", ["Venue ID,Name,Area,Benefit(s) offered,Rate per visit (₦),Active", `E${run}1,TEST E2E Beach ${run},Oniru,Beach,"₦18,000",TRUE`]));
  await page.getByLabel("Members CSV").setInputFiles(
    csv("members.csv", ["Pass number,Token,Tier,Name,Email,WhatsApp,Photo link,Arrival,Departure,Status,Crew group ID", `INTU-E${run},tok,Plus,TEST E2E Pilot ${run},,+999 ${randomInt(10 ** 8, 10 ** 9)},,14/12/2026,02/01/2027,Active,`]),
  );
  await page.getByLabel("Allowances CSV").setInputFiles(csv("allowances.csv", ["Pass number,Benefit,Total,Used,Remaining", `INTU-E${run},Beach,4,1,3`]));
  await page.getByLabel("Visits CSV").setInputFiles(csv("visits.csv", ["Timestamp,Pass number,Venue ID,Benefit,Result,Method", `15/12/2026 13:05:00,INTU-E${run},E${run}1,Beach,Approved,Scan`]));
  await page.getByLabel("Plan for Plus").selectOption({ label: "TEST December Pass Plus" });

  await expect(page.getByRole("button", { name: "Import" })).toBeDisabled();
  await page.getByRole("button", { name: "Dry run" }).click();
  await expect(page.getByRole("heading", { name: "Dry run: nothing was changed" })).toBeVisible();
  await expect(page.getByText("No errors.", { exact: true })).toBeVisible();
  await expect(page.getByText("visits: 1 new")).toBeVisible();

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Import" }).click();
  await expect(page.getByRole("heading", { name: "Imported" })).toBeVisible();

  await page.goto(`/members?q=INTU-E${run}`);
  await page.getByRole("link", { name: `TEST E2E Pilot ${run}` }).click();
  await expect(page.getByRole("row", { name: /TEST E2E Beach/ })).toContainText("Approved");
});

test("an import with errors shows the line and can't be committed", async ({ page }) => {
  await page.goto("/import");
  await page.getByLabel("Members CSV").setInputFiles({ name: "members.csv", mimeType: "text/csv", buffer: Buffer.from("Pass number,Tier,Name,WhatsApp,Status\nINTU-X1,Plus,TEST Local Number,07700900123,Active\n") });
  await page.getByLabel("Plan for Plus").selectOption({ label: "TEST December Pass Plus" });
  await page.getByRole("button", { name: "Dry run" }).click();
  await expect(page.getByText("1 errors")).toBeVisible();
  await expect(page.getByRole("row", { name: /members 2 .*needs a country code/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Import" })).toBeDisabled();
});

test("grow the catalogue: add a service type, rename it, and use it in a plan", async ({ page }) => {
  const tag = randomUUID().slice(0, 4);
  const panel = panelOf(page);
  await page.getByRole("link", { name: "Catalogue" }).click();
  await expect(page.getByRole("heading", { name: "Catalogue" })).toBeVisible();
  await page.getByRole("button", { name: "Expand Wellness & Fitness" }).click();
  await page.getByRole("link", { name: "Golf", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Golf" })).toBeVisible();
  await page.getByRole("button", { name: "Add a service type" }).click();
  await panel.getByLabel("Name").fill(`TEST Driving range ${tag}`);
  await panel.getByRole("button", { name: "Add service type" }).click();
  await cardOf(page, "Service types").getByRole("link", { name: `TEST Driving range ${tag}` }).click();
  await expect(page.getByText(/^Service type · C04-S08-T\d\d · Members: show the pass at the door \(same as above\)$/)).toBeVisible();

  await page.getByRole("button", { name: "Edit" }).click();
  await panel.getByLabel("Name").fill(`TEST Range session ${tag}`);
  await panel.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: `TEST Range session ${tag}` })).toBeVisible();
  await expect(cardOf(page, "Offered by")).toContainText("No listing offers this yet");

  await page.getByRole("link", { name: "Plans and benefits" }).click();
  await page.getByRole("link", { name: "TEST December Pass Plus" }).click();
  await cardOf(page, "Benefits").getByRole("button", { name: "Add benefit" }).click();
  await expect(panel.getByLabel("Covers").locator("option", { hasText: `TEST Range session ${tag}` })).toHaveCount(1);
});

test("set up a venue's intu scanner, show a TEST pass, and review a visit the venue reported", async ({ page, request }) => {
  const API = "http://localhost:8788";
  const pin = String(randomInt(100000, 999999));
  await page.goto("/partners");
  await page.getByRole("link", { name: "TEST Atlantic Shore" }).click();
  await page.getByRole("link", { name: "TEST Atlantic Shore Oniru" }).click();
  const scanner = page.locator("section", { hasText: "Staff who scan members" });
  await expect(scanner).toContainText("ATLONI");
  await scanner.getByRole("button", { name: "Add staff" }).click();
  await panelOf(page).getByLabel("Full name").fill(`TEST Door E2E ${pin}`);
  await panelOf(page).getByLabel("PIN", { exact: true }).fill(pin);
  await panelOf(page).getByRole("button", { name: "Add staff" }).click();
  await expect(scanner.getByText(`TEST Door E2E ${pin}`)).toBeVisible();

  // The member's pass, shown on this browser as the member app will.
  await page.goto("/members");
  await page.getByLabel("Search members").fill("TEST Ada");
  await page.getByLabel("Search members").press("Enter");
  await page.getByRole("link", { name: "TEST Ada London" }).click();
  await page.getByRole("link", { name: "TEST pass" }).click();
  await page.getByRole("button", { name: "Show TEST pass on this browser" }).click();
  await expect(page.getByRole("img", { name: "Pass QR code" }).locator("svg")).toBeVisible();
  await expect(page.getByLabel("Backup code")).toHaveText(/^\d{6}$/);
  const code = await page.evaluate(() => document.body.dataset.passCode ?? "");
  expect(code.startsWith("I1.")).toBe(true);

  // The new partner staff member scans it and reports a problem with the visit.
  const session = await (await request.post(`${API}/partner/session`, { data: { venueCode: "ATLONI", pin } })).json();
  const venue = await (await request.get(`${API}/partner/venue`, { headers: { authorization: `Bearer ${session.token}` } })).json();
  const scan = await (await request.post(`${API}/scan`, { headers: { authorization: `Bearer ${session.token}` }, data: { code, offerId: venue.offers[0].id } })).json();
  expect(scan.member.name).toBe("TEST Ada London");
  const report = await request.post(`${API}/partner/visits/${scan.redemptionId}/report`, { headers: { authorization: `Bearer ${session.token}` }, data: { kind: "dispute", note: `TEST e2e ${pin}` } });
  expect(report.ok()).toBe(true);

  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Visits to review" }).click();
  const flagged = page.locator("section", { hasText: `TEST e2e ${pin}` });
  await expect(flagged).toContainText("TEST Ada London");
  await flagged.getByRole("button", { name: "Review" }).click();
  await panelOf(page).getByLabel("What was decided").fill("TEST e2e: spoke to the venue");
  await panelOf(page).getByRole("button", { name: "Mark reviewed" }).click();
  await expect(page.locator("section", { hasText: `TEST e2e ${pin}` })).toHaveCount(0);
  await page.getByRole("button", { name: "Reviewed" }).click();
  await expect(page.locator("section", { hasText: `TEST e2e ${pin}` })).toContainText("spoke to the venue");
});

test("book a visiting service for a member, and cancel it", async ({ page }) => {
  const note = `TEST e2e flight lands 16:00 ${randomUUID().slice(0, 6)}`;
  const panel = panelOf(page);
  await page.goto("/members");
  await page.getByLabel("Search members").fill("TEST Chioma");
  await page.getByLabel("Search members").press("Enter");
  await page.getByRole("link", { name: "TEST Chioma Houston" }).click();
  const card = cardOf(page, "Bookings");
  await card.getByRole("button", { name: "Book a service" }).click();
  await panel.getByLabel("Listing").selectOption({ label: "TEST Coastal Rides chauffeurs (visiting)" });
  await expect(panel.getByLabel("What's booked").locator("option", { hasText: "Airport pickup" })).toHaveCount(1);
  await panel.getByLabel("What's booked").selectOption({ label: "Airport pickup" });
  await panel.getByLabel("Date (Lagos)").fill("2026-12-20");
  await panel.getByLabel("Notes for the partner").fill(note);
  await panel.getByRole("button", { name: "Confirm booking" }).click();
  const row = card.getByRole("row", { name: new RegExp(note) });
  await expect(row).toContainText("Confirmed");
  await expect(row).toContainText("Airport pickup");
  await row.getByRole("button", { name: "Cancel" }).click();
  await panel.getByLabel("Reason").fill("TEST e2e: member changed flights");
  await panel.getByRole("button", { name: "Cancel booking" }).click();
  await expect(card.getByRole("row", { name: new RegExp(note) })).toContainText("Cancelled");
});

test("the concierge confirms one booking request from the app and declines another", async ({ page }) => {
  // Two requests as the member app makes them, for a seeded TEST member.
  const { db, sql } = createDb(process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/intu", { max: 1 });
  const tag = randomUUID().slice(0, 6);
  const member = one(await db.select().from(schema.members).where(eq(schema.members.fullName, "TEST Ada London")));
  const membership = one(await db.select().from(schema.memberships).where(eq(schema.memberships.memberId, member.id)));
  const venue = one(await db.select().from(schema.venues).where(eq(schema.venues.name, "TEST Ikoyi House")));
  for (const day of ["2026-12-19", "2026-12-20"]) {
    await db.insert(schema.bookings).values({ memberId: member.id, membershipId: membership.id, venueId: venue.id, bookingDate: day, partySize: 3, status: "requested", notes: `TEST e2e ${tag} ${day}` });
  }
  await sql.end();

  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Bookings" }).click();
  const first = page.getByRole("row", { name: new RegExp(`TEST e2e ${tag} 2026-12-19`) });
  const second = page.getByRole("row", { name: new RegExp(`TEST e2e ${tag} 2026-12-20`) });
  await expect(first).toContainText("TEST Ada London");
  await expect(first).toContainText("TEST Ikoyi House");
  await first.getByRole("button", { name: "Confirm" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirm booking" }).click();
  await expect(first).toHaveCount(0);

  await second.getByRole("button", { name: "Decline" }).click();
  await page.getByRole("dialog").getByLabel("Reason").fill("TEST e2e: the venue is full that night");
  await page.getByRole("dialog").getByRole("button", { name: "Decline request" }).click();
  await expect(second).toHaveCount(0);

  await page.getByRole("button", { name: "Confirmed, coming up" }).click();
  await expect(page.getByRole("row", { name: new RegExp(`TEST e2e ${tag} 2026-12-19`) })).toBeVisible();
});

test("a chauffeur listing's cars, and the car and driver the concierge assigns to a booking", async ({ page }) => {
  const { db, sql } = createDb(process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/intu", { max: 1 });
  const tag = randomUUID().slice(0, 4).toUpperCase();
  const panel = panelOf(page);
  const member = one(await db.select().from(schema.members).where(eq(schema.members.fullName, "TEST Ada London")));
  const membership = one(await db.select().from(schema.memberships).where(eq(schema.memberships.memberId, member.id)));
  const venue = one(await db.select().from(schema.venues).where(eq(schema.venues.name, "TEST Coastal Rides chauffeurs")));

  await page.goto(`/partners/${venue.partnerId}/venues/${venue.id}`);
  const vehiclesCard = cardOf(page, "Vehicles");
  await vehiclesCard.getByRole("button", { name: "Add vehicle" }).click();
  await panel.getByLabel("Plate number").fill(`tst ${tag} ab`);
  await panel.getByLabel("Make and model").fill("Toyota Land Cruiser");
  await panel.getByLabel("Year").fill("2022");
  await panel.getByLabel("Colour").fill("Black");
  await panel.getByRole("button", { name: "Add vehicle" }).click();
  await expect(vehiclesCard.getByRole("row", { name: new RegExp(`TST ${tag} AB`) })).toContainText("In service");
  await cardOf(page, "Staff who scan members").getByRole("button", { name: "Add staff" }).click();
  await panel.getByLabel("Full name").fill(`TEST Driver ${tag}`);
  await panel.getByLabel("PIN").fill(String(100000 + Math.floor(Math.random() * 899999)));
  await panel.getByRole("button", { name: "Add staff" }).click();
  await expect(cardOf(page, "Staff who scan members")).toContainText(`TEST Driver ${tag}`);

  await db.insert(schema.bookings).values({ memberId: member.id, membershipId: membership.id, venueId: venue.id, bookingDate: "2026-12-21", partySize: 2, status: "requested", notes: `TEST e2e car ${tag}` });
  await sql.end();
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Bookings" }).click();
  await page.getByRole("row", { name: new RegExp(`TEST e2e car ${tag}`) }).getByRole("button", { name: "Confirm" }).click();
  await panel.getByLabel("Car").selectOption({ label: `Black Toyota Land Cruiser · TST ${tag} AB` });
  await panel.getByLabel("Driver").selectOption({ label: `TEST Driver ${tag}` });
  await panel.getByRole("button", { name: "Confirm booking" }).click();
  await page.getByRole("button", { name: "Confirmed, coming up" }).click();
  const row = page.getByRole("row", { name: new RegExp(`TEST e2e car ${tag}`) });
  await expect(row).toContainText(`Black Toyota Land Cruiser (2022) · TST ${tag} AB`);
  await expect(row).toContainText(`Driver: TEST Driver ${tag}`);
});

test("adding a chauffeur listing names it and takes its cars", async ({ page }) => {
  const { db, sql } = createDb(process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/intu", { max: 1 });
  const tag = randomUUID().slice(0, 4).toUpperCase();
  const panel = panelOf(page);
  const partner = one(await db.select().from(schema.partners).where(eq(schema.partners.id, one(await db.select().from(schema.venues).where(eq(schema.venues.name, "TEST Coastal Rides chauffeurs"))).partnerId)));
  await sql.end();

  await page.goto(`/partners/${partner.id}`);
  await page.getByRole("button", { name: "Add listing" }).click();
  await panel.getByLabel("Type").selectOption({ label: "A service that comes to them" });
  await expect(panel.getByLabel("Plate number")).toHaveCount(0);
  await pickCategory(panel.getByLabel("Kind of service"), "Chauffeur & Car Hire");
  await expect(panel.getByLabel("Name")).toHaveValue(`${partner.tradingName} · Chauffeur & Car Hire`);
  await panel.getByLabel("Plate number").fill(`tst ${tag} 1`);
  await panel.getByLabel("Make and model").fill("Toyota Land Cruiser");
  await panel.getByRole("button", { name: "Add another car" }).click();
  await panel.getByLabel("Car 2: plate number").fill(`TST ${tag} 2`);
  await panel.getByLabel("Car 2: make and model").fill("Lexus LX 600");
  await panel.getByLabel("Area").fill("Lagos");
  await panel.getByRole("button", { name: "Add listing" }).click();

  await expect(page.getByRole("heading", { name: `${partner.tradingName} · Chauffeur & Car Hire` })).toBeVisible();
  const cars = cardOf(page, "Vehicles");
  await expect(cars.getByRole("row", { name: new RegExp(`TST ${tag} 1`) })).toContainText("Toyota Land Cruiser");
  await expect(cars.getByRole("row", { name: new RegExp(`TST ${tag} 2`) })).toContainText("Lexus LX 600");
});

test("a bank client: add people, give out and take back passes, upload a list, and record an invoice", async ({ page }) => {
  const tag = randomUUID().slice(0, 4).toUpperCase();
  const panel = panelOf(page);
  const phone = () => `+999${Math.floor(1e9 + Math.random() * 9e9)}`;
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Clients" }).click();
  await page.getByRole("button", { name: "Add client" }).click();
  await panel.getByLabel("Name", { exact: true }).fill(`TEST Meridian Bank ${tag}`);
  await panel.getByLabel("Seats").fill("10");
  await panel.getByLabel("Contract starts").fill("2026-12-01");
  await panel.getByLabel("Contract ends").fill("2027-01-10");
  await panel.getByLabel("TEST client").check();
  await panel.getByRole("button", { name: "Add client" }).click();
  await expect(page.getByRole("heading", { name: `TEST Meridian Bank ${tag}` })).toBeVisible();

  // One person, with the bank's customer number.
  const people = cardOf(page, "People and passes");
  await people.getByRole("button", { name: "Add a person" }).click();
  await panel.getByLabel("Full name").fill(`TEST Kemi ${tag}`);
  await panel.getByLabel("Phone").fill(phone());
  await panel.getByLabel("Customer reference").fill(`CUST-${tag}`);
  await panel.getByLabel("Plan").selectOption({ label: "TEST December Pass Plus" });
  await panel.getByRole("button", { name: "Add person" }).click();
  const kemi = people.getByRole("row", { name: new RegExp(`TEST Kemi ${tag}`) });
  await expect(kemi).toContainText(`CUST-${tag}`);
  await expect(kemi).toContainText("Active");

  // Two passes waiting for a name; one is given out.
  await people.getByRole("button", { name: "Add passes without names" }).click();
  await panel.getByLabel("How many").fill("2");
  await panel.getByLabel("Plan").selectOption({ label: "TEST December Pass Plus" });
  await panel.getByRole("button", { name: "Add passes" }).click();
  await expect(people.getByRole("row", { name: /Waiting for a name/ })).toHaveCount(2);
  await people.getByRole("row", { name: /Waiting for a name/ }).first().getByRole("button", { name: "Give out" }).click();
  await panel.getByLabel("Full name").fill(`TEST Tobi ${tag}`);
  await panel.getByLabel("Phone").fill(phone());
  await panel.getByRole("button", { name: "Give out pass" }).click();
  await expect(people.getByRole("row", { name: new RegExp(`TEST Tobi ${tag}`) })).toContainText("Active");
  await expect(people.getByRole("row", { name: /Waiting for a name/ })).toHaveCount(1);

  // Kemi leaves the bank: her pass ends and the seat opens again.
  await kemi.getByRole("button", { name: "Remove" }).click();
  await panel.getByLabel("Reason").fill("TEST e2e: closed her account");
  await panel.getByRole("button", { name: "Remove and end pass" }).click();
  await expect(people.getByRole("row", { name: new RegExp(`TEST Kemi ${tag}`) })).toHaveCount(0);
  await expect(people.getByRole("row", { name: /Waiting for a name/ })).toHaveCount(2);

  // A list: checked first, then added.
  await people.getByRole("button", { name: "Upload a list" }).click();
  await panel.getByLabel("List (CSV)").setInputFiles({ name: "people.csv", mimeType: "text/csv", buffer: Buffer.from(`Name,Mobile\nTEST Lola ${tag},${phone()}\nTEST Musa ${tag},${phone()}\n`) });
  await panel.getByLabel("Plan").selectOption({ label: "TEST December Pass Plus" });
  await panel.getByRole("button", { name: "Check the list" }).click();
  await expect(panel.getByText(/2\s+new to intu/)).toBeVisible();
  await panel.getByRole("button", { name: "Add 2 people" }).click();
  await expect(panel.getByText("Added 2 people.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(people.getByRole("row", { name: new RegExp(`TEST Musa ${tag}`) })).toContainText("Active");
  await expect(page.getByText("Passes given out")).toBeVisible();

  // An invoice, then paid.
  const invoices = cardOf(page, "Invoices");
  await invoices.getByRole("button", { name: "Record invoice" }).click();
  await panel.getByLabel("Invoice number").fill(`TEST-INV-${tag}`);
  await panel.getByLabel("Issued").fill("2026-12-01");
  await panel.getByLabel("Amount").fill("2,500,000");
  await panel.getByRole("button", { name: "Record invoice" }).click();
  const invoice = invoices.getByRole("row", { name: new RegExp(`TEST-INV-${tag}`) });
  await expect(invoice).toContainText("₦2,500,000");
  await invoice.getByRole("button", { name: "Mark paid" }).click();
  await expect(invoice).toContainText("Paid");
});

test("finance refunds a payment; over the limit, a second person approves it and the pass ends", async ({ page, browser }) => {
  const { db, sql } = createDb(process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/intu", { max: 1 });
  const tag = randomUUID().slice(0, 4).toUpperCase();
  const plan = one(await db.select().from(schema.plans).where(eq(schema.plans.name, "TEST December Pass Plus")));
  const member = one(await db.insert(schema.members).values({ fullName: `TEST Payer ${tag}`, phone: `+999${randomInt(10 ** 9, 10 ** 10)}`, isTest: true }).returning());
  const membership = one(await db.insert(schema.memberships).values({ memberId: member.id, planId: plan.id, startsOn: "2026-12-01", endsOn: "2027-01-10", status: "active" }).returning());
  await db.insert(schema.orders).values({ memberId: member.id, planId: plan.id, currency: "NGN", amountMinor: 50_000_000, provider: "test", status: "paid", providerRef: `test_e2e_${tag}`, providerPaymentId: `test_pay_${tag}`, membershipId: membership.id, paidAt: new Date(), isTest: true });

  // Finance asks for ₦300,000 back, ending the pass: over ₦150,000, so it waits.
  await page.context().clearCookies();
  await signIn(page, "finance");
  await expect(page.getByRole("heading", { name: /^Hello/ })).toBeVisible();
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Payments" }).click();
  await page.getByLabel("Search payments").fill(`TEST Payer ${tag}`);
  await page.getByRole("button", { name: "Search" }).click();
  const row = cardOf(page, "Orders").getByRole("row", { name: new RegExp(`TEST Payer ${tag}`) });
  await expect(row).toContainText("₦500,000");
  await row.getByRole("button", { name: "Refund" }).click();
  const panel = panelOf(page);
  await panel.getByLabel("Amount (NGN)").fill("300,000");
  await panel.getByLabel("Reason").fill("TEST e2e: flight cancelled");
  // Ticked by default for a full refund; kept for this one.
  await expect(panel.getByLabel("End the pass")).toBeChecked();
  await panel.getByRole("button", { name: "Refund" }).click();
  await expect(row).toContainText("Waiting for approval");
  const waiting = cardOf(page, "Refunds waiting for approval").getByRole("row", { name: new RegExp(`TEST Payer ${tag}`) });
  await expect(waiting.getByRole("button", { name: "Approve and send" })).toBeDisabled();

  // The founder approves it in their own session.
  const other = await browser.newContext();
  const founder = await other.newPage();
  await signIn(founder, "founder");
  await expect(founder.getByRole("heading", { name: /^Hello/ })).toBeVisible();
  await founder.goto("/payments");
  await cardOf(founder, "Refunds waiting for approval").getByRole("row", { name: new RegExp(`TEST Payer ${tag}`) }).getByRole("button", { name: "Approve and send" }).click();
  await founder.getByLabel("Search payments").fill(`TEST Payer ${tag}`);
  await founder.getByRole("button", { name: "Search" }).click();
  await expect(cardOf(founder, "Orders").getByRole("row", { name: new RegExp(`TEST Payer ${tag}`) })).toContainText("Part refunded");
  await other.close();

  const [ended] = await db.select().from(schema.memberships).where(eq(schema.memberships.id, membership.id));
  expect(ended?.status).toBe("cancelled");
  await sql.end();
});

test("finance builds last month's partner statements, the founder approves one, and it's paid by (TEST) transfer", async ({ page, browser }) => {
  const { db, sql } = createDb(process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/intu", { max: 1 });
  const tag = randomUUID().slice(0, 4).toUpperCase();
  // The month before this one in Lagos, as the console offers it.
  const [y, m] = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date()).split("-").map(Number) as [number, number];
  const lastMonth = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const categoryId = async (code: string) => one(await db.select({ id: schema.categories.id }).from(schema.categories).where(eq(schema.categories.code, code))).id;
  const partner = one(await db.insert(schema.partners).values({ legalName: `TEST Statement Beach ${tag} Ltd`, tradingName: `TEST Statement Beach ${tag}`, isTest: true }).returning());
  const allDay = Object.fromEntries(["0", "1", "2", "3", "4", "5", "6"].map((d) => [d, [{ open: "00:00", close: "24:00" }]])) as never;
  const venue = one(await db.insert(schema.venues).values({ partnerId: partner.id, name: `TEST Statement Beach ${tag}`, area: "Oniru", city: "lagos", categoryId: await categoryId("C03-S01"), openingHours: allDay, isTest: true }).returning());
  const offer = one(await db.insert(schema.offers).values({ venueId: venue.id, categoryId: await categoryId("C03-S01-T01"), rateMinor: 1_800_000, isTest: true }).returning());
  const plan = one(await db.select().from(schema.plans).where(eq(schema.plans.name, "TEST December Pass Plus")));
  const member = one(await db.insert(schema.members).values({ fullName: `TEST Visitor ${tag}`, phone: `+999${randomInt(10 ** 9, 10 ** 10)}`, isTest: true }).returning());
  const membership = one(await db.insert(schema.memberships).values({ memberId: member.id, planId: plan.id, startsOn: `${lastMonth}-01`, endsOn: `${lastMonth}-28`, status: "active" }).returning());
  await db.insert(schema.redemptions).values({ occurredAt: new Date(`${lastMonth}-15T20:00:00Z`), serviceDate: `${lastMonth}-15`, memberId: member.id, membershipId: membership.id, venueId: venue.id, offerId: offer.id, categoryId: offer.categoryId, result: "approved", method: "online" });

  // Finance builds the month's statements and adds the partner's flat fee.
  await page.context().clearCookies();
  await signIn(page, "finance");
  await expect(page.getByRole("heading", { name: /^Hello/ })).toBeVisible();
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Statements" }).click();
  await page.getByRole("button", { name: /^Build .* statements$/ }).click();
  await expect(page.getByText(/new statements?, \d+ visits? added/)).toBeVisible();
  await page.getByRole("link", { name: `TEST Statement Beach ${tag}` }).click();
  await expect(page.getByRole("heading", { name: new RegExp(`TEST Statement Beach ${tag}`) })).toBeVisible();
  await expect(cardOf(page, "Visits (1)")).toContainText(`TEST Visitor ${tag}`);
  await cardOf(page, "Adjustments").getByRole("button", { name: "Add adjustment" }).click();
  await panelOf(page).getByLabel("Amount (₦)").fill("50000");
  await panelOf(page).getByLabel("Reason").fill("TEST e2e: monthly cabana fee");
  await panelOf(page).getByRole("button", { name: "Add adjustment" }).click();
  await expect(cardOf(page, "Total")).toContainText("₦68,000");
  // Finance can't approve payouts.
  await expect(page.getByRole("button", { name: "Approve for payout" })).toBeDisabled();
  await expect(page.getByText("You can't approve payouts")).toBeVisible();

  // Finance adds where the partner is paid (TEST payouts: no Paystack key, no money).
  const statementPath = new URL(page.url()).pathname;
  await page.getByRole("link", { name: "Add it on the partner's page" }).click();
  await cardOf(page, "Payout account").getByRole("button", { name: "Add account" }).click();
  await panelOf(page).getByLabel("Bank").selectOption({ label: "TEST Bank" });
  await panelOf(page).getByLabel("Account number").fill("0123456789");
  page.once("dialog", (d) => void d.accept());
  await panelOf(page).getByRole("button", { name: "Check and save" }).click();
  await expect(cardOf(page, "Payout account")).toContainText("TEST ACCOUNT 6789");

  // The founder approves it in their own session and pays it.
  const other = await browser.newContext();
  const founder = await other.newPage();
  await signIn(founder, "founder");
  await expect(founder.getByRole("heading", { name: /^Hello/ })).toBeVisible();
  await founder.goto(statementPath);
  founder.on("dialog", (d) => void d.accept());
  await founder.getByRole("button", { name: "Approve for payout" }).click();
  await expect(founder.getByText("Approved, not paid")).toBeVisible();
  await founder.getByRole("button", { name: "Pay by Paystack transfer" }).click();
  await expect(founder.getByText("Paid. Nothing more to do.")).toBeVisible();
  await expect(cardOf(founder, "Total")).toContainText("TRF_test_");
  await other.close();
  await sql.end();
});
