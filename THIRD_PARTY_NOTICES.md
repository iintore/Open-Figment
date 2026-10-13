# Third-party notices

Open Figment's own code is released under the [MIT License](LICENSE). The app ships with the
following third-party software and assets.

## Bundled into the app

| Component | Version | License | Notes |
| --- | --- | --- | --- |
| [React](https://react.dev) and React DOM | 19.x | MIT | UI framework |
| [scheduler](https://github.com/facebook/react) | 0.x | MIT | Dependency of React DOM |
| [Zustand](https://github.com/pmndrs/zustand) | 5.x | MIT | State management |
| [nanoid](https://github.com/ai/nanoid) | 5.x | MIT | ID generation |
| [Inter](https://github.com/rsms/inter) via [@fontsource-variable/inter](https://fontsource.org/fonts/inter) | 5.x | SIL Open Font License 1.1 | Default UI and text font. Full license: [licenses/Inter-OFL-1.1.txt](licenses/Inter-OFL-1.1.txt) |

## Loaded at runtime

When the app is online it loads additional font families (Roboto, Roboto Mono, Playfair
Display, Poppins, Montserrat, Open Sans and others listed at the top of `src/index.css`) from
Google Fonts. These fonts are licensed by their authors under the SIL Open Font License 1.1 or
the Apache License 2.0. Loading them sends a request to Google's servers; the app works offline
with the bundled Inter font.

## Used only to build, test or package

Development tools such as Vite, TypeScript, Vitest, oxlint, Electron and electron-builder are
not part of the web build. The macOS app embeds the Electron runtime (MIT License, with
Chromium's third-party licenses shipped inside the Electron framework).

Run `npx license-checker --production` for a complete, current list.
