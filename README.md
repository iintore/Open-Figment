# Open Figment

**An open-source collaborative design tool.** Design interfaces on an infinite canvas with
frames, auto layout, components and prototypes, right in your browser or as a macOS app. No
account, no server: your files stay on your device.

[![CI](https://github.com/iintore/open-figment/actions/workflows/ci.yml/badge.svg)](https://github.com/iintore/open-figment/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Try it:** [open-figment.vercel.app](https://open-figment.vercel.app)  
**Design system:** the foundations, components and blocks of this app are documented at
[open-figment-design-system.vercel.app](https://open-figment-design-system.vercel.app)
([source](https://github.com/iintore/Open-Figment-Design-System)).

## Features

- **Canvas:** infinite pan and zoom, rulers, pixel grid, outline mode, smart guides with
  snapping, distance measurement (hold <kbd>Alt</kbd>).
- **Tools:** frame (with device presets), section, rectangle, ellipse (arcs and rings), line,
  arrow, polygon, star, image, pen (Bézier curves), pencil, text, comments, and a Draw mode with
  pencil colours, sizes and an eraser.
- **Editing:** move, resize, rotate and flip, constraints, multi-select, marquee and deep select,
  reparenting by drag, <kbd>Alt</kbd>-drag to duplicate, vector point editing.
- **Structure:** groups, frames, masks, boolean operations, and **auto layout** (vertical,
  horizontal, wrap and grid; hug, fill and fixed sizing; gap, padding and alignment).
- **Components:** main components with live instances, per-property overrides, detach and reset.
- **Styling:** solid, gradient and image fills, strokes (alignment, dashes, caps, joins,
  arrows), shadows and blurs, blend modes, corner radii, typography, colour and text styles,
  and variables.
- **Prototyping:** connections, triggers (click, hover, after delay), actions (navigate, back,
  open link), transitions, and a presentation mode.
- **Collaboration:** open the same file in two windows to see each other's cursors, selections
  and edits live. Concurrent edits are merged, and undo only reverses your own changes.
- **Dev Mode:** inspect sizes, spacing and generated CSS and SVG.
- **Assistant:** a local, rule-based helper ("make it blue", "round corners 12", "generate a
  login screen"). It runs entirely in the app and uses no AI service or network.
- **Files:** local file browser with recents, starred files, drafts and trash; version
  history; export to PNG, JPG and SVG at any scale; import and export `.figment.json` files.

## Getting started

Requires Node.js 20.19+ or 22.12+.

```bash
npm install
npm run dev
```

Then open <http://localhost:5173>. A sample file is created on first run.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the development server with hot reload |
| `npm run build` | Type-check and build the web app into `dist/` |
| `npm test` | Run the unit tests (Vitest) |
| `npm run e2e` | Run the end-to-end tests in Chromium (Playwright; first run `npx playwright install chromium`) |
| `npm run lint` | Lint with oxlint |
| `npm run check` | Type-check, lint, test and build (what CI runs) |
| `npm run desktop` | Build and open the app in Electron |
| `npm run dist:mac` | Package the macOS app (`release/<version>/*.dmg` and `.zip`) |
| `npm run icon` | Regenerate `build/icon.png` from the logo |

### Deploying the web app

The web app is a static site (`npm run build` → `dist/`). `vercel.json` configures Vercel: it
skips Electron's binary download during install, since only the desktop build needs it.

### macOS app

`npm run dist:mac` produces an Apple Silicon `.dmg` and `.zip`. Builds are not code-signed, so
the first time you open the app, right-click it, choose **Open**, and confirm. To sign and
notarize, set `mac.identity` in `package.json` (see the
[electron-builder docs](https://www.electron.build/code-signing)).

## Where your data lives

Files are saved automatically to your browser's IndexedDB (in the desktop app, to its own
profile). Nothing is uploaded. Use **File → Save local copy…** in the main menu to export a
`.figment.json` file you can back up or share, and **Import** on the home screen to open one.

When online, the app loads extra font families from Google Fonts; the default font (Inter) is
bundled, so everything works offline.

## Architecture

```
src/
  model/     Document model: nodes in a flat map, transforms, shapes, auto layout,
             instances, text layout, validation of untrusted input, merge, undo patches
  render/    Canvas 2D renderer (paths, paints, effects, masks, booleans)
  editor/    Canvas events and gestures, hit testing, overlay, commands, shortcuts
             (keys.ts holds every shortcut label), menus, export
  store/     App state (zustand), undo/redo, IndexedDB persistence, multi-window sync
  ui/        React panels and controls; ui/design/ holds the properties panel sections
electron/    Desktop shell (main process and preload bridge)
e2e/         End-to-end tests (Playwright)
```

Dependencies point one way: `model` depends on nothing else, `render` and `store` only on
`model`, `editor` on `model`, `render` and `store`, and `ui` on everything. The renderer receives images through
`setImageSource`, so it doesn't depend on storage.

How an edit flows: input in `src/editor` calls `mutate(fn)` (or `beginTx()`/`endTx()` around a
gesture). The change is applied to the document, `finalize()` updates derived state (instance
contents, text sizes, group bounds, auto layout), and then the canvas redraws, the file is saved
and other windows receive the change. Edits that pass the ids they touch (dragging, property
changes, typing) only update the instances and top-level layers they affect. Every transaction
is one undo step, stored as a patch of just the changed nodes and properties.

Unit tests live next to the code as `*.test.ts` (document model, merge, undo patches,
validation, history, export escaping, shortcut labels, number-field maths). End-to-end tests
in `e2e/` cover the main journeys: opening files, drawing with undo/redo, deleting, exporting,
renaming/starring/trashing files, live sync between two tabs, and upgrading old saved files.

## Known limitations

- Collaboration works between windows on the same device; there is no cloud sync.
- No plugins or widgets. Motion mode is shown but not yet available.
- Variables store values, and colour variables can be applied from the picker, but they can't
  yet be bound to layer properties.
- Background blur is approximated, and smart animate falls back to a dissolve.
- A text layer has one style (no mixed styles within a layer).

## Contributing

Contributions are welcome! Read [CONTRIBUTING.md](CONTRIBUTING.md) to get set up, and follow our
[code of conduct](CODE_OF_CONDUCT.md). To report a security issue, see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © 2026 Tony Lewis MANZI and Open Figment contributors. Third-party components
and fonts are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
