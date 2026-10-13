// Figment desktop shell.
// Follows Electron's security recommendations: sandboxed renderers with contextIsolation on and
// nodeIntegration off, a narrow preload bridge, and the app served from a custom scheme.
const { app, BrowserWindow, Menu, protocol, net, shell, ipcMain, session } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const SCHEME = 'app';
const HOST = 'figment';
const DIST = path.join(__dirname, '..', 'dist');
// Loading the Vite dev server and DevTools are for development only; packaged builds ignore them.
const IS_DEV = !app.isPackaged;
const DEV_URL = IS_DEV ? process.env.FIGMENT_DEV_URL : undefined;

// Applied to the app's HTML in packaged builds. Fonts come from Google Fonts; images can be
// pasted or imported as data/blob URLs.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self' data: blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

// Permissions the editor uses (reading the clipboard for paste, fullscreen for presenting).
const ALLOWED_PERMISSIONS = new Set(['clipboard-read', 'clipboard-sanitized-write', 'fullscreen']);

// A privileged custom scheme gives the renderer a stable, secure origin so IndexedDB,
// localStorage, BroadcastChannel and the clipboard behave like they do on the web.
protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

const windows = new Set();

function startUrl(hash = '') {
  return (DEV_URL ?? `${SCHEME}://${HOST}/`) + hash;
}

function isAppUrl(url) {
  return url.startsWith(`${SCHEME}://${HOST}/`) || (DEV_URL && url.startsWith(DEV_URL));
}

function createWindow(url = startUrl()) {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 800,
    minHeight: 500,
    title: 'Figment',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 13 },
    backgroundColor: '#f5f5f5',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: IS_DEV,
      spellcheck: false,
    },
  });
  windows.add(win);
  win.on('closed', () => windows.delete(win));
  win.once('ready-to-show', () => win.show());

  // "Open in new tab/window" inside the app opens another app window (they collaborate live
  // over BroadcastChannel); everything else goes to the default browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAppUrl(url)) {
      createWindow(url);
    } else if (/^https?:\/\//.test(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!isAppUrl(url)) {
      e.preventDefault();
      if (/^https?:\/\//.test(url)) shell.openExternal(url);
    }
  });

  win.loadURL(url);
  return win;
}

function send(channel) {
  const win = BrowserWindow.getFocusedWindow();
  win?.webContents.send('menu', channel);
}

function buildMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: 'Preferences…', accelerator: 'Cmd+,', click: () => send('shortcuts') },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        { label: 'New Design File', accelerator: 'Cmd+N', click: () => send('new-file') },
        { label: 'New Window', accelerator: 'Shift+Cmd+N', click: () => createWindow() },
        { label: 'Open File…', accelerator: 'Cmd+O', click: () => send('open-file') },
        { type: 'separator' },
        { label: 'Save to Version History', accelerator: 'Alt+Cmd+S', click: () => send('save-version') },
        { label: 'Export…', accelerator: 'Shift+Cmd+E', click: () => send('export') },
        { type: 'separator' },
        { label: 'Back to Files', click: () => send('home') },
        { label: 'Close Tab', accelerator: 'Cmd+W', click: () => send('close-tab') },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        // Undo/redo/select-all go to the editor (or the focused text field) via the preload bridge.
        { label: 'Undo', accelerator: 'Cmd+Z', click: () => send('undo') },
        { label: 'Redo', accelerator: 'Shift+Cmd+Z', click: () => send('redo') },
        { type: 'separator' },
        // Native roles fire DOM copy/cut/paste events, which the editor handles for layers.
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { label: 'Select All', accelerator: 'Cmd+A', click: () => send('select-all') },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Quick Actions…', accelerator: 'Cmd+/', registerAccelerator: false, click: () => send('quick-actions') },
        { label: 'Keyboard Shortcuts', click: () => send('shortcuts') },
        { type: 'separator' },
        { role: 'reload' },
        ...(IS_DEV ? [{ role: 'toggleDevTools' }] : []),
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [{ label: 'Keyboard Shortcuts', click: () => send('shortcuts') }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.setName('Figment');
app.setAboutPanelOptions({
  applicationName: 'Figment',
  applicationVersion: app.getVersion(),
  credits: 'Open-source collaborative design tool.',
});

app.whenReady().then(() => {
  // Serve the built web app from the packaged dist folder, refusing path traversal.
  protocol.handle(SCHEME, async (req) => {
    const notFound = () => new Response('Not found', { status: 404 });
    let rel;
    try {
      const { host, pathname } = new URL(req.url);
      if (host !== HOST) return notFound();
      rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
    } catch {
      return notFound();
    }
    const file = path.normalize(path.join(DIST, rel));
    if (!file.startsWith(DIST + path.sep)) return notFound();
    const res = await net.fetch(pathToFileURL(file).toString());
    if (!file.endsWith('.html')) return res;
    const headers = new Headers(res.headers);
    headers.set('Content-Security-Policy', CSP);
    return new Response(res.body, { status: res.status, headers });
  });

  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(ALLOWED_PERMISSIONS.has(permission)));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => ALLOWED_PERMISSIONS.has(permission));

  ipcMain.handle('figment:new-window', (e, hash) => {
    // Only the app's own pages may ask for windows.
    if (!e.senderFrame || !isAppUrl(e.senderFrame.url)) return;
    createWindow(startUrl(typeof hash === 'string' && /^#[\w=&-]*$/.test(hash) ? hash : ''));
  });
  buildMenu();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
