/// <reference lib="dom" />
import { test, expect, expectEditor, fileCard, layer } from './helpers.ts';

// Files saved by builds before the rename live in an IndexedDB database called `figma-clone`
// (with saved versions inline). They must show up after upgrading, and the old database must go.
test('files from the previous storage format are carried over', async ({ page }) => {
  // A same-origin page that doesn't start the app, so the old database can be set up first.
  await page.goto('/favicon.svg');
  await page.evaluate(async () => {
    const now = Date.now();
    const doc = {
      id: 'legacy-doc',
      name: 'Old file',
      pages: [{ id: 'p1', name: 'Page 1', background: 'F5F5F5', children: ['r1'] }],
      nodes: {
        r1: {
          id: 'r1', type: 'RECTANGLE', name: 'Old rectangle', parentId: 'p1', x: 0, y: 0, w: 100, h: 80, rotation: 0,
          visible: true, locked: false, opacity: 1, blendMode: 'NORMAL', fills: [], strokes: [], strokeWeight: 1,
          strokeAlign: 'INSIDE', effects: [], cornerRadius: 0,
        },
      },
      comments: [], colorStyles: [], textStyles: [], effectStyles: [],
      versions: [{ id: 'v1', name: 'Old version', at: now, data: '{}' }],
      createdAt: now, updatedAt: now,
    };
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('figma-clone', 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        d.createObjectStore('meta', { keyPath: 'id' });
        d.createObjectStore('docs', { keyPath: 'id' });
        d.createObjectStore('images');
      };
      req.onsuccess = () => {
        const d = req.result;
        const t = d.transaction(['meta', 'docs'], 'readwrite');
        t.objectStore('docs').put(doc);
        t.objectStore('meta').put({ id: doc.id, name: doc.name, createdAt: now, updatedAt: now, starred: true });
        t.oncomplete = () => {
          d.close();
          resolve();
        };
        t.onerror = () => reject(t.error);
      };
      req.onerror = () => reject(req.error);
    });
  });

  await page.goto('/');
  await expect(fileCard(page, 'Old file')).toBeVisible();
  await expect
    .poll(() => page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name)))
    .not.toContain('figma-clone');

  await fileCard(page, 'Old file').click();
  await expectEditor(page);
  await expect(layer(page, 'Old rectangle')).toBeVisible();
  // Saved versions come along too.
  await page.getByRole('button', { name: 'Main menu' }).click();
  await page.locator('.menu').getByText('File', { exact: true }).hover();
  await page.locator('.menu').getByText('Show version history').click();
  await expect(page.getByText('Old version')).toBeVisible();
});
