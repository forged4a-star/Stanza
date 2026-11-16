/*
 * Starts the desktop app for real, writes a song, quits, starts it again and
 * checks the song is still there. Needs a display (xvfb-run on Linux CI).
 *   ELECTRON_PATH=/path/to/electron node desktop/smoke.cjs
 * The app is started normally and driven over its debugging port, so this works with any Electron version.
 */
const { chromium } = require('playwright-core');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

// STANZA_PACKAGED_EXE tests an installed/unpacked build as users get it; otherwise the source folder is run
const packaged = process.env.STANZA_PACKAGED_EXE || null;
const executable = packaged || process.env.ELECTRON_PATH || require('electron');
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'stanza-smoke-'));
const port = 9300 + Math.floor(Math.random() * 500);

const ping = () =>
  new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/json/version', timeout: 1000 }, (res) => (res.resume(), resolve(res.statusCode === 200)));
    req.on('error', () => resolve(false));
    req.on('timeout', () => (req.destroy(), resolve(false)));
  });

async function start() {
  const args = [...(process.env.CI || process.env.STANZA_NO_SANDBOX ? ['--no-sandbox'] : []), `--remote-debugging-port=${port}`, ...(packaged ? [] : [path.join(__dirname, 'main.js')])];
  const child = spawn(executable, args, { env: { ...process.env, STANZA_USER_DATA: userData }, stdio: 'ignore' });
  let exited = false;
  child.on('exit', () => (exited = true));
  for (let i = 0; i < 120 && !(await ping()); i++) {
    if (exited) throw new Error('The app closed straight after starting.');
    await new Promise((r) => setTimeout(r, 500));
  }
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const page = await (async () => {
    for (let i = 0; i < 60; i++) {
      const p = browser.contexts().flatMap((c) => c.pages()).find((x) => x.url().startsWith('stanza://'));
      if (p) return p;
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error('The app window did not open.');
  })();
  const quit = async () => {
    await browser.close().catch(() => {});
    child.kill('SIGTERM');
    for (let i = 0; i < 40 && !exited; i++) await new Promise((r) => setTimeout(r, 250));
    if (!exited) child.kill('SIGKILL');
  };
  return { page, quit };
}

(async () => {
  let session;
  try {
    console.log('• first start: the app opens from inside the program');
    session = await start();
    let page = session.page;
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.getByTestId('lyric-page').waitFor({ timeout: 60000 });
    assert.match(page.url(), /^stanza:\/\/app\//);
    assert.equal(await page.title(), 'Stanza');

    console.log('• write a song');
    await page.getByTestId('song-title').fill('Desktop song');
    await page.getByTestId('line-0-0-text').click();
    await page.getByTestId('section-0-input').pressSequentially('kept on the desktop', { delay: 3 });
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.waitForTimeout(2500);
    await session.quit();

    console.log('• second start: the song is still there');
    session = await start();
    page = session.page;
    await page.getByTestId('lyric-page').waitFor({ timeout: 60000 });
    await page.waitForTimeout(1000);
    assert.equal(await page.getByTestId('song-title').inputValue(), 'Desktop song');
    assert.match(await page.getByTestId('section-0').innerText(), /kept on the desktop/);

    console.log('• the library works and shows the song');
    await page.getByTestId('open-library').click();
    await page.getByTestId('new-song').waitFor({ timeout: 30000 });
    assert.match(await page.locator('body').innerText(), /Desktop song/);

    assert.deepEqual(errors.filter((e) => !/favicon|DevTools/i.test(e)), []);
    console.log('desktop smoke test passed');
  } catch (e) {
    console.error('\nFAILED:', e.message);
    process.exitCode = 1;
  } finally {
    await session?.quit().catch(() => {});
    fs.rmSync(userData, { recursive: true, force: true });
  }
})();
