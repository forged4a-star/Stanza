/** Phase 3 in the browser: chords, player, circle of fifths, suggestions, picker, shapes, detector. */
const { chromium } = require('playwright');
const { navId, closeTop } = require('./nav.cjs');
const assert = require('node:assert/strict');
const BASE = process.env.BASE_URL || 'http://localhost:8081';
const shots = process.argv[2] || null;

(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ viewport: { width: 400, height: 860 }, permissions: ['microphone'], acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
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
  const open = async (btn, sheet) => {
    await id(btn).click();
    await id(sheet).waitFor();
    await page.waitForTimeout(450);
  };
  const tab = (name) => page.getByRole('tab', { name, exact: true }).click();
  const barTexts = async (section) => id(`chord-grid-${section}`).evaluate((el) => [...el.querySelectorAll('[data-testid^="bar-"]')].map((b) => b.innerText.replace(/\s+/g, ' ').trim()));

  try {
    await page.goto(BASE);
    await id('lyric-page').waitFor({ timeout: 30000 });
    await id('song-title').fill('Chord Test');
    await id('line-0-0-text').click();
    await id('section-0-input').pressSequentially('walking down the river', { delay: 3 });
    await settle();

    await check('ideas: set a key, add a suggested chord and a classic progression', async () => {
      await open('open-chords', 'chords-sheet');
      await tab('Ideas');
      await id('set-key-C').click();
      await id('suggestions').waitFor();
      const text = await id('suggestions').innerText();
      assert.match(text, /tension/);
      assert.match(text, /release/);
      await id('add-C').click();
      await page.getByRole('button', { name: 'Add Axis (I–V–vi–IV)' }).click();
      await closeSheet();
      assert.deepEqual(await barTexts(0), ['C', 'C', 'G', 'Am', 'F']);
    });

    await check('suggestions after the last chord, with borrowed / secondary / pivot toggles', async () => {
      await open('open-chords', 'chords-sheet');
      await tab('Ideas');
      assert.match(await id('chords-sheet').innerText(), /What could follow F/);
      await id('toggle-borrowed').click();
      await id('toggle-secondary').click();
      await id('toggle-pivots').click();
      const text = await id('suggestions').innerText();
      assert.match(text, /\bFm\b/);
      assert.match(text, /V7\/V/);
      assert.match(text, /pivot/);
      if (shots) await page.screenshot({ path: `${shots}/p3-ideas.png` });
    });

    await check('circle of fifths lights the key and adds chords', async () => {
      await tab('Circle');
      await id('circle-of-fifths').waitFor();
      const svgText = await id('circle-of-fifths').innerText();
      assert.match(svgText, /vii°/);
      await id('circle-of-fifths').getByText('Dm', { exact: true }).click();
      await id('circle-add').click();
      if (shots) await page.screenshot({ path: `${shots}/p3-circle.png` });
      await closeSheet();
      assert.equal((await barTexts(0)).slice(-1)[0], 'Dm');
    });

    await check('chord picker: change a chord, slash bass', async () => {
      await id('bar-0-1').getByRole('button').first().click();
      await id('chord-picker').waitFor();
      await page.waitForTimeout(400);
      await id('root-E').click();
      await id('q-m7').click();
      assert.equal(await id('picker-name').innerText(), 'Em7');
      await id('slash-mode').click();
      await id('bass-B').click();
      assert.equal(await id('picker-name').innerText(), 'Em7/B');
      await id('picker-done').click();
      await page.waitForTimeout(400);
      assert.equal((await barTexts(0))[1], 'Em7/B');
    });

    await check('chords above specific syllables', async () => {
      await open('open-chords', 'chords-sheet');
      await tab('Shapes');
      await id('toggle-place-chords').click();
      await closeSheet();
      await id('line-0-0').getByRole('button', { name: 'Add chord here' }).nth(3).click();
      await id('chord-picker').waitFor();
      await page.waitForTimeout(400);
      await id('inkey-Am').click();
      await id('picker-done').click();
      await page.waitForTimeout(400);
      const row = await id('line-0-0').innerText();
      assert.match(row, /Am/);
      if (shots) await page.screenshot({ path: `${shots}/p3-lyric-chords.png` });
    });

    await check('Roman numeral view and transpose', async () => {
      await open('open-chords', 'chords-sheet');
      await tab('Shapes');
      await id('toggle-roman').click();
      await closeSheet();
      assert.deepEqual((await barTexts(0)).slice(0, 5), ['I', 'iii⁴₃', 'V', 'vi', 'IV']);
      await open('open-chords', 'chords-sheet');
      await tab('Shapes');
      await id('toggle-roman').click();
      await id('transpose-up').click();
      await id('transpose-up').click();
      await closeSheet();
      assert.deepEqual((await barTexts(0)).slice(0, 3), ['D', 'F#m7/C#', 'A']);
      assert.match(await id('line-0-0').innerText(), /Bm/);
    });

    await check('shapes: guitar and piano diagrams for every chord, capo', async () => {
      await open('open-chords', 'chords-sheet');
      await tab('Shapes');
      const n = await id('shapes').locator('svg').count();
      assert.ok(n >= 10, `diagrams: ${n}`);
      await id('capo-up').click();
      if (shots) await page.screenshot({ path: `${shots}/p3-shapes.png` });
      await closeSheet();
    });

    await check('player: plays the song with a moving playhead, tempo and tap tempo', async () => {
      await open('open-chords', 'chords-sheet');
      await tab('Play');
      await id('tap-tempo').click();
      for (let i = 0; i < 4; i++) {
        await page.waitForTimeout(400);
        await id('tap-tempo').click();
      }
      const bpm = Number(await id('player-bpm').inputValue());
      assert.ok(bpm > 130 && bpm < 170, 'tap tempo ~150: ' + bpm);
      // typed BPM, on the same screen
      await id('player-bpm').fill('120');
      await id('player-bpm').press('Enter');
      await page.waitForTimeout(200);
      assert.equal(await id('player-bpm').inputValue(), '120');
      await id('tap-tempo').click();
      // volume slider: tap near the right end, it follows and is remembered
      const vb = await id('volume').boundingBox();
      await page.mouse.click(vb.x + vb.width * 0.9, vb.y + vb.height / 2);
      await page.waitForTimeout(600);
      const vol = Number(await id('volume').getAttribute('aria-valuenow'));
      assert.ok(vol >= 85 && vol <= 95, 'volume ~90: ' + vol);
      await id('metronome').click();
      await id('player-play').click();
      await closeSheet();
      await page.waitForTimeout(2200);
      const lit = await id('chord-grid-0').evaluate((el) => [...el.querySelectorAll('[data-testid^="bar-"]')].findIndex((b) => getComputedStyle(b).borderTopColor !== getComputedStyle(el.querySelector('[data-testid^="bar-"]:last-of-type') || b).borderTopColor || b.style.backgroundColor));
      assert.ok(lit >= 0, 'a bar is highlighted');
      await page.getByRole('button', { name: 'Stop' }).first().click();
      await page.waitForTimeout(300);
      assert.equal(await page.getByRole('button', { name: 'Stop' }).count(), 0, 'stopped');
    });

    await check('section loop button', async () => {
      await id('play-section-0').click();
      await page.waitForTimeout(600);
      assert.equal(await id('play-section-0').getAttribute('aria-label'), 'Stop');
      await id('play-section-0').click();
      assert.equal(await id('play-section-0').getAttribute('aria-label'), 'Loop this section');
    });

    await check('chord detector listens to the microphone', async () => {
      await open('open-chords', 'chords-sheet');
      await tab('Listen');
      await id('detect-toggle').click();
      await page.getByRole('button', { name: 'Stop listening' }).waitFor({ timeout: 5000 });
      await page.waitForTimeout(2500);
      const shown = await id('detected-chord').innerText();
      console.log(`\n    heard: ${shown}`);
      await id('detect-toggle').click();
      await closeSheet();
    });

    await check('ChordPro export carries bar grid and lyric chords', async () => {
      await id('open-song-sheet').click();
      await tab('Export');
      const [dl] = await Promise.all([page.waitForEvent('download'), id('export-chordpro').click()]);
      const txt = require('node:fs').readFileSync(await dl.path(), 'utf8');
      assert.match(txt, /\{key: D\}/);
      assert.match(txt, /\| D \| F#m7\/C# \| A \| Bm \|/);
      assert.match(txt, /\[Bm\]/);
      await closeSheet();
    });

    const real = errors.filter((e) => !/favicon|DevTools/i.test(e));
    if (real.length) console.log('\nBrowser errors:\n' + real.join('\n'));
    console.log('\nPhase 3 e2e: all checks passed');
  } catch (e) {
    console.log('FAILED');
    if (shots) await page.screenshot({ path: `${shots}/p3-failure.png` });
    console.error(e);
    console.log(errors.slice(0, 10).join('\n'));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
