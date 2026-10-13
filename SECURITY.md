# Security policy

## Supported versions

Security fixes are made on the `main` branch and included in the next release.

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Report them privately through
[GitHub security advisories](https://github.com/iintore/open-figment/security/advisories/new).
Include steps to reproduce, the affected version, and the impact you expect. You should get a
first response within a week.

## Security model

- Open Figment has no server. Files are stored in the browser's IndexedDB (or the desktop app's
  profile) and never leave the device, except when you export them yourself.
- Live collaboration uses `BroadcastChannel` between windows of the same app on the same
  device. Messages are validated before use.
- Imported files and pasted layers are treated as untrusted: they are validated and repaired
  before they reach the editor, and size-limited.
- SVG export escapes every value written into the markup.
- The desktop app runs a sandboxed renderer with `contextIsolation` on and `nodeIntegration`
  off, exposes a two-function preload bridge, serves the app from a custom scheme with a
  Content Security Policy, denies all permission requests except clipboard and fullscreen, and
  disables DevTools and Node-related Electron fuses in packaged builds.
- Prototype "open link" actions only open `http`, `https` and `mailto` URLs.
