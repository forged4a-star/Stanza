/** Editing fixes: Enter, held Backspace across lines, paste, lyrics import, iambic mode, piano-roll touch. */
const { chromium } = require('playwright');
const { navId, closeTop } = require('./nav.cjs');
const assert = require('node:assert/strict');
const BASE = process.env.BASE_URL || 'http://localhost:8081';
const shots = process.argv[2] || null;

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
  const lineTexts = (section) => page.evaluate((s) => [...document.querySelectorAll(`[data-testid^="line-${s}-"][data-testid$="-text"]`)].map((e) => e.innerText), section);

  try {
    await page.goto(BASE);
    await id('lyric-page').waitFor({ timeout: 30000 });
    await id('line-0-0-text').click();
    const box = id('section-0-input');

    await check('Enter makes exactly one new line', async () => {
      await box.pressSequentially('one', { delay: 5 });
      await page.keyboard.press('Enter');
      await box.pressSequentially('two', { delay: 5 });
      await page.keyboard.press('Enter');
      await box.pressSequentially('three', { delay: 5 });
      assert.equal(await box.inputValue(), 'one\ntwo\nthree');
    });

    await check('holding Backspace keeps deleting across line breaks', async () => {
      for (let i = 0; i < 8; i++) await page.keyboard.press('Backspace');
      assert.equal(await box.inputValue(), 'one\nt');
      assert.equal(await page.evaluate(() => document.activeElement?.dataset?.testid), 'section-0-input');
    });

    await check('pasting several lines adds exactly those lines', async () => {
      await page.keyboard.insertText('wo\nalpha\nbeta');
      assert.equal(await box.inputValue(), 'one\ntwo\nalpha\nbeta');
      await settle();
      assert.deepEqual(await lineTexts(0), ['one', 'two', 'alpha', 'beta']);
      await page.reload();
      await id('lyric-page').waitFor();
      assert.deepEqual(await lineTexts(0), ['one', 'two', 'alpha', 'beta']);
    });

    await check('tapping a line puts the caret on that line', async () => {
      await id('line-0-1-text').click();
      await id('section-0-input').pressSequentially('!', { delay: 5 });
      await settle();
      assert.deepEqual(await lineTexts(0), ['one', 'two!', 'alpha', 'beta']);
    });

    await check('iambic feet highlight', async () => {
      await id('line-0-3-text').click();
      await id('section-0-input').press('ControlOrMeta+End');
      await page.keyboard.press('Enter');
      await id('section-0-input').pressSequentially('the night is dark and full of fear', { delay: 2 });
      await settle();
      await id('open-sound').click();
      await id('sound-sheet').waitFor();
      await page.waitForTimeout(400);
      await id('mode-perfect').click();
      await id('mode-slant').click();
      await id('mode-iambic').click();
      await closeSheet();
      const shaded = await id('line-0-4-text').evaluate((el) => [...el.querySelectorAll('div,span')].filter((n) => n.style.backgroundColor && n.children.length === 0).length);
      assert.equal(shaded, 8);
      if (shots) await page.screenshot({ path: `${shots}/r2-iambic.png` });
    });

    await check('piano roll: drag a note to move it, drag its end to resize', async () => {
      await id('section-0-menu').click();
      await id('dialog').getByRole('button', { name: 'Melody (piano roll)' }).click();
      await id('melody-0').waitFor();
      const grid = await id('roll-grid-0').boundingBox();
      await page.mouse.click(grid.x + 2 * 22 + 6, grid.y + 10 * 18 + 9);
      await id('note-0-2').waitFor();
      let b = await id('note-0-2').boundingBox();
      await page.mouse.move(b.x + 8, b.y + b.height / 2);
      await page.mouse.down();
      for (let i = 1; i <= 6; i++) await page.mouse.move(b.x + 8 + i * 11, b.y + b.height / 2);
      await page.mouse.up();
      await id('note-0-5').waitFor();
      b = await id('note-0-5').boundingBox();
      const w0 = b.width;
      await page.mouse.move(b.x + b.width - 4, b.y + b.height / 2);
      await page.mouse.down();
      for (let i = 1; i <= 4; i++) await page.mouse.move(b.x + b.width - 4 + i * 11, b.y + b.height / 2);
      await page.mouse.up();
      await page.waitForTimeout(200);
      const w1 = (await id('note-0-5').boundingBox()).width;
      assert.ok(w1 > w0 + 30, `resized ${w0} → ${w1}`);
      if (shots) await page.screenshot({ path: `${shots}/r2-roll.png` });
    });

    await check('import pasted lyrics: sections labelled, confirmed, created', async () => {
      await id('open-library').click();
      await id('import').click();
      await id('dialog').getByRole('button', { name: 'Paste lyrics' }).click();
      await id('import-sheet').waitFor();
      await page.waitForTimeout(400);
      const v1 = 'walking down the road\n\nthinking of you';
      const ch = 'oh carry me home\n\ncarry me home';
      const v2 = 'another day goes by\n\nstill on my mind';
      // double-spaced, like a paste from a notes app
      await id('import-text').fill([v1, ch, v2, ch].join('\n\n\n\n'));
      await id('import-analyse').click();
      await id('import-section-3').waitFor();
      assert.match(await id('import-section-1').innerText(), /Chorus/);
      assert.match(await id('import-section-1').innerText(), /it repeats/);
      assert.match(await id('import-section-2').innerText(), /Verse 2/);
      if (shots) await page.screenshot({ path: `${shots}/r2-import.png` });
      await id('import-title').fill('Carry Me');
      await id('import-confirm').click();
      await id('lyric-page').last().waitFor();
      await page.getByText('thinking of you').waitFor();
      assert.equal(await id('song-title').last().inputValue(), 'Carry Me');
    });

    if (errors.length) console.log('\nBrowser errors:\n' + errors.join('\n'));
    console.log('\nEditing e2e: all checks passed');
  } catch (e) {
    console.log('FAILED');
    if (shots) await page.screenshot({ path: `${shots}/r2-failure.png` });
    console.error(e);
    console.log(errors.slice(0, 8).join('\n'));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
