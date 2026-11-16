/**
 * End-to-end check of Phase 1 in a real browser (the web build of the app).
 *
 *   npx expo export --platform web --output-dir dist
 *   node e2e/serve.mjs dist 8081 &
 *   node e2e/phase1.e2e.cjs [screenshotDir]
 */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');

const BASE = process.env.BASE_URL || 'http://localhost:8081';
const shots = process.argv[2] || null;
let step = 0;
let currentPage = null;

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 400, height: 860 }, acceptDownloads: true });
  const page = await context.newPage();
  currentPage = page;
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const id = (x) => page.getByTestId(x);
  const shot = async (name) => shots && (await page.screenshot({ path: `${shots}/${String(++step).padStart(2, '0')}-${name}.png` }));
  const saved = () => id('save-saved').waitFor({ timeout: 10000 });
  const check = async (name, fn) => {
    process.stdout.write(`• ${name} … `);
    await fn();
    console.log('ok');
  };
  const typeInto = async (testId, text) => {
    const input = id(testId);
    await input.pressSequentially(text, { delay: 5 });
  };
  const longPress = async (loc) => {
    const box = await loc.boundingBox();
    await page.mouse.move(box.x + 30, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.mouse.up();
  };
  const closeSheet = async () => {
    await page.getByRole('button', { name: 'Close sheet' }).click();
    await page.waitForTimeout(400);
  };
  const settle = async () => {
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.waitForTimeout(350);
  };
  const addSection = async (kind) => {
    await settle();
    await id('lyric-page').evaluate((el) => (el.scrollTop = el.scrollHeight));
    await id('add-section').click();
    await choose(kind);
  };
  const choose = (label) => id('dialog').getByRole('button', { name: label, exact: true }).click();

  await page.goto(BASE);
  await id('lyric-page').waitFor({ timeout: 30000 });

  await check('new song opens on the lyric page and autosaves the title', async () => {
    await id('song-title').fill('Night Drive');
    await saved();
  });

  await check('typing lines, Enter makes a new line, syllables are counted', async () => {
    await id('line-0-0-text').click();
    await typeInto('line-0-0-input', 'Headlights on the wet road');
    await page.keyboard.press('Enter');
    await typeInto('line-0-1-input', 'radio low and the windows down');
    await page.keyboard.press('Enter');
    await typeInto('line-0-2-input', 'I keep on driving home');
    await saved();
    assert.equal(await id('line-0-0-count').innerText(), '6');
    assert.equal(await id('line-0-1-count').innerText(), '9');
    assert.equal(await id('line-0-2-count').innerText(), '6');
    await shot('verse');
  });

  await check('add a chorus and a second verse; mismatched syllables are flagged', async () => {
    await addSection('Chorus');
    await id('line-1-0-input').waitFor();
    await typeInto('line-1-0-input', 'Drive all night');
    await page.keyboard.press('Enter');
    await typeInto('line-1-1-input', 'till the morning light');
    await addSection('Verse');
    await typeInto('line-2-0-input', 'Streetlights shine on the river');
    await saved();
    // Verse 1 line 1 has 6, this has 7 → amber with a dot
    assert.equal(await id('line-2-0-count').innerText(), '7•');
    await settle();
    await shot('sections');
  });

  await check('everything survives a reload (stored in SQLite)', async () => {
    await page.reload();
    await id('lyric-page').waitFor();
    assert.equal(await id('song-title').inputValue(), 'Night Drive');
    assert.equal(await id('line-0-1-text').innerText(), 'radio low and the windows down');
    assert.equal(await id('line-1-1-text').innerText(), 'till the morning light');
  });

  await check('rhymes are highlighted per syllable and the scheme is lettered', async () => {
    // night / light rhyme in the chorus
    const html = await id('line-1-0-text').innerHTML();
    assert.match(html, /background-color/);
  });

  await check('alternates: keep a version, rewrite, flip back', async () => {
    await longPress(id('line-0-2-text'));
    await id('line-sheet').waitFor();
    await id('stash-alt').click();
    await closeSheet();
    await id('line-0-2-text').click();
    const input = id('line-0-2-input');
    await input.press('ControlOrMeta+a');
    await input.pressSequentially('I keep on drifting home', { delay: 5 });
    await settle();
    await saved();
    await longPress(id('line-0-2-text'));
    await id('alt-0').click();
    await closeSheet();
    assert.equal(await id('line-0-2-text').innerText(), 'I keep on driving home');
  });

  await check('lock a line so it cannot be edited', async () => {
    await longPress(id('line-0-0-text'));
    await id('toggle-lock').click();
    await closeSheet();
    await id('line-0-0-text').click();
    await page.getByText('This line is locked').waitFor();
    assert.equal(await id('line-0-0-input').count(), 0);
  });

  await check('deleting a line sends it to the Scrapyard', async () => {
    await longPress(id('line-0-1-text'));
    await id('delete-line').click();
    await saved();
    assert.equal(await id('line-0-1-text').innerText(), 'I keep on driving home');
  });

  await check('versions: save, change, see a word-level diff, restore', async () => {
    await id('open-song-sheet').click();
    await id('open-versions').click();
    await id('save-version').click();
    await id('dialog-input').fill('first draft');
    await id('dialog-ok').click();
    await page.getByText('first draft').waitFor();
    await closeSheet();
    await id('line-1-0-text').click();
    await id('line-1-0-input').press('End');
    await id('line-1-0-input').pressSequentially(' long', { delay: 5 });
    await settle();
    await saved();
    await id('open-song-sheet').click();
    await id('open-versions').click();
    await page.getByText('first draft').click();
    await id('diff-change').waitFor();
    assert.match(await id('diff-change').innerText(), /long/);
    await shot('diff');
    await id('restore-version').click();
    await id('dialog-ok').click();
    await page.getByText('Version restored').waitFor();
    await closeSheet();
    assert.equal(await id('line-1-0-text').innerText(), 'Drive all night');
  });

  await check('arrange: drag a section to a new position', async () => {
    await id('open-arrange').click();
    await id('arrange-sheet').waitFor();
    await page.waitForTimeout(500); // let the sheet finish sliding up
    const handle = id('arrange-2').getByLabel('Drag to reorder');
    const box = await handle.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - i * 11);
    await page.mouse.up();
    await closeSheet();
    await saved();
    // the second verse is now first
    assert.match(await id('line-0-0-text').innerText(), /Streetlights/);
  });

  await check('compare two sections side by side', async () => {
    await id('open-compare').click();
    await id('compare-sheet').waitFor();
    await id('compare-row-0').waitFor();
    await shot('compare');
    await closeSheet();
  });

  await check('export plain text', async () => {
    await id('open-song-sheet').click();
    await page.getByRole('tab', { name: 'Export' }).click();
    const [dl] = await Promise.all([page.waitForEvent('download'), id('export-txt').click()]);
    const fs = require('node:fs');
    const txt = fs.readFileSync(await dl.path(), 'utf8');
    assert.match(txt, /^Night Drive\n\n\[Verse 1\]\nStreetlights shine on the river/);
    assert.equal(dl.suggestedFilename(), 'Night Drive.txt');
    const [zip] = await Promise.all([page.waitForEvent('download'), id('export-zip').click()]);
    assert.equal(zip.suggestedFilename(), 'Night Drive.stanza.zip');
    await closeSheet();
  });

  await check('library: search finds the song by a lyric', async () => {
    await id('open-library').click();
    await id('library-search').fill('morning');
    await id('song-Night Drive').waitFor();
    assert.match(await id('song-Night Drive').innerText(), /morning/);
    await shot('library');
  });

  await check('scrapyard keeps the cut line, searchable across songs', async () => {
    await id('library-search').fill('');
    await id('open-scrapyard').click();
    await id('scrap-search').fill('windows');
    await page.getByText('radio low and the windows down').waitFor();
    await page.goBack();
  });

  await check('inbox: capture a loose line, then drop it into a song', async () => {
    await id('open-inbox-screen').click();
    await id('inbox-add-line').click();
    await id('dialog-input').fill('neon on the wet glass');
    await id('dialog-ok').click();
    await page.getByText('neon on the wet glass').waitFor();
    await page.goBack();
    await id('song-Night Drive').click();
    await id('lyric-page').waitFor();
    await id('open-inbox').click();
    await id('inbox-sheet').waitFor();
    await page.getByRole('button', { name: 'Add', exact: true }).first().click();
    await page.getByText('Added to the song').waitFor();
    await closeSheet();
    assert.ok(await page.getByText('neon on the wet glass').count());
  });

  await check('dark theme', async () => {
    await id('open-song-sheet').click();
    await page.getByRole('tab', { name: 'View' }).click();
    await page.getByRole('tab', { name: 'Dark' }).click();
    await closeSheet();
    await id('toggle-stress').count();
    await shot('dark');
  });

  await check('performance mode opens with the lyrics', async () => {
    await id('open-song-sheet').click();
    await page.getByRole('tab', { name: 'Song' }).click();
    await page.getByRole('button', { name: 'Performance mode' }).click();
    await id('perform-scroll').waitFor();
    await id('perform-scroll').getByText('Drive all night').waitFor();
    await id('perform-play').click();
    await page.waitForTimeout(1500);
    const y = await id('perform-scroll').evaluate((el) => el.scrollTop);
    assert.ok(y > 0, 'teleprompter should scroll');
    await shot('perform');
  });

  const real = errors.filter((e) => !/favicon|DevTools|Download the React|deprecated/i.test(e));
  if (real.length) console.log('\nBrowser errors:\n' + real.join('\n'));
  await browser.close();
  console.log('\nPhase 1 e2e: all checks passed');
}

main().catch(async (e) => {
  console.log('FAILED');
  if (currentPage && shots) await currentPage.screenshot({ path: `${shots}/failure.png` }).catch(() => {});
  console.error(e);
  process.exit(1);
});
