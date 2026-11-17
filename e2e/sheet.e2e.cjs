/** Chord sheet mode: chords over words, tap to place, transpose, numerals, text export. */
const { chromium } = require('playwright');
const { navId, closeTop } = require('./nav.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const BASE = process.env.BASE_URL || 'http://localhost:8081';
const shots = process.argv[2] || null;

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 400, height: 860 }, acceptDownloads: true })).newPage();
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
  const place = async (word, chord) => {
    await id(`sheet-word-${word}`).click();
    await id('chord-picker').waitFor();
    await page.waitForTimeout(450);
    await id(`inkey-${chord}`).click();
    await id('picker-done').click();
    await page.waitForTimeout(400);
  };

  try {
    await page.goto(BASE);
    await id('lyric-page').waitFor({ timeout: 30000 });
    await id('song-title').fill('Sheet Song');
    await id('line-0-0-text').click();
    await id('section-0-input').pressSequentially('down by the river', { delay: 3 });
    await page.keyboard.press('Enter');
    await id('section-0-input').pressSequentially('I lost my stone', { delay: 3 });
    await settle();
    // give the song a key so in-key chords exist
    await id('open-chords').click();
    await id('chords-sheet').waitFor();
    await page.waitForTimeout(450);
    await page.getByRole('tab', { name: 'Ideas', exact: true }).click();
    await id('set-key-G').click();
    await closeSheet();

    await check('switch to chord sheet mode: words only, no editor', async () => {
      await id('toggle-sheet').click();
      await id('chord-sheet').waitFor();
      assert.equal(await id('section-0-input').count(), 0);
      assert.equal(await id('add-section').count(), 0);
      assert.match(await id('chord-sheet').innerText(), /Tap any word/);
    });

    await check('tap words to put chords above them', async () => {
      await place('down', 'G');
      await place('the', 'Em');
      await place('lost', 'C');
      const text = await id('chord-sheet').innerText();
      assert.match(text, /G[\s\S]*down/);
      assert.match(text, /Em[\s\S]*the/);
      assert.match(text, /C[\s\S]*lost/);
      if (shots) await page.screenshot({ path: `${shots}/sheet-1.png` });
    });

    await check('tap a chord to change it; remove it', async () => {
      await id('sheet-word-lost').click();
      await id('chord-picker').waitFor();
      await page.waitForTimeout(450);
      await id('picker-remove').click();
      await page.waitForTimeout(400);
      assert.doesNotMatch(await id('sheet-word-lost').innerText(), /C\b/);
      await place('lost', 'D');
    });

    await check('transpose and numerals follow the sheet', async () => {
      await id('sheet-up').click();
      await id('sheet-up').click();
      await page.waitForTimeout(300);
      const t = await id('chord-sheet').innerText();
      assert.match(t, /Key A/);
      assert.match(t, /A\s*\n?\s*down/);
      await id('sheet-roman').click();
      assert.match(await id('sheet-word-down').innerText(), /^I\b/);
      await id('sheet-roman').click();
      await id('sheet-down').click();
      await id('sheet-down').click();
    });

    await check('text size', async () => {
      const before = (await id('sheet-word-down').boundingBox()).height;
      await id('sheet-larger').click();
      await id('sheet-larger').click();
      assert.ok((await id('sheet-word-down').boundingBox()).height > before);
    });

    await check('share the chord sheet as plain text, chords aligned over syllables', async () => {
      const [dl] = await Promise.all([page.waitForEvent('download'), id('sheet-share').click()]);
      const txt = fs.readFileSync(await dl.path(), 'utf8');
      assert.equal(dl.suggestedFilename(), 'Sheet Song - chord sheet.txt');
      assert.match(txt, /^Sheet Song\nKey: G/);
      assert.match(txt, /\nG {7}Em\ndown by the river/);
      assert.match(txt, /\n {2}D\nI lost my stone/);
    });

    await check('back to the editor keeps the chords; reload keeps the mode', async () => {
      await id('toggle-sheet').click();
      await id('lyric-page').waitFor();
      const row = await id('line-0-0').innerText();
      assert.match(row, /Em/);
      assert.match(row, /ri\s*ver/);
      await id('toggle-sheet').click();
      await page.waitForTimeout(700); // let the preference reach the database
      await page.reload();
      await id('chord-sheet').waitFor({ timeout: 30000 });
    });

    if (errors.length) console.log('\nBrowser errors:\n' + errors.join('\n'));
    console.log('\nChord sheet e2e: all checks passed');
  } catch (e) {
    console.log('FAILED');
    if (shots) await page.screenshot({ path: `${shots}/sheet-failure.png` });
    console.error(e);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
