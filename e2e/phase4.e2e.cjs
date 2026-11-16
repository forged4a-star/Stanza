/** Phase 4 in the browser: piano roll, scale lock, syllable links, checks, range, hum-to-MIDI. */
const { chromium } = require('playwright');
const { humWav, chordWav } = require('./fixtures.cjs');
const assert = require('node:assert/strict');
const BASE = process.env.BASE_URL || 'http://localhost:8081';
const shots = process.argv[2] || null;
const STEP = 22;
const ROW = 18;

(async () => {
  // the microphone hears a hummed phrase (C E G E) on a loop
  const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-audio-capture=${humWav()}`, '--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ viewport: { width: 400, height: 860 }, permissions: ['microphone'], acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
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
  const closeSheet = async () => {
    await page.getByRole('button', { name: 'Close sheet' }).last().click();
    await page.waitForTimeout(400);
  };
  const open = async (btn, sheet) => {
    await id(btn).click();
    await id(sheet).waitFor();
    await page.waitForTimeout(450);
  };
  const tab = (name) => page.getByRole('tab', { name, exact: true }).click();
  // the roll shows 25 rows; find the row of a MIDI note from the C labels
  const rowOf = async (midi) => {
    const labels = await id('melody-0').evaluate((el) => [...el.querySelectorAll('div')].map((d) => d.textContent).filter((x) => /^[A-G]#?\d$/.test(x)));
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const topC = labels[0];
    const topCMidi = (Number(topC.slice(-1)) + 1) * 12 + names.indexOf(topC.slice(0, -1));
    // top row is topCMidi + (24 - 12) when the roll is C-to-C; compute from the first C label's row instead
    const firstCRow = await id('melody-0').evaluate((el) => {
      const rows = [...el.querySelectorAll('div')].filter((d) => /^[A-G]#?\d$/.test(d.textContent || ''));
      const grid = el.querySelector('[data-testid="roll-grid-0"]').getBoundingClientRect();
      return Math.round((rows[0].getBoundingClientRect().top + 9 - grid.top) / 18);
    });
    return firstCRow + (topCMidi - midi);
  };
  const tapCell = async (step, row) => {
    const box = await id('roll-grid-0').boundingBox();
    await page.mouse.click(box.x + step * STEP + 6, box.y + row * ROW + 5);
    await page.waitForTimeout(150);
  };
  const notes = () => id('melody-0').evaluate((el) => [...el.querySelectorAll('[data-testid^="note-0-"]')].map((n) => n.getAttribute('aria-label')));

  try {
    await page.goto(BASE);
    await id('lyric-page').waitFor({ timeout: 30000 });
    await id('song-title').fill('Melody Test');
    await id('line-0-0-text').click();
    await id('section-0-input').pressSequentially('beautiful morning', { delay: 3 });
    await settle();
    await open('open-chords', 'chords-sheet');
    await tab('Ideas');
    await id('set-key-C').click();
    await page.getByRole('button', { name: 'Add Axis (I–V–vi–IV)' }).click();
    await closeSheet();

    await check('open the piano roll from the section menu', async () => {
      await id('section-0-menu').click();
      await id('dialog').getByRole('button', { name: 'Melody (piano roll)' }).click();
      await id('melody-0').waitFor();
    });

    await check('tap to add notes; they link to syllables in order', async () => {
      const r = await rowOf(64); // E4
      await tapCell(0, r);
      await tapCell(4, r + 1); // a step lower
      await tapCell(6, r + 2);
      await tapCell(8, r);
      const ns = await notes();
      assert.equal(ns.length, 4);
      assert.match(ns[0], /^E4 "beau"/);
      assert.match(ns[1], /"ti"/);
      assert.match(ns[3], /"mor"/);
      if (shots) await page.screenshot({ path: `${shots}/p4-roll.png` });
    });

    await check('scale lock snaps out-of-key taps into C major', async () => {
      const r = await rowOf(61); // C#4
      await tapCell(12, r);
      const ns = await notes();
      assert.match(ns[4], /^(C4|D4)/);
    });

    await check('select, move up in the scale, lengthen, delete', async () => {
      // a note you just added is already selected
      const before = (await notes())[4].slice(0, 2);
      await id('note-up').click();
      const after = (await notes())[4].slice(0, 2);
      assert.notEqual(before, after);
      await id('note-longer').click();
      await id('note-delete').click();
      assert.equal((await notes()).length, 4);
    });

    await check('prosody check flags a stressed syllable on a weak beat', async () => {
      // move "beau" off the downbeat: delete note at 0 and re-add at step 2... simpler: drag isn't needed — re-add
      await id('note-0-0').click();
      await id('note-delete').click();
      const r = await rowOf(64);
      await tapCell(2, r);
      await id('melody-0').getByRole('button', { name: 'Link notes to lyrics in order' }).click();
      await open('open-sound', 'sound-sheet');
      await tab('Checks');
      const text = await id('checks-0').innerText();
      assert.match(text, /PROSODY/);
      assert.match(text, /“beau” is stressed but falls on a weak/i);
      if (shots) await page.screenshot({ path: `${shots}/p4-checks.png` });
    });

    await check('vocal range guard flags notes outside your range', async () => {
      for (let i = 0; i < 12; i++) await id('range-high-down').click();
      assert.match(await id('vocal-range').innerText(), /E3 – C4/);
      const text = await id('checks-0').innerText();
      assert.match(text, /RANGE/);
      assert.match(text, /above your range/);
      await closeSheet();
      const ns = await notes();
      assert.ok(ns.some((x) => /above your range/.test(x)));
    });

    await check('play the melody over the chords', async () => {
      await id('melody-play-0').click();
      await page.waitForTimeout(800);
      assert.equal(await id('melody-play-0').getAttribute('aria-label'), 'Stop');
      await id('melody-play-0').click();
    });

    await check('hum-to-MIDI turns a sung take into notes', async () => {
      await id('melody-hum-0').click();
      await id('dialog-ok').click();
      await page.getByText('Listening… hum the melody').waitFor();
      await page.waitForTimeout(3500);
      await id('melody-hum-0').click();
      await page.getByText(/notes from your hum|Couldn't hear a melody/).waitFor({ timeout: 10000 });
      const msg = await page.getByText(/notes from your hum|Couldn't hear a melody/).innerText();
      console.log(`\n    ${msg}`);
      assert.match(msg, /notes from your hum/);
      const pitches = (await notes()).map((x) => x.split(' ')[0]);
      console.log('    notes: ' + pitches.join(' '));
      // the phrase is C E G E (it loops, so it may start anywhere in the loop)
      const seq = pitches.join(' ');
      assert.ok(/C4 E4 G4|E4 G4 E4|G4 E4 C4/.test(seq), seq);
    });

    await check('MIDI export includes the melody track', async () => {
      await id('open-song-sheet').click();
      await tab('Export');
      const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'MIDI (chords + melody)' }).click()]);
      const buf = require('node:fs').readFileSync(await dl.path());
      assert.equal(buf.slice(0, 4).toString(), 'MThd');
      const mtrk = buf.toString('latin1').split('MTrk').length - 1;
      assert.equal(mtrk, 3);
      // melody track has note-ons on channel 2 (0x91)
      assert.ok(buf.includes(Buffer.from([0x91])));
      await closeSheet();
    });

    await check('chord detector names a chord heard through the mic', async () => {
      const b2 = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-audio-capture=${chordWav()}`] });
      const p2 = await (await b2.newContext({ viewport: { width: 400, height: 860 }, permissions: ['microphone'] })).newPage();
      await p2.goto(BASE);
      await p2.getByTestId('lyric-page').waitFor({ timeout: 30000 });
      await p2.getByTestId('open-chords').click();
      await p2.getByTestId('chords-sheet').waitFor();
      await p2.waitForTimeout(450);
      await p2.getByRole('tab', { name: 'Listen', exact: true }).click();
      await p2.getByTestId('detect-toggle').click();
      await p2.waitForTimeout(2500);
      const heard = await p2.getByTestId('detected-chord').innerText();
      console.log(`\n    heard: ${heard}`);
      assert.equal(heard, 'G');
      await b2.close();
    });

    const real = errors.filter((e) => !/favicon|DevTools/i.test(e));
    if (real.length) console.log('\nBrowser errors:\n' + real.join('\n'));
    console.log('\nPhase 4 e2e: all checks passed');
  } catch (e) {
    console.log('FAILED');
    if (shots) await page.screenshot({ path: `${shots}/p4-failure.png` });
    console.error(e);
    console.log(errors.slice(0, 10).join('\n'));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
