import { expect, test } from "@playwright/test";
import { ACCOUNTS } from "./support/accounts";
import { fakeSupabase, GOOD_CODE } from "./support/fake-supabase";
import { signIn } from "./support/session";

test("first sign-in sets up two-step with an authenticator app before the console opens", async ({ page }) => {
  await fakeSupabase(page, { ...ACCOUNTS.founder, enrolled: false });
  await page.goto("/members");
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel("Email").fill(ACCOUNTS.founder.email);
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("That email and password don't match an account.")).toBeVisible();

  await page.getByLabel("Password").fill(ACCOUNTS.founder.password);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Set up two-step verification" })).toBeVisible();
  await expect(page.getByAltText("QR code for your authenticator app")).toBeVisible();
  await expect(page.getByText("JBSWY3DPEHPK3PXP")).toBeVisible();

  await page.getByLabel("Code").fill("000000");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByText("That code didn't work.", { exact: false })).toBeVisible();

  await page.getByLabel("Code").fill(GOOD_CODE);
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByRole("heading", { name: "Hello, TEST" })).toBeVisible();
});

test("a password alone never reaches the console", async ({ page }) => {
  await fakeSupabase(page, { ...ACCOUNTS.founder, enrolled: true });
  await page.goto("/login");
  await page.getByLabel("Email").fill(ACCOUNTS.founder.email);
  await page.getByLabel("Password").fill(ACCOUNTS.founder.password);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Two-step verification" })).toBeVisible();

  // Skipping the code and going straight to a console page sends you back.
  await page.goto("/members");
  await expect(page).toHaveURL(/\/two-step$/);
});

test("someone signed in to Supabase but not on the intu team sees no data", async ({ page }) => {
  await fakeSupabase(page, { ...ACCOUNTS.outsider, enrolled: true });
  await page.goto("/login");
  await page.getByLabel("Email").fill(ACCOUNTS.outsider.email);
  await page.getByLabel("Password").fill(ACCOUNTS.outsider.password);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Code").fill(GOOD_CODE);
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByText("isn't on the intu team")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
});

test("a concierge sees only what their role allows", async ({ page }) => {
  await signIn(page, "concierge");
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link", { name: "Members" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Team" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Pilot import" })).toHaveCount(0);

  await page.goto("/members");
  await expect(page.getByRole("heading", { name: "Add a member" })).toHaveCount(0);
  await page.goto("/staff");
  await expect(page.getByText("needs staff.manage")).toBeVisible();
});
