import { randomInt, randomUUID } from "node:crypto";
import { expect, test, type Locator } from "@playwright/test";
import { signIn } from "./support/session";

/** Picks a catalogue entry in a category dropdown by its name (options are indented by depth). */
async function pickCategory(select: Locator, name: string) {
  const value = await select.locator("option", { hasText: name }).first().getAttribute("value");
  await select.selectOption(value ?? "");
}

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
  await page.goto("/plans");
  await page.getByRole("button", { name: "New plan" }).click();
  await page.getByLabel("Name").fill(`TEST Gold ${code}`);
  await page.getByLabel("Code").fill(code);
  await page.getByLabel("Duration (days)").fill("365");
  await page.getByRole("button", { name: "Create plan" }).click();
  await expect(page.getByRole("heading", { name: `TEST Gold ${code}` })).toBeVisible();

  await page.getByLabel("NGN").fill("1,500,000");
  await page.getByLabel("GBP").fill("849.99");
  await page.getByRole("button", { name: "Save prices" }).click();
  await expect(page.getByText("Prices saved.")).toBeVisible();
  await expect(page.getByLabel("GBP")).toHaveValue("849.99");

  await pickCategory(page.getByLabel("Add benefit"), "Spa & Massage");
  await page.getByLabel("Quantity").fill("3");
  await page.getByLabel("Period").selectOption({ label: "Per membership year" });
  await page.getByRole("button", { name: "Add", exact: true }).click();
  // The benefits table comes first; the cost and margin table lists the benefit again.
  const row = page.getByRole("row", { name: /Spa & Massage/ }).first();
  await expect(row).toContainText("per membership year");

  await row.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Top tier").check();
  await page.getByLabel("Uses one per person in the party").check();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const saved = page.getByRole("row", { name: /Spa & Massage/ }).first();
  await expect(saved).toContainText("one per person");
  await expect(saved).toContainText("top");

  await page.goto("/plans");
  await expect(page.getByRole("row", { name: new RegExp(code) })).toContainText("₦1,500,000");
  await expect(page.getByRole("row", { name: new RegExp(code) })).toContainText("£849.99");
});

test("see a plan's cost and margin, and price a benefit no venue offers yet", async ({ page }) => {
  const code = `E2E-${randomUUID().slice(0, 6).toUpperCase()}`;
  await page.goto("/plans");
  await page.getByRole("button", { name: "New plan" }).click();
  await page.getByLabel("Name").fill(`TEST Costed ${code}`);
  await page.getByLabel("Code").fill(code);
  await page.getByLabel("Season starts").fill("2026-12-01");
  await page.getByLabel("Season ends").fill("2027-01-10");
  await page.getByRole("button", { name: "Create plan" }).click();
  await expect(page.getByRole("heading", { name: `TEST Costed ${code}` })).toBeVisible();

  await page.getByLabel("NGN").fill("100,000");
  await page.getByRole("button", { name: "Save prices" }).click();
  await page.getByLabel("Fixed costs per member (₦)").fill("10,000");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  // No venue offers theatre tickets yet, so it has nothing to be costed from.
  await pickCategory(page.getByLabel("Add benefit"), "Theatre ticket");
  await page.getByLabel("Quantity").fill("2");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const cost = page.getByRole("row", { name: /Theatre ticket/ }).last();
  await expect(cost).toContainText("No venue offers it yet: set a planning cost");
  await expect(page.getByText("Leaves out 1 unpriced benefit")).toBeVisible();

  await page.getByRole("row", { name: /Theatre ticket/ }).first().getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Planning cost (₦)").fill("20,000");
  await page.getByLabel("Expected use (%)").fill("50");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(cost).toContainText("Planning cost");
  await expect(cost).toContainText("₦40,000");
  await expect(cost).toContainText("₦20,000");
  await expect(page.getByRole("row", { name: /Total cost/ })).toContainText("₦50,000");
  await expect(page.getByRole("row", { name: /Total cost/ })).toContainText("₦30,000");
  await expect(page.getByText("₦70,000 70%")).toBeVisible();
});

test("add a partner and a late-night top-tier venue with a naira offer", async ({ page }) => {
  const tag = randomUUID().slice(0, 6);
  await page.goto("/partners");
  await page.getByRole("button", { name: "Add partner" }).click();
  await page.getByLabel("Legal name").fill(`TEST Nights ${tag} Ltd`);
  await page.getByLabel("Trading name").fill(`TEST Nights ${tag}`);
  await page.getByRole("button", { name: "Add partner" }).last().click();
  await expect(page.getByRole("heading", { name: `TEST Nights ${tag}` })).toBeVisible();

  await page.getByRole("button", { name: "Add venue" }).click();
  await page.getByLabel("Venue name").fill(`TEST Rooftop ${tag}`);
  await page.getByLabel("Area").fill("Ikoyi");
  await pickCategory(page.getByLabel("Kind of place"), "Members' Clubs");
  await page.getByLabel("Tier").selectOption({ label: "Top tier" });
  await page.getByLabel("Sat opens").fill("22:00");
  await page.getByLabel("Sat closes").fill("04:00");
  await page.getByRole("button", { name: "Add venue" }).last().click();

  await expect(page.getByRole("heading", { name: `TEST Rooftop ${tag}` })).toBeVisible();
  await expect(page.getByLabel("Sat closes")).toHaveValue("04:00");
  await expect(page.getByLabel("Sun opens")).toHaveValue("");

  await pickCategory(page.getByLabel("Add offer"), "Hosted member access");
  await page.getByLabel("Rate (₦ per visit)").fill("25,000");
  await page.getByLabel("Retail (₦)").fill("37,500");
  await page.getByLabel("Daily cap").fill("10");
  await page.getByRole("button", { name: "Add offer" }).click();
  const offer = page.getByRole("row", { name: /Hosted member access/ });
  await expect(offer).toContainText("₦25,000");
  await expect(offer).toContainText("₦37,500");
  await expect(offer).toContainText("50%");

  // Back up to the partner: the venue is listed under it, and on the partners list.
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
  await page.getByRole("link", { name: "Catalogue" }).click();
  await expect(page.getByRole("heading", { name: "Catalogue" })).toBeVisible();
  await page.getByRole("button", { name: "Expand Wellness & Fitness" }).click();
  await page.getByRole("button", { name: "Expand Golf" }).click();
  await page.getByRole("button", { name: "Add a service type to Golf" }).click();
  await page.getByLabel("Add a service type to Golf").fill(`TEST Driving range ${tag}`);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText(`TEST Driving range ${tag}`)).toBeVisible();
  await expect(page.getByText(/C04-S08-T\d\d/).last()).toBeVisible();

  const row = page.locator("div", { hasText: `TEST Driving range ${tag}` }).last();
  await row.getByRole("button", { name: "Rename" }).click();
  await page.getByLabel(`New name for TEST Driving range ${tag}`).fill(`TEST Range session ${tag}`);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(`TEST Range session ${tag}`)).toBeVisible();

  await page.getByRole("link", { name: "Plans and benefits" }).click();
  await page.getByRole("link", { name: "TEST December Pass Plus" }).click();
  await expect(page.getByLabel("Add benefit").locator("option", { hasText: `TEST Range session ${tag}` })).toHaveCount(1);
});

test("set up a venue's door scanner, show a TEST pass, and review a visit the venue reported", async ({ page, request }) => {
  const API = "http://localhost:8788";
  const pin = String(randomInt(100000, 999999));
  await page.goto("/partners");
  await page.getByRole("link", { name: "TEST Atlantic Shore" }).click();
  await page.getByRole("link", { name: "TEST Atlantic Shore Oniru" }).click();
  const scanner = page.locator("section", { hasText: "Door scanner" });
  await expect(scanner).toContainText("ATLONI");
  await scanner.getByLabel("Add door staff").fill(`TEST Door E2E ${pin}`);
  await scanner.getByLabel("PIN", { exact: true }).fill(pin);
  await scanner.getByRole("button", { name: "Add", exact: true }).click();
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

  // The new door staff member scans it and reports a problem with the visit.
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
  await flagged.getByLabel("What was decided").fill("TEST e2e: spoke to the venue");
  await flagged.getByRole("button", { name: "Mark reviewed" }).click();
  await expect(page.locator("section", { hasText: `TEST e2e ${pin}` })).toHaveCount(0);
  await page.getByRole("button", { name: "Reviewed" }).click();
  await expect(page.locator("section", { hasText: `TEST e2e ${pin}` })).toContainText("spoke to the venue");
});
