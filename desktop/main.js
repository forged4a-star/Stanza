/*
 * Stanza for desktop: the web app in its own window, working with no internet.
 * The app files are served from inside this program on a private address
 * (stanza://app/), so nothing is fetched from the web. Songs are kept in the
 * browser engine's storage in your user profile folder, as on the web.
 */
const { app, BrowserWindow, Menu, protocol, session, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');

// for testing and portable use: keep everything in a folder of your choice
if (process.env.STANZA_USER_DATA) app.setPath('userData', process.env.STANZA_USER_DATA);

const APP_DIR = path.join(__dirname, 'app');
const ORIGIN = 'stanza://app';
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml',
};

protocol.registerSchemesAsPrivileged([{ scheme: 'stanza', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);

if (!app.requestSingleInstanceLock()) {
  // two copies would fight over the same song database
  app.quit();
}

let win = null;

function serve(request) {
  const url = new URL(request.url);
  let rel = decodeURIComponent(url.pathname);
  let file = path.normalize(path.join(APP_DIR, rel));
  // never read outside the app folder
  if (!file.startsWith(APP_DIR)) return new Response('Not found', { status: 404 });
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(APP_DIR, 'index.html');
  const headers = {
    'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'credentialless',
  };
  return new Response(Readable.toWeb(fs.createReadStream(file)), { status: 200, headers });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 380,
    minHeight: 520,
    backgroundColor: '#141414',
    title: 'Stanza',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: true },
  });
  win.loadURL(ORIGIN + '/');
  // links to websites open in the normal browser; the app never navigates away from itself
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(ORIGIN + '/')) {
      event.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });
  win.on('closed', () => (win = null));
}

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(() => {
  protocol.handle('stanza', serve);
  // the microphone (recording takes, humming) is the only permission the app asks for, and only for itself
  const ours = (origin) => !!origin && origin.startsWith(ORIGIN);
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => callback(permission === 'media' && ours(details.requestingUrl)));
  session.defaultSession.setPermissionCheckHandler((wc, permission, requestingOrigin) => permission === 'media' && ours(requestingOrigin));

  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
      { role: 'editMenu' },
      { label: 'View', submenu: [{ role: 'reload' }, { role: 'togglefullscreen' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }] },
      { role: 'windowMenu' },
    ])
  );
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
