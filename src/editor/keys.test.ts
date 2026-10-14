import { afterEach, describe, expect, it, vi } from 'vitest';

async function shortcutsOn(platform: string) {
  vi.resetModules();
  vi.stubGlobal('navigator', { platform });
  return (await import('./keys')).SHORTCUTS;
}

afterEach(() => vi.unstubAllGlobals());

describe('shortcut labels', () => {
  it('use Ctrl/Alt/Shift names outside macOS', async () => {
    const shortcuts = await shortcutsOn('Win32');
    for (const [name, label] of Object.entries(shortcuts)) {
      expect(label, name).not.toMatch(/[⌘⌥⇧⌃]/);
      expect(label.length, name).toBeGreaterThan(0);
    }
    expect(shortcuts.undo).toBe('Ctrl+Z');
    expect(shortcuts.redo).toBe('Shift+Ctrl+Z');
  });

  it('use symbols on macOS', async () => {
    const shortcuts = await shortcutsOn('MacIntel');
    expect(shortcuts.undo).toBe('⌘Z');
    expect(shortcuts.groupSelection).toBe('⌘G');
    expect(shortcuts.createComponent).toBe('⌥⌘K');
  });
});
