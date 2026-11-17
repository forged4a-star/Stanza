/** Writing replay: the history of edits, played back, scrubbed, and cleared. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE = process.env.BASE_URL || 'http://localhost:8081';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 400, height: 860 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const id = (x) => page.getByTestId(x);
  const check = async (name, fn) => {
    process.stdout.write(`• ${name} … `);
    await fn();
    console.log('ok');
  };
  const rest = (ms = 1100) => page.waitForTimeout(ms); // long enough for each stage to be saved to the history
  const settle = async () => {
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.waitForTimeout(350);
  };
  const clickAt = async (testid, fx) => {
    const b = await id(testid).boundingBox();
    await page.mouse.click(b.x + b.width * fx, b.y + b.height / 2);
    await page.waitForTimeout(250);
  };
  try {
    await page.goto(BASE);
    await id('lyric-page').waitFor({ timeout: 30000 });

    await check('before there is any history, the replay says so', async () => {
      await id('open-song-sheet').click();
      await id('open-replay').click();
      await id('replay-empty').waitFor();
      await page.getByRole('button', { name: 'Close sheet' }).last().click();
      await page.waitForTimeout(400);
    });

    // write the song in stages
    await id('line-0-0-text').click();
    await id('section-0-input').pressSequentially('down by the river', { delay: 5 });
    await rest();
    await page.keyboard.press('Enter');
    await id('section-0-input').pressSequentially('I lost my stone', { delay: 5 });
    await rest();
    await settle();
    await id('song-title').fill('Replay Song');
    await rest();
    await id('add-section').click();
    await id('dialog').getByRole('button', { name: 'Chorus', exact: true }).click();
    await page.waitForTimeout(500);
    await id('section-1-input').pressSequentially('la la la', { delay: 5 });
    await rest();
    await settle();

    await check('the history shows how much was written and over how long', async () => {
      await id('open-song-sheet').click();
      await id('open-replay').click();
      await id('replay-caption').waitFor({ timeout: 15000 });
      assert.match(await id('replay-caption').innerText(), /3 lines, written over/);
    });

    await check('scrub to the start: the song is not written yet; to the end: all of it', async () => {
      await clickAt('replay-slider', 0.0);
      const early = await id('replay-view').innerText();
      assert.doesNotMatch(early, /la la la/);
      assert.doesNotMatch(early, /I lost my stone/);
      await clickAt('replay-slider', 0.995);
      const late = await id('replay-view').innerText();
      assert.match(late, /Replay Song/);
      assert.match(late, /down by the river/);
      assert.match(late, /I lost my stone/);
      assert.match(late, /la la la/);
      assert.match(late, /CHORUS|Chorus/i);
    });

    await check('play it back at speed: it types its way to the end by itself', async () => {
      await clickAt('replay-slider', 0.0);
      await id('replay-speed-32').click();
      await id('replay-play').click();
      await page.getByRole('button', { name: 'Watch again' }).waitFor({ timeout: 20000 });
      assert.match(await id('replay-view').innerText(), /la la la/);
      assert.match(await id('replay-time').innerText(), /\d+:\d\d \/ \d+:\d\d/);
    });

    await check('clear the history: it starts over, and the song itself is untouched', async () => {
      await id('replay-clear').click();
      await id('dialog-ok').click();
      await id('replay-empty').waitFor();
      await page.getByRole('button', { name: 'Close sheet' }).last().click();
      await page.waitForTimeout(500);
      assert.match(await id('section-1').innerText(), /la la la/);
    });

    assert.deepEqual(errors.filter((e) => !/favicon|DevTools|Download the React/i.test(e)), []);
    console.log('replay e2e passed');
  } catch (e) {
    console.error('\nFAILED:', e.message);
    await page.screenshot({ path: '/tmp/replay-fail.png' }).catch(() => {});
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
