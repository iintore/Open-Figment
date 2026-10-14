import { test, expect, createBlankFile, drawRectangle, expectEditor, expectNoCrash, gotoHome, layer, layersPanel, menuItem } from './helpers.ts';

test('an edit in one tab shows up in another tab of the same file', async ({ page, context }) => {
  await gotoHome(page);
  await createBlankFile(page);

  // Open the same file in a second tab via the tab bar's "Open in new window" (#file=<id>).
  const [pageB] = await Promise.all([
    context.waitForEvent('page'),
    (async () => {
      await page.locator('.tabbar .tab.active').click({ button: 'right' });
      await menuItem(page, 'Open in new window').click();
    })(),
  ]);
  await expect(pageB).toHaveURL(/#file=[\w-]+$/);
  await expectEditor(pageB);
  await expect(layersPanel(pageB).getByText('Layers you add to the canvas will appear here.')).toBeVisible();

  await page.bringToFront();
  await drawRectangle(page);
  await expect(layer(page, 'Rectangle')).toBeVisible();

  // Sync goes over BroadcastChannel; allow a moment for it to arrive.
  await expect(layer(pageB, 'Rectangle')).toBeVisible({ timeout: 5_000 });

  // And back the other way: deleting the layer in B removes it in A.
  await pageB.bringToFront();
  await layer(pageB, 'Rectangle').click();
  await pageB.keyboard.press('Delete');
  await expect(layer(pageB, 'Rectangle')).toHaveCount(0);
  await expect(layer(page, 'Rectangle')).toHaveCount(0, { timeout: 5_000 });
  await expectNoCrash(pageB);
});
