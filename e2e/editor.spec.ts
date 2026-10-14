import { test, expect, SAMPLE_FILE, createBlankFile, drawRectangle, expectEditor, expectNoCrash, fileCard, gotoHome, layer, layersPanel } from './helpers.ts';

test('draw a rectangle, then undo and redo it', async ({ page }) => {
  await gotoHome(page);
  await createBlankFile(page);

  await drawRectangle(page);
  await expect(layer(page, 'Rectangle')).toBeVisible();
  // Drawing finishes back on the move tool with the new layer selected.
  await expect(page.getByRole('button', { name: 'Move', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await page.keyboard.press('ControlOrMeta+z');
  await expect(layer(page, 'Rectangle')).toHaveCount(0);
  await expect(layersPanel(page).getByText('Layers you add to the canvas will appear here.')).toBeVisible();

  await page.keyboard.press('Shift+ControlOrMeta+z');
  await expect(layer(page, 'Rectangle')).toBeVisible();
});

test('Delete removes the selected layer without crashing', async ({ page }) => {
  await gotoHome(page);
  await fileCard(page, SAMPLE_FILE).click();
  await expectEditor(page);

  await layer(page, 'Details').click();
  await expect(layersPanel(page).locator('.layer-row.selected')).toHaveText(/^Details/);
  await page.keyboard.press('Delete');
  await expect(layer(page, 'Details')).toHaveCount(0);
  await expect(layer(page, 'Home')).toBeVisible();

  // Deleting again with nothing selected is a no-op.
  await page.keyboard.press('Delete');
  await page.keyboard.press('Backspace');
  await expect(layer(page, 'Home')).toBeVisible();

  // And the deletion is undoable.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(layer(page, 'Details')).toBeVisible();
  await expectNoCrash(page);
});

test('selecting a frame shows export options and Dev Mode shows the inspect panel', async ({ page }) => {
  await gotoHome(page);
  await fileCard(page, SAMPLE_FILE).click();
  await expectEditor(page);

  await layer(page, 'Home').click();

  // Design panel: add an export setting and preview the export.
  await page.getByTitle('Add export setting').click();
  const exportButton = page.getByRole('button', { name: 'Export Home' });
  await expect(exportButton).toBeVisible();
  await page.getByRole('button', { name: 'Preview' }).click();
  await expect(page.getByRole('img', { name: 'Export preview' })).toBeVisible();
  const download = page.waitForEvent('download');
  await exportButton.click();
  expect((await download).suggestedFilename()).toMatch(/^Home.*\.png$/);

  // Dev Mode swaps the design panel for Inspect with generated code.
  const devMode = page.getByRole('button', { name: 'Dev Mode', exact: true });
  await devMode.click();
  await expect(devMode).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.right-tab.active')).toHaveText('Inspect');
  await expect(page.getByText('Code', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Design mode' }).click();
  await expect(devMode).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.right-tab.active')).toHaveText('Design');
});
