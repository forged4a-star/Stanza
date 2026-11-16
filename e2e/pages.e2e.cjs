/** The web build as hosted on GitHub Pages: in a sub-folder, installable, and usable offline. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE = process.env.BASE_URL || 'http://localhost:8082/Stanza/';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1000, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  const bad = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => {
    const u = new URL(r.url());
    if (u.origin === new URL(BASE).origin && r.status() >= 400 && r.request().resourceType() !== 'document') bad.push(`${r.status()} ${u.pathname}`);
  });
  const id = (x) => page.getByTestId(x);
  const check = async (name, fn) => {
    process.stdout.write(`• ${name} … `);
    await fn();
    console.log('ok');
  };
  try {
    await check('opens from the sub-folder with every file found', async () => {
      await page.goto(BASE);
      await id('lyric-page').waitFor({ timeout: 30000 });
      assert.deepEqual(bad, []);
    });

    await check('is installable: manifest and icons are served', async () => {
      const href = await page.locator('link[rel="manifest"]').getAttribute('href');
      assert.equal(href, '/Stanza/manifest.webmanifest');
      const m = await page.evaluate(async (h) => (await fetch(h)).json(), href);
      assert.equal(m.name, 'Stanza');
      assert.equal(m.display, 'standalone');
      for (const i of m.icons) {
        const r = await page.request.get(new URL(i.src, new URL(href, BASE)).href);
        assert.equal(r.status(), 200, i.src);
      }
    });

    await check('the offline worker takes over and keeps the app after the first visit', async () => {
      await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 15000 }).catch(async () => {
        await page.reload();
        await id('lyric-page').waitFor();
      });
      await page.evaluate(() => navigator.serviceWorker.ready);
      await page.waitForTimeout(3500); // time for it to keep its copies
      const keys = await page.evaluate(async () => (await caches.keys()).join(','));
      assert.match(keys, /^stanza-/);
      assert.ok((await page.evaluate(async () => { const c = await caches.open((await caches.keys())[0]); return (await c.keys()).length; })) > 5);
    });

    await check('write something, then work with no connection at all', async () => {
      await id('song-title').fill('Offline song');
      await id('line-0-0-text').click();
      await id('section-0-input').pressSequentially('written on the web', { delay: 3 });
      await page.evaluate(() => document.activeElement && document.activeElement.blur());
      await page.waitForTimeout(1500);
      await context.setOffline(true);
      await page.reload();
      await id('lyric-page').waitFor({ timeout: 30000 });
      await page.waitForTimeout(800);
      assert.equal(await id('song-title').inputValue(), 'Offline song');
      assert.match(await id('section-0').innerText(), /written on the web/);
    });

    await check('an address inside the app opens even offline (a song link or the library)', async () => {
      await page.goto(BASE + 'library');
      await id('new-song').waitFor({ timeout: 30000 });
    });

    await check('back online, a direct link to the library still opens (Pages answers 404, the app handles it)', async () => {
      await context.setOffline(false);
      await page.goto(BASE + 'library');
      await id('new-song').waitFor({ timeout: 30000 });
      assert.match(await page.locator('body').innerText(), /Offline song/);
    });

    assert.deepEqual(errors.filter((e) => !/favicon|DevTools|Download the React/i.test(e)), []);
    console.log('pages e2e passed');
  } catch (e) {
    console.error('\nFAILED:', e.message, bad.length ? '\nnot found: ' + bad.join(', ') : '');
    await page.screenshot({ path: '/tmp/pages-fail.png' }).catch(() => {});
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
