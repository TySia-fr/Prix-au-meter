import { expect, test } from "@playwright/test";
import { blockThirdParties, expectNoAxeViolations, PASSWORD, uniqueEmail } from "./helpers";

test("search → map → trend → comparison → favourite, with no axe violations", async ({ page }) => {
  await blockThirdParties(page);

  // Account (favourites require one — A7)
  await page.goto("/inscription");
  await expectNoAxeViolations(page, "inscription");
  await page.getByLabel("Nom").fill("Test User");
  await page.getByLabel("E-mail").fill(uniqueEmail("journey"));
  await page.getByLabel("Mot de passe").fill(PASSWORD);
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page.getByRole("button", { name: "Déconnexion" })).toBeVisible();

  // 1. Search (R2) — keyboard only
  await page.goto("/");
  const search = page.getByRole("combobox", { name: "Rechercher une ville ou un quartier" });
  await search.fill("antig");
  await expect(page.getByRole("option", { name: /Antigone/ })).toBeVisible();
  await search.press("ArrowDown");
  await search.press("Enter");

  // 2. Map (R1): map initialised, street layer loaded for the selected area
  await expect(page.getByTestId("map")).toHaveAttribute("data-map-ready", "true");
  const area = page.getByRole("region", { name: "Antigone" });
  await expect(area).toBeVisible();
  await expect(area.getByText(/€\/m²/).first()).toBeVisible();
  const visible = page.getByText(/Rues visibles \(\d+\)/);
  await expect(visible).not.toHaveText("Rues visibles (0)");
  await visible.click();
  await page.getByRole("list", { name: "Zones visibles sur la carte" }).getByRole("button").first().click();
  await expect(page.locator("#street-title")).toBeVisible();

  // 3. Trend (R3)
  await expect(area.getByRole("img", { name: /Évolution du prix médian au m² — Antigone/ })).toBeVisible();
  await area.getByText("Voir les données").click();
  await expect(area.getByRole("table")).toContainText("2025");
  await expectNoAxeViolations(page, "carte");

  // 4. Favourite (R5)
  await area.getByRole("button", { name: "☆ Ajouter aux favoris" }).click();
  await expect(area.getByRole("button", { name: "★ Favori" })).toHaveAttribute("aria-pressed", "true");

  // 5. Comparison (R4)
  await area.getByRole("link", { name: "Comparer ce quartier" }).click();
  await expect(page.getByTestId("compare-a")).toContainText("Antigone");
  const second = page.getByRole("combobox", { name: "Second quartier" });
  await second.fill("ecusson");
  await page.getByRole("option", { name: /Écusson/ }).click();
  await expect(page.getByTestId("compare-b")).toContainText("Écusson");
  await expect(page.getByTestId("compare-diff")).toContainText(/Écusson est [+-]?[\d,]+ % par rapport à Antigone/);
  await expectNoAxeViolations(page, "comparer");

  // Favourite persisted server-side
  await page.goto("/favoris");
  await expect(page.getByTestId("favorites")).toContainText("Antigone");
  await expectNoAxeViolations(page, "favoris");
});

test("low-sample streets never show a price (A4)", async ({ page, request }) => {
  const res = await request.get("/api/map?layer=streets&minLon=3.80&minLat=43.55&maxLon=3.95&maxLat=43.66");
  const { features } = (await res.json()) as { features: { properties: { n: number; median: number | null; reliability: string } }[] };
  const low = features.filter((f) => f.properties.n < 10);
  expect(low.length).toBeGreaterThan(0);
  for (const f of low) expect(f.properties).toMatchObject({ reliability: "low_sample", median: null });
  await page.goto("/");
  await expect(page.getByText("Moins de 10 ventes : pas de prix affiché")).toBeVisible();
});

test("anonymous users are redirected from favourites", async ({ page }) => {
  await page.goto("/favoris");
  await expect(page).toHaveURL(/\/connexion\?next=%2Ffavoris|\/connexion\?next=\/favoris/);
});
