/** 1.1 batch 2: idea of the day, constraint cards, ghost of the take (word swap preview is in phase 2). */
const { chromium } = require('playwright');
const { navId, closeTop } = require('./nav.cjs');
const assert = require('node:assert/strict');
const BASE = process.env.BASE_URL || 'http://localhost:8081';

(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
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

    await check('idea of the day: a prompt on the song list that can be put away', async () => {
      await id('open-library').click();
      await id('idea-card').waitFor();
      assert.ok((await id('idea-text').innerText()).length > 20);
      await id('idea-hide').click();
      await page.waitForTimeout(300);
      assert.equal(await id('idea-card').count(), 0);
      // it stays away for the day, even after leaving and coming back
      await page.waitForTimeout(700); // let the preference reach the database
      await page.goto(BASE + '/library');
      await id('new-song').waitFor({ timeout: 30000 });
      await page.waitForTimeout(500);
      assert.equal(await id('idea-card').count(), 0);
    });

    await check('start a song from the idea (turn it back on in settings first)', async () => {
      await page.goto(BASE + '/settings');
      await id('toggle-daily-idea').waitFor({ timeout: 30000 });
      await id('toggle-daily-idea').click(); // off
      await id('toggle-daily-idea').click(); // on again, clears "not today"
      await page.waitForTimeout(500);
      await page.goto(BASE + '/library');
      await id('idea-card').waitFor({ timeout: 30000 });
      await id('idea-start').click();
      await id('lyric-page').waitFor({ timeout: 30000 });
    });

    await id('song-title').fill('Card Song');
    await id('line-0-0-text').click();
    await id('section-0-input').pressSequentially('the cold wind blows', { delay: 3 });
    await page.keyboard.press('Enter');
    await id('section-0-input').pressSequentially('a river runs away', { delay: 3 });
    await settle();

    await check('constraint cards: pick a rule and see which lines break it', async () => {
      await id('open-song-sheet').click();
      await id('open-cards').click();
      await id('cards-sheet').waitFor();
      await page.waitForTimeout(450);
      await id('card-small-words').click();
      await id('card-breaks').waitFor();
      const t = await id('card-result').innerText();
      assert.match(t, /1 of 2 lines break/);
      assert.match(t, /river/);
      await id('card-questions').click();
      assert.match(await id('card-result').innerText(), /2 of 2 lines break/);
      await id('card-no-articles').click();
      await id('card-breaks').waitFor();
      assert.match(await id('card-result').innerText(), /drop/);
    });

    await check('a line that follows the card clears it; draw gives a different card; put it down', async () => {
      await id('card-tight').click();
      await id('card-ok').waitFor();
      assert.match(await id('card-ok').innerText(), /All 2 lines follow/);
      const before = await id('card-held').innerText();
      await id('card-draw').click();
      await page.waitForTimeout(200);
      assert.notEqual(await id('card-held').innerText(), before);
      await id('card-clear').click();
      await page.waitForTimeout(200);
      assert.equal(await id('card-held').count(), 0);
      await closeSheet();
    });

    await check('ghost of the take: the melody of a recorded take appears', async () => {
      await id('section-0-record').click();
      await id('capture-bar').waitFor();
      await page.waitForTimeout(6000);
      await id('capture-stop').click();
      await page.getByText(/Saved: Verse take 1/).waitFor({ timeout: 15000 });
      await id('open-takes').click();
      await id('takes-sheet').waitFor();
      await page.waitForTimeout(500);
      await page.locator('button[data-testid^="ghost-"], [role="button"][data-testid^="ghost-"]').first().click();
      await page.locator('[data-testid^="ghost-view-"]').first().waitFor();
      await page.waitForFunction(() => {
        const el = document.querySelector('[data-testid^="ghost-view-"]');
        return el && !/Reading the melody/.test(el.textContent || '');
      }, null, { timeout: 20000 });
      const text = await page.locator('[data-testid^="ghost-view-"]').first().innerText();
      assert.doesNotMatch(text, /Could not read/);
      console.log('\n    ghost view says: ' + text.replace(/\s+/g, ' ').slice(0, 120));
    });

    assert.deepEqual(errors.filter((e) => !/favicon|DevTools|Download the React/i.test(e)), []);
    console.log('batch 2 e2e passed');
  } catch (e) {
    console.error('\nFAILED:', e.message);
    await page.screenshot({ path: '/tmp/batch2-fail.png' }).catch(() => {});
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
