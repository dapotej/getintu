import { expect, type Page } from "@playwright/test";
import { ACCOUNTS } from "./accounts";
import { fakeSupabase, GOOD_CODE } from "./fake-supabase";

/** Signs in through the real screens, as a returning user who already has two-step set up. */
export async function signIn(page: Page, who: keyof typeof ACCOUNTS) {
  const account = ACCOUNTS[who];
  await fakeSupabase(page, { ...account, enrolled: true });
  await page.goto("/login");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Two-step verification" })).toBeVisible();
  await page.getByLabel("Code").fill(GOOD_CODE);
  await page.getByRole("button", { name: "Verify" }).click();
}
