import { test, expect, SAMPLE_FILE, expectEditor, fileCard, gotoHome, layer, menuItem } from './helpers.ts';

test('first run shows the sample file, which opens in the editor', async ({ page }) => {
  await gotoHome(page);
  await expect(page.getByRole('button', { name: /Blank design file/ })).toBeVisible();

  await fileCard(page, SAMPLE_FILE).click();
  await expectEditor(page);
  await expect(page).toHaveTitle(`${SAMPLE_FILE} – Figment`);
  await expect(layer(page, 'Home')).toBeVisible();
  await expect(layer(page, 'Details')).toBeVisible();
});

test('rename, star and trash a file; changes survive a reload', async ({ page }) => {
  await gotoHome(page);
  const renamed = 'Renamed by e2e';

  // Rename from the context menu.
  await fileCard(page, SAMPLE_FILE).click({ button: 'right' });
  await menuItem(page, 'Rename').click();
  const input = page.locator('.file-card input');
  await expect(input).toBeFocused();
  await input.fill(renamed);
  await input.press('Enter');
  const card = fileCard(page, renamed);
  await expect(card).toBeVisible();
  await expect(fileCard(page, SAMPLE_FILE)).toHaveCount(0);

  // Star it: the star button flips and the file is listed under "Starred" in the sidebar.
  await card.hover();
  await card.getByTitle('Add to starred').click();
  await expect(card.getByTitle('Remove from starred')).toBeAttached();
  const starredNav = page.locator('.home-side').getByRole('button', { name: renamed });
  await expect(starredNav).toBeVisible();

  await page.reload();
  await expect(fileCard(page, renamed)).toBeVisible();
  await expect(fileCard(page, renamed).getByTitle('Remove from starred')).toBeAttached();
  await expect(starredNav).toBeVisible();
  await page.getByRole('button', { name: 'Starred', exact: true }).click();
  await expect(fileCard(page, renamed)).toBeVisible();
  await page.getByRole('button', { name: 'Recently viewed' }).click();

  // Move to trash: gone from Recents, listed in Trash, still there after a reload.
  await fileCard(page, renamed).click({ button: 'right' });
  await menuItem(page, 'Move to trash').click();
  await expect(fileCard(page, renamed)).toHaveCount(0);
  await page.getByRole('button', { name: 'Trash' }).click();
  await expect(page.getByRole('heading', { name: 'Trash' })).toBeVisible();
  await expect(fileCard(page, renamed)).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Recents' })).toBeVisible();
  await expect(page.getByText('No files yet — create one above.')).toBeVisible();
  await page.getByRole('button', { name: 'Trash' }).click();
  await expect(fileCard(page, renamed)).toBeVisible();
});
