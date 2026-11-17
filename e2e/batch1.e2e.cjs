/** 1.1 batch 1: tap in a strum, rhyme web, stage view (performance mode). */
const { chromium } = require('playwright');
const { navId, closeTop } = require('./nav.cjs');
const assert = require('node:assert/strict');
const BASE = process.env.BASE_URL || 'http://localhost:8081';

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 400, height: 860 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const id = navId(page);
  const check = async (name, fn) => {
    process.stdout.write(`• ${name} … `);
    await fn();
    console.log('ok');
  };
  const settle = async () => {
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.waitForTimeout(350);
  };
  const closeSheet = async () => {
    await closeTop(page);
    await page.waitForTimeout(400);
  };
  try {
    await page.goto(BASE);
    await id('lyric-page').waitFor({ timeout: 30000 });
    await id('song-title').fill('Batch One');
    await id('line-0-0-text').click();
    const lines = ['I walked along the river in the rain', 'and felt the weight of every little pain', 'the lights were low, the street was bare', 'I left a little piece of me back there', 'and then a stranger told me the time'];
    for (let i = 0; i < lines.length; i++) {
      await id('section-0-input').pressSequentially(lines[i], { delay: 2 });
      if (i < lines.length - 1) await page.keyboard.press('Enter');
    }
    await settle();

    await check('rhyme web: families and what rhymes with nothing', async () => {
      await id('open-song-sheet').click();
      await id('open-web').click();
      await id('web-body').waitFor();
      await page.waitForTimeout(450);
      const graph = await id('web-graph').innerText();
      assert.match(graph, /rain/);
      assert.match(graph, /pain/);
      assert.match(graph, /bare/);
      assert.match(await id('web-orphans').innerText(), /time/);
      assert.match(await id('web-notes').innerText(), /rhyme with nothing/);
      await closeSheet();
    });

    await check('stage view from the chord sheet: scrolls on its own, touch pauses', async () => {
      await id('open-chords').click();
      await id('chords-sheet').waitFor();
      await page.waitForTimeout(450);
      await page.getByRole('tab', { name: 'Ideas', exact: true }).click();
      await id('set-key-G').click();
      await id('add-G').first().click();
      await closeSheet();
      await id('toggle-sheet').click();
      await id('chord-sheet').waitFor();
      await id('open-stage').click();
      await id('perform-scroll').waitFor();
      await id('perform-scroll').getByText('river').waitFor();
      // make the page long enough to scroll on a small screen
      await id('stage-larger').click();
      await id('stage-larger').click();
      await id('stage-larger').click();
      await id('perform-play').click();
      await page.waitForTimeout(1500);
      const y1 = await id('perform-scroll').evaluate((el) => el.scrollTop);
      assert.ok(y1 > 0, 'scrolls by itself');
      await id('perform-play').click(); // pause
      const y2 = await id('perform-scroll').evaluate((el) => el.scrollTop);
      await page.waitForTimeout(600);
      const y3 = await id('perform-scroll').evaluate((el) => el.scrollTop);
      assert.ok(Math.abs(y3 - y2) < 2, 'stays put while paused');
      await id('stage-close').click();
      await id('chord-sheet').waitFor();
    });

    await check('tap in a strum: count-in, tap the pad, get a pattern', async () => {
      await id('toggle-sheet').click(); // back to the editor
      await id('open-chords').click();
      await id('chords-sheet').waitFor();
      await page.waitForTimeout(450);
      await page.getByRole('tab', { name: 'Play', exact: true }).click(); // the sheet remembers its last tab
      await id('new-strum').scrollIntoViewIfNeeded();
      await id('new-strum').click();
      await id('strum-editor').waitFor();
      await id('rhythm-tap').click();
      await id('rhythm-pad').waitFor();
      // wait for the first beat of the listening bar
      await page.waitForFunction(() => /Tap the strum now. Beat 1/.test(document.querySelector('[data-testid="rhythm-status"]')?.textContent || ''), null, { timeout: 15000 });
      const box = await id('rhythm-pad').boundingBox();
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await page.mouse.move(cx, cy);
      const t0 = Date.now();
      // pattern D - D U - U D U on eighths at the song's tempo (90 bpm: eighth = 333 ms)
      const eighth = 60000 / 90 / 2;
      for (const s of [0, 2, 3, 5, 6, 7]) {
        const wait = t0 + s * eighth - Date.now();
        if (wait > 0) await page.waitForTimeout(wait);
        await page.mouse.down();
        await page.mouse.up();
      }
      await id('rhythm-message').waitFor({ timeout: 15000 });
      assert.match(await id('rhythm-message').innerText(), /Got it|loose/);
      const label = (i) => id(`step-${i}`).getAttribute('aria-label');
      const hits = [];
      for (let i = 0; i < 8; i++) hits.push(!/rest/.test(await label(i)));
      assert.deepEqual(hits, [true, false, true, true, false, true, true, true]);
      assert.match(await label(0), /down stroke/);
      assert.match(await label(3), /up stroke/);
    });

    assert.deepEqual(errors, []);
    console.log('batch 1 e2e passed');
  } catch (e) {
    console.error('\nFAILED:', e.message);
    await page.screenshot({ path: '/tmp/batch1-fail.png' }).catch(() => {});
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
