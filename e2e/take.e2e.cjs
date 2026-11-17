/** Full-song take: count-in, lyrics scroll along, stop, the take is saved to the song. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE = process.env.BASE_URL || 'http://localhost:8081';

(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ viewport: { width: 400, height: 860 }, permissions: ['microphone'] });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const id = (x) => page.getByTestId(x);
  const check = async (name, fn) => {
    process.stdout.write(`• ${name} … `);
    await fn();
    console.log('ok');
  };
  const settle = async () => {
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.waitForTimeout(350);
  };
  try {
    await page.goto(BASE);
    await id('lyric-page').waitFor({ timeout: 30000 });
    await id('song-title').fill('Whole Song');
    await id('line-0-0-text').click();
    await id('section-0-input').pressSequentially('down by the river', { delay: 3 });
    await page.keyboard.press('Enter');
    await id('section-0-input').pressSequentially('I lost my stone', { delay: 3 });
    await settle();

    await check('open it from the song menu: your words are on screen', async () => {
      await id('open-song-sheet').click();
      await id('open-full-take').click();
      await id('full-take').waitFor({ timeout: 30000 });
      assert.match(await id('take-scroll').innerText(), /down\s+by\s+the\s+river/);
      assert.match(await id('take-scroll').innerText(), /I\s+lost\s+my\s+stone/);
    });

    await check('count-in, then recording starts and the timer runs', async () => {
      await id('take-start').click();
      await id('take-count').waitFor();
      await id('take-timer').waitFor({ timeout: 20000 });
      await page.waitForTimeout(2500);
      assert.match(await id('take-timer').innerText(), /0:0[1-9]/);
      assert.match(await id('take-section').innerText(), /Verse/);
    });

    await check('stop and save: the take is saved to the whole song and can be played', async () => {
      await id('take-stop').click();
      await id('take-saved').waitFor({ timeout: 20000 });
      assert.match(await id('full-take').innerText(), /Full song take 1/);
      assert.match(await id('full-take').innerText(), /Whole song/);
    });

    await check('it is in the Takes list too, and you can record another', async () => {
      await id('take-again').click();
      await id('take-start').waitFor();
      await id('take-done').count();
      await id('take-close').click();
      await id('lyric-page').waitFor({ timeout: 30000 });
      await id('open-takes').click();
      await id('takes-sheet').waitFor();
      await page.waitForTimeout(500);
      assert.match(await id('takes-sheet').innerText(), /Full song take 1/);
      assert.match(await id('takes-sheet').innerText(), /Whole song/);
      await id('record-full').waitFor();
    });

    await check('leaving during a recording asks what to do with it', async () => {
      await id('record-full').click();
      await id('full-take').waitFor({ timeout: 30000 });
      await id('take-countin').click(); // no count-in
      await id('take-start').click();
      await id('take-timer').waitFor({ timeout: 20000 });
      await id('take-close').click();
      await id('dialog').waitFor();
      await page.getByRole('button', { name: 'Stop and keep the take' }).click();
      await id('take-saved').waitFor({ timeout: 20000 });
      assert.match(await id('full-take').innerText(), /Full song take 2/);
    });

    assert.deepEqual(errors.filter((e) => !/favicon|DevTools|Download the React/i.test(e)), []);
    console.log('take e2e passed');
  } catch (e) {
    console.error('\nFAILED:', e.message);
    await page.screenshot({ path: '/tmp/take-fail.png' }).catch(() => {});
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
