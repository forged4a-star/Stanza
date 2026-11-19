/**
 * 1.1 batch 4: overview and heat map, song goals, practice loop, tuner and
 * drone, A/B takes, hand-off note, stage view (contrast, pages), open-mic and
 * setlists.
 */
const { chromium } = require('playwright');
const fs = require('node:fs');
const { navId, closeTop } = require('./nav.cjs');
const { humWav } = require('./fixtures.cjs');
const assert = require('node:assert/strict');
const BASE = process.env.BASE_URL || 'http://localhost:8081';
const shots = process.argv[2] || null;

(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-audio-capture=${humWav()}`, '--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ viewport: { width: 400, height: 860 }, permissions: ['microphone'], acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const id = navId(page);
  let n = 0;
  const shot = async (name) => shots && (await page.screenshot({ path: `${shots}/${String(++n).padStart(2, '0')}-${name}.png` }));
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
  /** tap a line until its editor is open (the page can still be settling just after it loads) */
  const edit = async (line, input) => {
    for (let k = 0; k < 6; k++) {
      await id(line).click();
      await page.waitForTimeout(400);
      if ((await page.getByTestId(input).count()) > 0) return;
    }
    throw new Error(`could not open the editor for ${line}`);
  };
  const tab = (name) => page.getByRole('tab', { name, exact: true }).click();
  const addBar = async (chord) => {
    await id('add-bar-0').click();
    await id('chord-picker').waitFor();
    await page.waitForTimeout(450);
    await id(`inkey-${chord}`).click();
    await id('picker-done').click();
    await page.waitForTimeout(350);
  };
  const dialogChoose = (label) => id('dialog').getByRole('button', { name: label }).click();
  const addSection = async (kind) => {
    await settle();
    await id('lyric-page').evaluate((el) => (el.scrollTop = el.scrollHeight));
    await id('add-section').click();
    await id('dialog').getByRole('button', { name: kind, exact: true }).click();
  };

  try {
    await page.goto(BASE);
    await id('lyric-page').waitFor({ timeout: 30000 });
    await id('song-title').fill('Batch Four');
    await id('save-saved').waitFor({ timeout: 10000 });
    await page.waitForTimeout(400);
    await edit('line-0-0-text', 'section-0-input');
    for (const l of ['alpha line one', 'beta line two', 'gamma line three', 'delta line four']) {
      await id('section-0-input').pressSequentially(l, { delay: 3 });
      if (l !== 'delta line four') await page.keyboard.press('Enter');
    }
    await settle();
    // key D and D G A Bm in the verse (chords go to the section you are in)
    await id('open-chords').click();
    await id('chords-sheet').waitFor();
    await page.waitForTimeout(450);
    await tab('Ideas');
    await id('set-key-D').click();
    await id('add-D').first().click();
    // a fast tempo keeps the playback checks short
    await tab('Play');
    await id('player-bpm').fill('300');
    await id('player-bpm').press('Enter');
    await closeSheet();
    for (const c of ['G', 'A', 'Bm']) await addBar(c);

    await addSection('Chorus');
    await id('section-1-input').waitFor();
    await id('section-1-input').pressSequentially('hey now one chorus line', { delay: 3 });
    await settle();
    await check('overview: sections drawn to length, with a heat strip', async () => {
      await id('open-shape').click();
      await id('overview').waitFor();
      assert.equal(await page.locator('[data-testid^="overview-span-"]').count(), 2);
      const tl = await id('overview-timeline').getAttribute('aria-label');
      assert.match(tl, /Verse: 8 bars/);
      assert.match(tl, /Chorus: 2 bars/);
      for (const row of ['words', 'chords', 'melody']) assert.equal(await id(`heat-${row}`).count(), 1);
      assert.equal(await id('heat-chords-1').getAttribute('aria-label'), 'Chords: none');
      assert.match(await id('heat-chords-0').getAttribute('aria-label'), /Chords: 1 chords a bar/);
      assert.match(await id('overview-notes').innerText(), /chorus|Chorus/);
      await shot('overview');
    });

    await check('goal: set one, see progress, edit, remove', async () => {
      assert.match(await id('goal-card').innerText(), /Set a goal/);
      await id('goal-card').click();
      await id('goal-sheet').waitFor();
      await id('goal-preset-hook').click();
      assert.equal(await id('goal-verse').innerText(), '1');
      assert.equal(await id('goal-chorus').innerText(), '1');
      await id('goal-due-Tomorrow').click();
      await id('goal-save').click();
      await page.waitForTimeout(500);
      // the chorus has one line, so it does not count yet
      assert.match(await id('goal-status').innerText(), /1 of 2 still to do\. Due tomorrow/);
      assert.match(await id('goal-item-1').innerText(), /○ 1 chorus \(0 so far\)/);
      assert.match(await id('goal-item-0').innerText(), /✓ 1 verse/);
      await shot('goal');
      // finishing the chorus reaches the goal
      await id('tab-write').click();
      await edit('line-1-0-text', 'section-1-input');
      await id('section-1-input').press('End');
      await page.keyboard.press('Enter');
      await id('section-1-input').pressSequentially('and a second chorus line', { delay: 3 });
      await settle();
      await id('open-shape').click();
      await page.waitForTimeout(400);
      assert.match(await id('goal-status').innerText(), /Goal reached/);
      await id('goal-card').click();
      await id('goal-sheet').waitFor();
      await id('goal-remove').click();
      await page.waitForTimeout(400);
      assert.match(await id('goal-card').innerText(), /Set a goal/);
    });

    await check('practice loop: starts slow, plays, stops, leaves the song tempo alone', async () => {
      await id('open-chords').click();
      await id('chords-sheet').waitFor();
      await page.waitForTimeout(450);
      await tab('Practice');
      await id('practice-tab').waitFor();
      assert.match(await id('practice-chords').innerText(), /D\s+G\s+A\s+Bm/);
      await id('practice-to-down').click();
      await id('practice-to-down').click();
      await id('practice-to-down').click();
      assert.equal(await id('practice-to').innerText(), '1');
      assert.equal(await id('practice-from').innerText(), '1');
      assert.match(await id('practice-chords').innerText(), /^D$/);
      await id('practice-start-btn').click();
      await id('practice-status').waitFor();
      assert.match(await id('practice-status').innerText(), /180 bpm/); // 60% of 300
      assert.match(await id('practice-status').innerText(), /Play 1 of/);
      await shot('practice');
      // a pass is one 300 bpm bar (about 1 s); it moves on by itself
      await page.waitForFunction(() => /Play [2-9] of/.test(document.querySelector('[data-testid="practice-status"]')?.textContent || ''), null, { timeout: 15000 });
      await id('practice-stop').click();
      await page.waitForTimeout(300);
      assert.equal(await id('practice-status').count(), 0);
      await tab('Play');
      assert.equal(await id('player-bpm').inputValue(), '300');
      await closeSheet();
    });

    await check('tuner and drone: the drone names the key notes; the tuner reads a note from the mic', async () => {
      await id('open-chords').click();
      await id('chords-sheet').waitFor();
      await page.waitForTimeout(450);
      await tab('Listen');
      await tab('Tuner and drone');
      await id('tuner-panel').waitFor();
      assert.equal(await id('drone-notes').innerText(), 'D2 · A2');
      await tab('Open');
      assert.equal(await id('drone-notes').innerText(), 'D2 · A2 · D3');
      await tab('Root');
      assert.equal(await id('drone-notes').innerText(), 'D2');
      await id('drone-toggle').click();
      assert.match(await id('drone-toggle').innerText(), /Stop drone/);
      await page.waitForTimeout(500);
      await id('drone-toggle').click();
      assert.match(await id('drone-toggle').innerText(), /Start drone/);
      await id('tuner-toggle').click();
      await page.waitForFunction(() => /^[A-G]#?\d$/.test(document.querySelector('[data-testid="tuner-note"]')?.textContent || ''), null, { timeout: 15000 });
      const note = await id('tuner-note').innerText();
      assert.ok(['C4', 'E4', 'G4'].includes(note), `hummed C E G, tuner read ${note}`);
      assert.match(await id('tuner-cents').innerText(), /In tune|cents (flat|sharp)/);
      await shot('tuner');
      await id('tuner-toggle').click();
      await closeSheet();
    });

    await check('two takes: compare them A/B with matched loudness', async () => {
      for (const k of [1, 2]) {
        await id('tab-write').click();
        await id('section-0-record').click();
        await id('capture-bar').waitFor();
        await page.waitForTimeout(3500);
        await id('capture-stop').click();
        await page.getByText(new RegExp(`Saved: Verse take ${k}`)).waitFor({ timeout: 15000 });
        await page.waitForTimeout(800);
      }
      await id('open-takes').click();
      await id('takes-sheet').waitFor();
      await page.getByRole('button', { name: /^Options for Verse take 1/ }).click();
      await dialogChoose(/Compare with another take/);
      await id('ab-picking').waitFor();
      await page.getByRole('button', { name: /^Options for Verse take 2/ }).click();
      await dialogChoose(/Compare with/);
      await id('ab-panel').waitFor();
      assert.match(await id('ab-time').innerText(), /^0:00 \//);
      await id('ab-play').click();
      await page.waitForTimeout(1800);
      assert.doesNotMatch(await id('ab-time').innerText(), /^0:00 \//);
      await id('ab-pick-b').click();
      await page.getByText('Now hearing B').waitFor();
      await page.waitForTimeout(700);
      assert.doesNotMatch(await id('ab-time').innerText(), /^0:00 \//, 'switching keeps the position');
      assert.equal(await id('ab-match').count(), 1);
      await shot('ab');
      await id('ab-play').click();
      await id('ab-close').click();
      assert.equal(await id('ab-panel').count(), 0);
    });

    await check('hand-off note: what is done, what is open', async () => {
      await id('open-song-sheet').click();
      await tab('Export');
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), id('export-handoff').click()]);
      assert.match(dl.suggestedFilename(), /hand-off\.txt$/);
      const text = fs.readFileSync(await dl.path(), 'utf8');
      assert.match(text, /^Batch Four\nD major · 300 bpm/);
      assert.match(text, /WHERE IT STANDS \(\d of 5 parts\)/);
      assert.match(text, /\[x\] A take/);
      assert.match(text, /- Verse: 4 lines, chords/);
      assert.match(text, /- Chorus: 2 lines/);
      assert.doesNotMatch(text, /alpha line one/, 'the note never contains the lyrics');
      await tab('Details');
    });

    await check('stage view: high contrast and page-turning like a music stand', async () => {
      await id('open-stage').click();
      await id('stage-view').waitFor();
      const bg = () => id('stage-view').evaluate((el) => getComputedStyle(el).backgroundColor);
      assert.notEqual(await bg(), 'rgb(0, 0, 0)');
      await id('stage-contrast').click();
      await page.waitForTimeout(300);
      assert.equal(await bg(), 'rgb(0, 0, 0)');
      assert.match(await id('stage-contrast').innerText(), /High contrast on/);
      await shot('stage-contrast');
      for (let i = 0; i < 9; i++) await id('stage-larger').click();
      await id('stage-layout').click();
      await id('stage-pages').waitFor();
      const count = async () => (await id('stage-page-count').innerText()).match(/Page (\d+) of (\d+)/).slice(1).map(Number);
      const [p1, total] = await count();
      assert.equal(p1, 1);
      assert.ok(total >= 2, `big type spreads over several pages (got ${total})`);
      await shot('stage-pages');
      await id('stage-next').click();
      assert.equal((await count())[0], 2);
      await id('stage-prev').click();
      assert.equal((await count())[0], 1);
      await id('stage-prev').click();
      assert.equal((await count())[0], 1, 'cannot go before the first page');
      // pages and contrast are remembered next time
      await id('stage-close').click();
      await page.waitForTimeout(500);
      await id('open-stage').click();
      await id('stage-pages').waitFor();
      assert.equal(await bg(), 'rgb(0, 0, 0)');
      await id('stage-layout').click();
      await id('perform-scroll').waitFor();
      await id('stage-contrast').click();
      await id('stage-close').click();
      await page.waitForTimeout(400);
    });

    await check('open-mic: count-in, scrolls for the length of the song, then offers to go again', async () => {
      await id('open-mic').click();
      await id('mic-count').waitFor();
      assert.match(await id('mic-count').innerText(), /3/);
      await shot('mic-count');
      await page.waitForFunction(() => !document.querySelector('[data-testid="mic-count"]'), null, { timeout: 8000 });
      assert.match(await id('mic-toggle').innerText(), /Pause/);
      // it must not announce the end the moment it starts, even if the whole song fits on the screen
      await page.waitForTimeout(1500);
      assert.equal(await id('mic-finished').count(), 0);
      await id('mic-finished').waitFor({ timeout: 25000 });
      assert.match(await id('mic-finished').innerText(), /That's the song/);
      assert.equal(await id('mic-next').count(), 0, 'no next song outside a setlist');
      await shot('mic-finished');
      await id('mic-again').click();
      await id('mic-count').waitFor();
      await id('mic-count').click();
      await page.waitForTimeout(500);
      await id('mic-toggle').click();
      assert.match(await id('mic-toggle').innerText(), /Go/);
      await id('stage-close').click();
      await page.waitForTimeout(400);
    });

    await check('setlist: make one, add songs, move one, shift a key, play through', async () => {
      // a second song
      await id('open-library').click();
      await id('new-song').click();
      await id('song-title').fill('Second Song');
      await edit('line-0-0-text', 'section-0-input');
      await id('section-0-input').pressSequentially('only one line here', { delay: 3 });
      await settle();
      await id('open-library').click();
      await id('open-setlists').click();
      await id('setlists').waitFor();
      await id('new-setlist').click();
      await id('dialog-input').fill('Friday');
      await id('dialog-ok').click();
      await id('setlist-page').waitFor();
      await id('setlist-add').click();
      await id('pick-Batch Four').click();
      await id('setlist-add').click();
      await id('pick-Second Song').click();
      await page.waitForTimeout(400);
      assert.match(await id('setlist-totals').innerText(), /^2 songs/);
      assert.match(await id('setlist-item-0').innerText(), /Batch Four/);
      assert.match(await id('setlist-key-0').innerText(), /Key D/);
      await id('setlist-tup-0').click();
      await page.waitForTimeout(300);
      assert.match(await id('setlist-key-0').innerText(), /Key Eb/);
      assert.match(await id('setlist-item-0').innerText(), /Chords up 1/);
      await id('setlist-note-0').click();
      await id('dialog-input').fill('start quiet');
      await id('dialog-ok').click();
      await page.waitForTimeout(300);
      assert.match(await id('setlist-item-0').innerText(), /start quiet/);
      await id('setlist-down-0').click();
      await page.waitForTimeout(400);
      assert.match(await id('setlist-item-0').innerText(), /Second Song/);
      assert.match(await id('setlist-item-1').innerText(), /Batch Four/);
      assert.match(await id('setlist-key-1').innerText(), /Key Eb/, 'the shift moved with its song');
      await shot('setlist');
      // survives leaving and coming back
      await id('setlist-back').click();
      await id('setlists').waitFor();
      await id('setlist-Friday').click();
      await id('setlist-page').waitFor();
      await page.waitForTimeout(400);
      assert.match(await id('setlist-item-0').innerText(), /Second Song/);
      assert.match(await id('setlist-item-1').innerText(), /start quiet/);
      // play from the top: the short song, then the next one comes up with its key
      await id('setlist-play').click();
      await id('mic-count').waitFor();
      await id('mic-count').click();
      await id('mic-finished').waitFor({ timeout: 40000 });
      assert.match(await id('mic-next-title').innerText(), /Up next: Batch Four[\s\S]*key Eb[\s\S]*start quiet/);
      await id('mic-next').click();
      await id('mic-count').waitFor();
      assert.match(await id('stage-view').innerText(), /Song 2 of 2/);
      // the chords are moved up a semitone, spelled for the new key
      await id('mic-count').click();
      await page.waitForTimeout(400);
      const chords = await id('stage-section-0').innerText();
      assert.match(chords, /Eb\s+\|\s+Ab\s+\|\s+Bb\s+\|\s+Cm/);
      await id('stage-close').click();
      await id('setlist-page').waitFor();
    });

    const real = errors.filter((e) => !/favicon|DevTools|Download the React|deprecated/i.test(e));
    if (real.length) console.log('\nBrowser errors:\n' + real.join('\n'));
    await browser.close();
    console.log('\nBatch 4 e2e: all checks passed');
  } catch (e) {
    console.log('FAILED');
    if (shots) await page.screenshot({ path: `${shots}/failure.png` }).catch(() => {});
    console.error(e);
    await browser.close();
    process.exit(1);
  }
})();
