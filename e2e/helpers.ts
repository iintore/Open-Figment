import { test as base, expect, type Locator, type Page } from '@playwright/test';

/**
 * `test` with a guard that fails on uncaught page errors and on the error boundary's recovery
 * screen. Playwright gives every test a new browser context, so storage always starts empty.
 */
export const test = base.extend<{ pageErrors: Error[] }>({
  pageErrors: [
    async ({ context }, provide) => {
      const errors: Error[] = [];
      context.on('weberror', (e) => errors.push(e.error()));
      await provide(errors);
      expect(errors.map((e) => e.message), 'uncaught errors in the page').toEqual([]);
    },
    { auto: true },
  ],
  page: async ({ page }, provide) => {
    await provide(page);
    await expectNoCrash(page);
  },
});

export { expect };

export const SAMPLE_FILE = 'Welcome to Figment';

/** Loads the home screen and waits until the file list has been read from IndexedDB. */
export async function gotoHome(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Recents' })).toBeVisible();
  // On first run the sample file is created during boot.
  await expect(fileCard(page, SAMPLE_FILE)).toBeVisible();
}

/** A file card (grid view) on the home screen, found by its visible name. */
export function fileCard(page: Page, name: string): Locator {
  return page.locator('.file-card').filter({ has: page.getByText(name, { exact: true }) });
}

/** The layers panel in the editor's left sidebar. */
export function layersPanel(page: Page): Locator {
  return page.locator('.layers');
}

/** A layer row in the layers panel, by its exact name. */
export function layer(page: Page, name: string): Locator {
  return layersPanel(page).getByText(name, { exact: true });
}

/** An item in the currently open context/dropdown menu. */
export function menuItem(page: Page, label: string): Locator {
  return page.locator('.menu').getByText(label, { exact: true });
}

export function canvas(page: Page): Locator {
  return page.getByRole('img', { name: 'Design canvas' });
}

/** Waits for the editor UI (canvas + toolbar) to be ready. */
export async function expectEditor(page: Page) {
  await expect(canvas(page)).toBeVisible();
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();
  await expect(layersPanel(page)).toBeVisible();
}

/** Creates a blank design file from the home screen's "Get started" row and opens it. */
export async function createBlankFile(page: Page) {
  await page.getByRole('button', { name: /Blank design file/ }).click();
  await expectEditor(page);
  await expect(layersPanel(page).getByText('Layers you add to the canvas will appear here.')).toBeVisible();
}

/** Picks the rectangle tool with `R` and drags out a rectangle on the canvas. */
export async function drawRectangle(page: Page, from = { x: 0.4, y: 0.4 }, to = { x: 0.55, y: 0.55 }) {
  const box = await canvas(page).boundingBox();
  if (!box) throw new Error('canvas has no bounding box');
  await page.keyboard.press('r');
  await expect(page.getByRole('button', { name: 'Rectangle', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.move(box.x + box.width * from.x, box.y + box.height * from.y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * ((from.x + to.x) / 2), box.y + box.height * ((from.y + to.y) / 2), { steps: 5 });
  await page.mouse.move(box.x + box.width * to.x, box.y + box.height * to.y, { steps: 5 });
  await page.mouse.up();
}

/** Fails the test if the error boundary's recovery screen is shown. */
export async function expectNoCrash(page: Page) {
  await expect(page.getByText('Something went wrong')).toHaveCount(0);
}
