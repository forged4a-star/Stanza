/** 1.1 batch 3: finish ring, capo help, chord feel, strum codes, time travel, lyric card, writing stats. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE = process.env.BASE_URL || 'http://localhost:8081';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 400, height: 860 }, permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true });
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
  const closeSheet = async () => {
    await page.getByRole('button', { name: 'Close sheet' }).last().click();
    await page.waitForTimeout(400);
  };
  const addBar = async (chord) => {
    await id('add-bar-0').click();
    await id('chord-picker').waitFor();
    await page.waitForTimeout(450);
    await id(`inkey-${chord}`).click();
    await id('picker-done').click();
    await page.waitForTimeout(350);
  };
  try {
    await page.goto(BASE);
    await id('lyric-page').waitFor({ timeout: 30000 });
    await id('song-title').fill('Batch Three');
    await id('line-0-0-text').click();
    await id('section-0-input').pressSequentially('alpha line one', { delay: 3 });
    await page.keyboard.press('Enter');
    await id('section-0-input').pressSequentially('beta line two', { delay: 3 });
    await settle();
    // chords: key D, then D G A Bm
    await id('open-chords').click();
    await id('chords-sheet').waitFor();
    await page.waitForTimeout(450);
    await page.getByRole('tab', { name: 'Ideas', exact: true }).click();
    await id('set-key-D').click();
    await id('add-D').first().click();
    await closeSheet();
    for (const c of ['G', 'A', 'Bm']) await addBar(c);

    await check('finish ring: how much is done and what is next', async () => {
      await id('open-song-sheet').click();
      await id('progress').waitFor();
      assert.match(await id('progress-title').innerText(), /\d of 5 parts done/);
      assert.match(await id('progress-next').innerText(), /Next:/);
      const items = await id('progress-items').innerText();
      assert.match(items, /✓ Chords/);
      assert.match(items, /✓ Title/);
      assert.match(items, /○ Melody/);
      await closeSheet();
    });

    await check('capo help: easiest capo for the chords, one tap to use it', async () => {
      await id('open-chords').click();
      await id('chords-sheet').waitFor();
      await page.waitForTimeout(450);
      await page.getByRole('tab', { name: 'Shapes', exact: true }).click();
      await id('capo-help').waitFor();
      assert.ok((await page.locator('[data-testid^="capo-option-"]').count()) >= 1);
      assert.match(await id('capo-help').innerText(), /play .* \(/);
      const use = page.locator('[data-testid^="use-capo-"]').first();
      await use.click();
      await page.waitForTimeout(300);
      assert.match(await id('capo-help').innerText(), /in use/);
      await closeSheet();
    });

    await check('chord feel: pick a mood, hear and swap a chord', async () => {
      await id('bar-0-0').getByRole('button').first().click();
      await id('chord-picker').waitFor();
      await page.waitForTimeout(450);
      await id('mood-warmer').click();
      await id('feel-swaps').waitFor();
      await id('swap-Dmaj7').click();
      assert.equal(await id('picker-name').innerText(), 'Dmaj7');
      await id('picker-done').click();
      await page.waitForTimeout(400);
      assert.match(await id('bar-0-0').innerText(), /Dmaj7/);
    });

    await check('strum codes: share one, import it back', async () => {
      await id('open-chords').click();
      await id('chords-sheet').waitFor();
      await page.waitForTimeout(450);
      await page.getByRole('tab', { name: 'Play', exact: true }).click();
      await id('new-strum').scrollIntoViewIfNeeded();
      await id('new-strum').click();
      await id('strum-editor').waitFor();
      await id('step-0').click();
      await id('step-2').click();
      await id('strum-name').fill('Share me');
      await id('strum-share').click();
      await page.waitForTimeout(300);
      const code = await page.evaluate(() => navigator.clipboard.readText());
      assert.match(code, /^stanza-strum\/1\/e\/n\/D-D-----\/Share_me~[0-9a-z]$/);
      await id('strum-save').click();
      await page.waitForTimeout(500);
      await id('import-strum').scrollIntoViewIfNeeded();
      await id('import-strum').click();
      await id('dialog-input').fill(`try this ${code} !!`);
      await id('dialog-ok').click();
      await page.waitForTimeout(500);
      assert.equal(await page.locator('[data-testid="custom-Share me"]').count(), 2);
      // a damaged code is refused with a reason, not added
      await id('import-strum').click();
      await id('dialog-input').fill(code.replace('D-D', 'U-U'));
      await id('dialog-ok').click();
      await page.waitForTimeout(500);
      assert.equal(await page.locator('[data-testid="custom-Share me"]').count(), 2);
      await closeSheet();
    });

    await check('time travel: scrub back, find a deleted line, pull it back', async () => {
      await id('open-song-sheet').click();
      await id('open-versions').click();
      await id('versions-sheet').waitFor();
      await page.waitForTimeout(450);
      await id('save-version').click();
      await id('dialog-input').fill('with beta');
      await id('dialog-ok').click();
      await page.waitForTimeout(600);
      await closeSheet();
      await id('line-0-0-text').click();
      await id('section-0-input').fill('alpha line one');
      await settle();
      await id('open-song-sheet').click();
      await id('open-versions').click();
      await id('versions-sheet').waitFor();
      await page.waitForTimeout(450);
      await page.getByRole('tab', { name: 'Time travel' }).click();
      await id('travel').waitFor({ timeout: 20000 });
      assert.equal(await id('travel-label').innerText(), 'Now');
      let found = false;
      for (let i = 0; i < 12 && !found; i++) {
        await id('travel-earlier').click();
        await page.waitForTimeout(150);
        found = (await id('travel-gone').count()) > 0 && /beta line two/.test(await id('travel-gone').innerText());
      }
      assert.ok(found, 'an earlier version still has the deleted line');
      assert.match(await id('travel-step').innerText(), /Since the version before|Earliest/);
      await id('pull-0').click();
      await page.waitForTimeout(500);
      await closeSheet();
      assert.match(await id('section-0').innerText(), /beta line two/);
    });

    await check('lyric card: a picture of a section, as a real PNG', async () => {
      await id('open-song-sheet').click();
      await page.getByRole('tab', { name: 'Export' }).click();
      await id('open-card-image').click();
      await id('card-image-sheet').waitFor();
      await page.waitForTimeout(450);
      await id('cardimg-preview').waitFor();
      assert.match(await id('cardimg-preview').innerText(), /alpha line one/);
      await id('cardimg-theme-ink').click();
      await id('cardimg-ratio').getByRole('tab', { name: /Tall/ }).click();
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), id('cardimg-share').click()]);
      assert.match(dl.suggestedFilename(), /Batch Three - card\.png/);
      const chunks = [];
      for await (const c of await dl.createReadStream()) chunks.push(c);
      const bytes = Buffer.concat(chunks);
      assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
      assert.ok(bytes.length > 2000);
      await closeSheet();
    });

    await check('writing stats and the ring on the song list', async () => {
      await page.waitForTimeout(4600); // stats are written to the device a few seconds after the last edit
      await page.goto(BASE + '/settings');
      await id('writing-stats').waitFor({ timeout: 30000 });
      assert.match(await id('stat-lines').innerText(), /\d+ lines? written, \d+ sent to the scrapyard/);
      const written = Number((await id('stat-lines').innerText()).match(/(\d+) lines? written/)[1]);
      assert.ok(written >= 2, `lines written counted (${written})`);
      assert.match(await id('stat-time').innerText(), /writing/);
      assert.match(await id('stat-streak').innerText(), /day|streak/);
      await page.goto(BASE + '/library');
      await id('new-song').waitFor({ timeout: 30000 });
      assert.ok((await page.getByLabel(/of 5 parts done/).count()) >= 1);
    });

    assert.deepEqual(errors.filter((e) => !/favicon|DevTools|Download the React/i.test(e)), []);
    console.log('batch 3 e2e passed');
  } catch (e) {
    console.error('\nFAILED:', e.message);
    await page.screenshot({ path: '/tmp/batch3-fail.png' }).catch(() => {});
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
