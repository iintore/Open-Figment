# Contributing to Open Figment

Thanks for helping! Bug reports, fixes, tests and documentation are all welcome. For larger
features, please open an issue first so we can agree on the approach.

## Setup

You need Node.js 20.19+ or 22.12+ and npm.

```bash
git clone https://github.com/iintore/open-figment.git
cd open-figment
npm install
npm run dev        # http://localhost:5173
```

No environment variables or accounts are needed.

## Before you open a pull request

```bash
npm run check      # type-check, lint, unit tests and production build
```

- Keep pull requests small and focused, with a clear description of what changes for users.
- Add or update tests in `*.test.ts` files next to the code you change. The document model
  (`src/model`) and history (`src/store`) are the most important areas to cover.
- Don't change behaviour, layout or saved-file formats as a side effect of a refactor.
- If you change how documents are stored, keep old files loading (see `LEGACY_*` constants for
  examples) and add a test.
- Match the surrounding style: TypeScript strict mode, small modules, comments that explain *why*.

## End-to-end tests

Critical journeys (home screen, drawing, undo/redo, multi-tab sync, export) are covered by
[Playwright](https://playwright.dev) tests in `e2e/`. They start their own Vite dev server on
port 4173 (or reuse one already running there) and give every test empty browser storage.

```bash
npx playwright install chromium   # once, downloads the test browser
npm run e2e                       # run the suite headless
npx playwright test --ui          # debug interactively
```

CI runs them in a separate `e2e` job and uploads the HTML report when they fail.

## Project layout

See the [architecture section of the README](README.md#architecture). In short: `src/model` is
pure document logic with no React, `src/render` draws a page to a canvas, `src/editor` turns
input into edits, `src/store` holds state, history, persistence and sync, and `src/ui` is React.
Edits always go through `mutate()` (or `beginTx()`/`endTx()` for gestures) so they're undoable,
saved and shared with other windows.

## Reporting bugs

Open an issue with steps to reproduce, what you expected, and what happened. If you can, attach
an exported file (main menu → **File → Save local copy…**) that shows the problem.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
Please follow our [code of conduct](CODE_OF_CONDUCT.md).
