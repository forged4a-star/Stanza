/** Melody tools: harmonize my melody; (more below as they are added). */
const { chromium } = require('playwright');
const { navId, closeTop } = require('./nav.cjs');
const assert = require('node:assert/strict');
const BASE = process.env.BASE_URL || 'http://localhost:8081';
const STEP = 22;
const ROW = 18;

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
  const rowOf = async (midi) => {
    const labels = await id('melody-0').evaluate((el) => [...el.querySelectorAll('div')].map((d) => d.textContent).filter((x) => /^[A-G]#?\d$/.test(x)));
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const topC = labels[0];
    const topCMidi = (Number(topC.slice(-1)) + 1) * 12 + names.indexOf(topC.slice(0, -1));
    const firstCRow = await id('melody-0').evaluate((el) => {
      const rows = [...el.querySelectorAll('div')].filter((d) => /^[A-G]#?\d$/.test(d.textContent || ''));
      const grid = el.querySelector('[data-testid="roll-grid-0"]').getBoundingClientRect();
      return Math.floor((rows[0].getBoundingClientRect().top + 9 - grid.top) / 18);
    });
    return firstCRow + (topCMidi - midi);
  };
  const tapCell = async (step, row) => {
    const box = await id('roll-grid-0').boundingBox();
    await page.mouse.click(box.x + step * STEP + 6, box.y + row * ROW + 5);
    await page.waitForTimeout(150);
  };
  try {
    await page.goto(BASE);
    await id('lyric-page').waitFor({ timeout: 30000 });
    await id('song-title').fill('Melody Tools');
    await id('line-0-0-text').click();
    await id('section-0-input').pressSequentially('beautiful morning', { delay: 3 });
    await settle();
    await id('open-chords').click();
    await id('chords-sheet').waitFor();
    await page.waitForTimeout(450);
    await page.getByRole('tab', { name: 'Ideas', exact: true }).click();
    await id('set-key-C').click();
    await closeSheet();
    await id('section-0-menu').click();
    await id('dialog').getByRole('button', { name: 'Melody (piano roll)' }).click();
    await id('melody-0').waitFor();

    // C E G E, one note every beat (all notes of a C chord)
    for (const [step, midi] of [[0, 60], [4, 64], [8, 67], [12, 64]]) await tapCell(step, await rowOf(midi));

    const placed = await id('melody-0').evaluate((el) => [...el.querySelectorAll('[data-testid^="note-0-"]')].map((n) => n.getAttribute('aria-label')));
    assert.match(placed.join('|'), /^C4.*\|E4.*\|G4.*\|E4/);
    await check('harmonize: three-style answers for the tune, with how well they fit', async () => {
      await id('melody-harmonize-0').click();
      await id('harmonize-sheet').waitFor();
      await page.waitForTimeout(450);
      assert.match(await id('harmonize-key').innerText(), /C major.*your song/i);
      await id('harmony-simple').waitFor();
      assert.match(await id('harmony-simple').innerText(), /\bC\b/);
      assert.match(await id('harmony-fit-simple').innerText(), /Fits (9\d|100)%/);
    });

    await check('hear the melody over a suggestion, and stop it', async () => {
      await id('harmony-play-simple').click();
      await page.waitForTimeout(500);
      assert.equal(await id('harmony-play-simple').getAttribute('aria-label'), 'Stop');
      await id('harmony-play-simple').click();
      await page.waitForTimeout(300);
      assert.equal(await id('harmony-play-simple').getAttribute('aria-label'), 'Hear it');
    });

    await check('use the chords: they appear in the section', async () => {
      await id('harmony-use-simple').click();
      await page.waitForTimeout(600);
      await id('chord-grid-0').waitFor();
      assert.match(await id('chord-grid-0').innerText(), /\bC\b/);
    });

    await check('write to the tune: your line is checked against the notes, with a plain summary', async () => {
      await id('melody-fit-0').click();
      await id('fit-sheet').waitFor();
      await page.waitForTimeout(450);
      assert.equal(await id('fit-input-0').inputValue(), 'beautiful morning'); // starts from the line you have
      assert.match(await id('fit-summary-0').innerText(), /5 syllables for 4 notes.*1 too many/);
      assert.equal(await page.locator('[data-testid^="fit-slot-0-"]').count(), 4);
    });

    await check('a line that fits says so; using it writes the words and links them to the notes', async () => {
      await id('fit-input-0').fill('moon rose high now');
      await page.waitForTimeout(250);
      assert.match(await id('fit-summary-0').innerText(), /Fits the tune.*4 syllables for 4 notes/);
      assert.equal(await id('fit-syl-0-0').innerText(), 'moon');
      await id('fit-use').click();
      await page.waitForTimeout(600);
      assert.match(await id('section-0').innerText(), /moon rose high now/);
      const labels = await id('melody-0').evaluate((el) => [...el.querySelectorAll('[data-testid^="note-0-"]')].map((n) => n.getAttribute('aria-label')));
      assert.match(labels[0], /"moon"/);
    });

    assert.deepEqual(errors.filter((e) => !/favicon|DevTools|Download the React/i.test(e)), []);
    console.log('melody e2e passed');
  } catch (e) {
    console.error('\nFAILED:', e.message);
    await page.screenshot({ path: '/tmp/melody-fail.png' }).catch(() => {});
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
