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
  await expect(card.getByText("Shared by Crew")).toHaveCount(2);
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
  const row = page.getByRole("row", { name: /Spa & Massage/ });
  await expect(row).toContainText("per membership year");

  await row.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Top tier").check();
  await page.getByLabel("Uses one per person in the party").check();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const saved = page.getByRole("row", { name: /Spa & Massage/ });
  await expect(saved).toContainText("one per person");
  await expect(saved).toContainText("top");

  await page.goto("/plans");
  await expect(page.getByRole("row", { name: new RegExp(code) })).toContainText("₦1,500,000");
  await expect(page.getByRole("row", { name: new RegExp(code) })).toContainText("£849.99");
});

test("add a partner and a late-night top-tier venue with a naira offer", async ({ page }) => {
  const tag = randomUUID().slice(0, 6);
  await page.goto("/partners");
  await page.getByRole("button", { name: "Add partner" }).click();
  await page.getByLabel("Legal name").fill(`TEST Nights ${tag} Ltd`);
  await page.getByLabel("Trading name").fill(`TEST Nights ${tag}`);
  await page.getByRole("button", { name: "Add partner" }).last().click();
  await expect(page.getByRole("link", { name: `TEST Nights ${tag}` })).toBeVisible();

  await page.getByRole("button", { name: "Add venue" }).first().click();
  await page.getByLabel("Partner").selectOption({ label: `TEST Nights ${tag}` });
  await page.getByLabel("Venue name").fill(`TEST Rooftop ${tag}`);
  await page.getByLabel("Area").fill("Ikoyi");
  await page.getByLabel("Category").selectOption({ label: "Members' club" });
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

test("import the partner pipeline, then move a deal forward", async ({ page }) => {
  const tag = randomUUID().slice(0, 4);
  const csv = [
    "Partner / Lead,Main Category,Subcategory,Proposed Offer,Priority,Status,Offer Model,Net Cost (NGN),Margin,Retail Price (NGN),Contact / Owner,Next Action,Notes",
    `TEST Pipeline Beach ${tag},Beach & Water,Beach Clubs,Entry + F&B credit,P1,Prospect,Credits,,,0,,Call the GM,`,
    `TEST Pipeline Transfers ${tag},Arrival & Travel,Airport Transfers,SUV pickup,P1,Prospect,Included / Add-on,55000.0,0.5,82500,,,`,
  ].join("\n");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Partners and venues" }).click();
  await page.getByRole("button", { name: "Import pipeline" }).click();
  await page.getByLabel("Pipeline CSV").setInputFiles({ name: "pipeline.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.getByRole("button", { name: "Dry run" }).click();
  await expect(page.getByText("Dry run: nothing was changed")).toBeVisible();
  await expect(page.getByText("2 new")).toBeVisible();
  await expect(page.getByText(/uses credits, which intu doesn't offer/)).toBeVisible();
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByText("Imported", { exact: true })).toBeVisible();

  const transfers = page.getByRole("row", { name: new RegExp(`TEST Pipeline Transfers ${tag}`) });
  await expect(transfers).toContainText("₦55,000 → ₦82,500");
  await expect(transfers).toContainText("50% markup");
  await expect(page.getByRole("row", { name: new RegExp(`TEST Pipeline Beach ${tag}`) })).toContainText("placeholder");

  await page.getByRole("link", { name: `TEST Pipeline Beach ${tag}` }).click();
  await page.getByLabel("Status").selectOption({ label: "Negotiating" });
  await page.getByLabel("Cost (₦ per use)").fill("18,000");
  await page.getByLabel("Retail (₦)").fill("27,000");
  await page.getByLabel("Prices are placeholders").uncheck();
  await page.getByRole("button", { name: "Save deal" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await expect(page.getByText("Negotiating", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("50% markup")).toBeVisible();
});
