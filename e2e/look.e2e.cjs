/** Look & feel: choose a look, make it yours, keep it, share it. And the editor follows the typeface. */
const { chromium } = require('playwright');
const { navId, closeTop } = require('./nav.cjs');
const assert = require('node:assert/strict');
const BASE = process.env.BASE_URL || 'http://localhost:8081';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 400, height: 860 }, permissions: ['clipboard-read', 'clipboard-write'], colorScheme: 'light' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const id = navId(page);
  const check = async (name, fn) => {
    process.stdout.write(`• ${name} … `);
    await fn();
    console.log('ok');
  };
  const css = (testid, prop) => id(testid).evaluate((el, p) => getComputedStyle(el)[p], prop);
  const tab = (name) => page.getByRole('tab', { name, exact: true }).click();
  const open = async () => {
    await page.goto(BASE + '/appearance');
    await id('look-preview').waitFor({ timeout: 30000 });
    await page.waitForTimeout(400);
  };
  try {
    await page.goto(BASE);
    await id('lyric-page').waitFor({ timeout: 30000 });
    await id('song-title').fill('Look Song');
    await id('line-0-0-text').click();
    await id('section-0-input').pressSequentially('down by the river', { delay: 3 });
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.waitForTimeout(600);

    await check('the settings and library lead to Look & feel; six looks to choose from', async () => {
      await id('open-library').click();
      await id('open-appearance-lib').click();
      await id('look-preview').waitFor();
      assert.equal(await page.locator('[data-testid^="look-"][data-testid$="idnight"], [data-testid^="look-"]').filter({ hasNotText: 'zzz' }).count() >= 6, true);
      for (const l of ['midnight', 'paper', 'neon', 'sunrise', 'forest', 'mono']) await id(`look-${l}`).waitFor();
    });

    await check('choosing a look changes colours, shapes and the heading typeface at once', async () => {
      await id('look-midnight').click();
      await page.waitForTimeout(300);
      const midnightBg = await css('preview-record', 'backgroundImage');
      const midnightTitle = await css('preview-title', 'fontFamily');
      await id('look-neon').click();
      await page.waitForTimeout(300);
      assert.match(await id('look-blurb').innerText(), /After hours/);
      assert.notEqual(await css('preview-record', 'backgroundImage'), midnightBg);
      assert.notEqual(await css('preview-title', 'fontFamily'), midnightTitle);
      assert.match(await css('preview-title', 'fontFamily'), /SpaceGrotesk/);
    });

    await check('dark mode, accent colour and lyric typeface apply live', async () => {
      await tab('Dark');
      await page.waitForTimeout(300);
      assert.equal(await css('look-preview', 'backgroundColor'), 'rgb(18, 17, 58)'); // Neon dark panel
      await id('accent-4d8dff').click();
      await page.waitForTimeout(300);
      assert.match(await css('preview-record', 'backgroundImage'), /rgb\(77, 141, 255\)/);
      await id('font-lyric-serif').click();
      await page.waitForTimeout(300);
      assert.match(await css('preview-lyric', 'fontFamily'), /Lora/);
    });

    await check('size and spacing sliders change the lyric text', async () => {
      const before = await css('preview-lyric', 'fontSize');
      await id('lyric-size').scrollIntoViewIfNeeded();
      const box = await id('lyric-size').boundingBox();
      await page.mouse.click(box.x + box.width * 0.9, box.y + box.height / 2);
      await page.waitForTimeout(300);
      assert.ok(parseFloat(await css('preview-lyric', 'fontSize')) > parseFloat(before));
      const lh = await css('preview-lyric', 'lineHeight');
      await id('line-spacing').scrollIntoViewIfNeeded();
      const box2 = await id('line-spacing').boundingBox();
      await page.mouse.click(box2.x + box2.width * 0.95, box2.y + box2.height / 2);
      await page.waitForTimeout(300);
      assert.ok(parseFloat(await css('preview-lyric', 'lineHeight')) > parseFloat(lh));
    });

    await check('your look is kept after a restart', async () => {
      await page.waitForTimeout(700); // slider changes are saved a moment after the last one
      await open();
      assert.match(await id('look-blurb').innerText(), /After hours/);
      assert.match(await css('preview-lyric', 'fontFamily'), /Lora/);
      assert.match(await css('preview-record', 'backgroundImage'), /rgb\(77, 141, 255\)/);
    });

    await check('the editor uses the same typeface, size and line height as the preview', async () => {
      const prev = { font: await css('preview-lyric', 'fontFamily'), size: await css('preview-lyric', 'fontSize'), lh: await css('preview-lyric', 'lineHeight') };
      await page.goto(BASE);
      await id('lyric-page').waitFor({ timeout: 30000 });
      await id('line-0-0-text').click();
      await id('section-0-input').waitFor();
      const ed = await id('section-0-input').evaluate((el) => ({ font: getComputedStyle(el).fontFamily, size: getComputedStyle(el).fontSize, lh: getComputedStyle(el).lineHeight }));
      assert.deepEqual(ed, prev);
      await page.evaluate(() => document.activeElement && document.activeElement.blur());
      await page.waitForTimeout(400);
    });

    await check('share the look as a code and use it again', async () => {
      await open();
      await id('look-share').click();
      await page.waitForTimeout(300);
      const code = await page.evaluate(() => navigator.clipboard.readText());
      assert.match(code, /^stanza-look\/1\/neon\/dark\/.*a:4d8dff.*lf:serif.*~[0-9a-z]$/);
      await id('look-paper').click();
      await page.waitForTimeout(300);
      assert.match(await id('look-blurb').innerText(), /notebook/);
      await id('look-import').click();
      await id('dialog-input').fill(`try this: ${code}`);
      await id('dialog-ok').click();
      await page.waitForTimeout(500);
      assert.match(await id('look-blurb').innerText(), /After hours/);
      assert.match(await css('preview-lyric', 'fontFamily'), /Lora/);
      // a damaged code is refused and changes nothing
      await id('look-import').click();
      await id('dialog-input').fill(code.replace('4d8dff', 'ffffff'));
      await id('dialog-ok').click();
      await page.waitForTimeout(400);
      assert.match(await id('look-blurb').innerText(), /After hours/);
    });

    await check('reset clears the tweaks and keeps the look; picking another look starts fresh', async () => {
      await id('appearance-reset').click();
      await page.waitForTimeout(300);
      assert.doesNotMatch(await css('preview-record', 'backgroundImage'), /rgb\(77, 141, 255\)/);
      assert.match(await id('look-blurb').innerText(), /After hours/);
      await id('accent-ff4d8d').click();
      await id('look-forest').click();
      await page.waitForTimeout(300);
      assert.doesNotMatch(await css('preview-record', 'backgroundImage'), /rgb\(255, 77, 141\)/);
    });

    assert.deepEqual(errors.filter((e) => !/favicon|DevTools|Download the React/i.test(e)), []);
    console.log('look e2e passed');
  } catch (e) {
    console.error('\nFAILED:', e.message);
    await page.screenshot({ path: '/tmp/look-fail.png' }).catch(() => {});
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
