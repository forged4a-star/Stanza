/** Chords from a take: record a G chord, read it back as a chart, put it in a section. */
const { chromium } = require('playwright');
const { navId, closeTop, openEditor } = require('./nav.cjs');
const { chordWav } = require('./fixtures.cjs');
const assert = require('node:assert/strict');
const BASE = process.env.BASE_URL || 'http://localhost:8081';

(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-audio-capture=${chordWav()}`, '--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ viewport: { width: 400, height: 860 }, permissions: ['microphone'] });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const id = navId(page);
  const check = async (name, fn) => {
    process.stdout.write(`• ${name} … `);
    await fn();
    console.log('ok');
  };
  try {
    await page.goto(BASE);
    await id('lyric-page').waitFor({ timeout: 30000 });
    await id('song-title').fill('Chart Song');
    await openEditor(page, 'line-0-0-text', 'section-0-input');
    await id('section-0-input').pressSequentially('strummed on a guitar', { delay: 3 });
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.waitForTimeout(400);

    await check('record a take of a chord', async () => {
      await id('section-0-record').click();
      await id('capture-bar').waitFor();
      await page.waitForTimeout(6000);
      await id('capture-stop').click();
      await page.getByText(/Saved: Verse take 1/).waitFor({ timeout: 15000 });
    });

    await check('ask for its chords: the take is listened to, then a chart appears', async () => {
      await id('open-takes').click();
      await id('takes-sheet').waitFor();
      await page.waitForTimeout(600);
      await page.getByRole('button', { name: 'Options for Verse take 1' }).click();
      await id('dialog').getByRole('button', { name: 'Chords from this take' }).click();
      await id('chart-sheet').waitFor();
      await id('chart-timeline').waitFor({ timeout: 60000 });
      assert.match(await id('chart-summary').innerText(), /chord.*heard over/);
      assert.match(await id('chart-timeline').innerText(), /\bG\b/);
    });

    await check('the bars follow the tempo you set', async () => {
      const before = await id('chart-bars').innerText();
      assert.match(before, /\bG\b/);
      await id('chart-bpm-up5').click();
      await id('chart-bpm-up5').click();
      assert.match(await id('chart-bpm').innerText(), /\d+ bpm/);
      assert.match(await id('chart-bars').innerText(), /bars? at \d+ bpm/);
    });

    await check('add the chords to the section', async () => {
      await id('chart-target-0').click();
      await id('chart-apply').click();
      await page.waitForTimeout(700);
      await closeTop(page).catch(() => {});
      await page.waitForTimeout(500);
      await id('chord-grid-0').waitFor();
      assert.match(await id('chord-grid-0').innerText(), /\bG\b/);
    });

    assert.deepEqual(errors.filter((e) => !/favicon|DevTools|Download the React/i.test(e)), []);
    console.log('chart e2e passed');
  } catch (e) {
    console.error('\nFAILED:', e.message);
    await page.screenshot({ path: '/tmp/chart-fail.png' }).catch(() => {});
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
