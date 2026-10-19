import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { buildRoster, modelRosterSchema } from "../src/lib/roster";
import { E2E_PASSWORD } from "../playwright.config";

const model = modelRosterSchema.parse(JSON.parse(readFileSync("tests/fixtures/model-19-oct.json", "utf8")));
const ROSTER = { ...buildRoster(model, "Meng", "2026-10-19"), reader: { provider: "anthropic", model: "claude-opus-5-5" } };
const IMAGE = "tests/live/images/synthetic-roster.png";
const SHOTS = process.env.E2E_SCREENSHOTS;

async function signIn(page: Page) {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByRole("heading", { name: "AutoCalendar" })).toBeVisible();
}

async function uploadWithReply(page: Page, reply: unknown, status = 200) {
  await page.route("**/api/extract", async (route) => {
    // Chromium doesn't expose the file bytes here; check the form fields that are visible.
    expect(route.request().headers()["content-type"]).toContain("multipart/form-data");
    expect(route.request().postData() ?? "").toContain('name="name"');
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(reply) });
  });
  await page.locator('input[type="file"]').setInputFiles(IMAGE);
}

test("a wrong password is refused", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Password").fill("nope");
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveText("That password isn't right.");
  expect((await page.request.get("/api/ics/x.ics?d=x")).status()).toBe(401);
});

test("upload, check, edit and download a week", async ({ page }, testInfo) => {
  await signIn(page);
  await expect(page.getByRole("button", { name: /Upload roster/ })).toContainText("up to 10 MB");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${testInfo.project.name}-1-upload.png`, fullPage: true });

  await uploadWithReply(page, ROSTER);
  await expect(page.getByText("Row: Meng (PT) · 5 shifts")).toBeVisible();
  await expect(page.getByText("Read by Claude (claude-opus-5-5)")).toBeVisible();

  const monday = page.getByRole("region", { name: "Mon 19 Oct" });
  await expect(monday.getByText("7:30 AM – 5:00 PM")).toBeVisible();
  await expect(monday.getByText("7:00 – 7:30 AM")).toBeVisible();
  await expect(monday.getByText("6:30 AM")).toBeVisible();
  await expect(monday.getByText("6:45 AM")).toBeVisible();
  await expect(page.getByRole("region", { name: "Sat 24 Oct" }).getByText("4:00 PM – 3:00 AM Sun")).toBeVisible();
  await expect(page.getByRole("region", { name: "Fri 23 Oct" }).getByText("OFF · no calendar file")).toBeVisible();
  await expect(page.getByRole("region", { name: "Sun 25 Oct" }).getByText("Red cell (day off) · no calendar file")).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${testInfo.project.name}-2-preview.png`, fullPage: true });

  // The download link serves a calendar file with both events and both reminders.
  const href = await monday.getByRole("link", { name: "Download shift-mon-19-oct.ics" }).getAttribute("href");
  const file = await page.request.get(href!);
  expect(file.headers()["content-type"]).toBe("text/calendar; charset=utf-8");
  const text = await file.text();
  expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  expect(text).toContain("TRIGGER;RELATED=START:-PT30M");
  expect(text).toContain("TRIGGER;RELATED=START:-PT15M");

  const week = await page.getByRole("link", { name: /Add all 5 shifts/ }).getAttribute("href");
  expect((await (await page.request.get(week!)).text()).match(/BEGIN:VEVENT/g)).toHaveLength(10);

  // Editing a shift moves its travel and reminders with it.
  await monday.getByRole("button", { name: "Edit" }).click();
  await monday.getByLabel("Starts").fill("08:00");
  await expect(monday.getByText("8:00 AM – 5:00 PM")).toBeVisible();
  await expect(monday.getByText("7:30 – 8:00 AM")).toBeVisible();
  await expect(monday.getByText("Edited · roster said 0730 - 1700")).toBeVisible();

  // Adding a shift on a day off gives that day a file.
  await page.getByRole("region", { name: "Fri 23 Oct" }).getByRole("button", { name: "Add shift" }).click();
  await expect(page.getByText("Row: Meng (PT) · 6 shifts")).toBeVisible();

  // The preview survives a reload in the same tab.
  await page.reload();
  await expect(page.getByText("Row: Meng (PT) · 6 shifts")).toBeVisible();
  await expect(page.getByRole("region", { name: "Mon 19 Oct" }).getByText("8:00 AM – 5:00 PM")).toBeVisible();
});

test("settings change the preview and are remembered", async ({ page }, testInfo) => {
  await signIn(page);
  await uploadWithReply(page, ROSTER);
  await page.getByRole("button", { name: "Settings" }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${testInfo.project.name}-3-settings.png` });
  // The e2e server has no API keys, so only Automatic can be chosen and Settings say why.
  const service = dialog.getByRole("radiogroup", { name: "Reading service" });
  await expect(service.getByRole("radio", { name: "Automatic" })).toHaveAttribute("aria-checked", "true");
  await expect(service.getByRole("radio", { name: /OpenAI/ })).toBeDisabled();
  await expect(dialog.getByText(/No API key is set on this server yet/)).toBeVisible();
  await dialog.getByLabel("Travel time").fill("45");
  await dialog.getByLabel("Address").fill("1 Example St, Melbourne VIC 3000");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  const monday = page.getByRole("region", { name: "Mon 19 Oct" });
  await expect(monday.getByText("6:45 – 7:30 AM")).toBeVisible();
  await expect(monday.getByText("6:15 AM")).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("dialog", { name: "Settings" }).getByLabel("Travel time")).toHaveValue("45");
  await expect(page.getByRole("dialog", { name: "Settings" }).getByLabel("Address")).toHaveValue("1 Example St, Melbourne VIC 3000");
  await page.getByRole("dialog", { name: "Settings" }).getByRole("button", { name: "Restore defaults" }).click();
  await page.getByRole("dialog", { name: "Settings" }).getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("region", { name: "Mon 19 Oct" }).getByText("7:00 – 7:30 AM")).toBeVisible();
});

test("a roster without Meng explains what to do", async ({ page }, testInfo) => {
  await signIn(page);
  await uploadWithReply(page, buildRoster({ ...model, staff_names: ["Alex (FT)", "Mengyu (PT)"], target_rows: [], table_cut_off: true }, "Meng", "2026-10-19"));
  const alert = page.getByRole("alert").filter({ hasText: "No row named" });
  await expect(alert.getByText('No row named "Meng" was found on this roster.')).toBeVisible();
  await expect(alert.getByText(/Mengyu \(PT\)/).first()).toBeVisible();
  await expect(alert.getByText(/looks cropped/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Change name in Settings" })).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${testInfo.project.name}-4-not-found.png`, fullPage: true });
});
