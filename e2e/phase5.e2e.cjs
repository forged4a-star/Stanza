/**
 * Phase 5 in the browser: feeling map, contrast meter, questions, cliché flags,
 * then backup/sync and live co-writing between two separate "devices"
 * (browser contexts) through a real Stanza server.
 */
const { chromium } = require('playwright');
const { navId, closeTop } = require('./nav.cjs');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const path = require('node:path');
const BASE = process.env.BASE_URL || 'http://localhost:8081';
const SERVER_PORT = 8799;
const SERVER = `http://localhost:${SERVER_PORT}`;
const shots = process.argv[2] || null;

(async () => {
  const server = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'server.ts')], { env: { ...process.env, STANZA_TOKEN: 'test-key', PORT: String(SERVER_PORT), STANZA_DB: ':memory:' }, stdio: 'pipe' });
  await new Promise((res) => server.stdout.on('data', (d) => /server on/.test(String(d)) && res()));
  const browser = await chromium.launch();
  const devA = await browser.newContext({ viewport: { width: 400, height: 860 }, acceptDownloads: true });
  const devB = await browser.newContext({ viewport: { width: 400, height: 860 } });
  const page = await devA.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const id = (x, p = page) => navId(p)(x);
  const check = async (name, fn) => {
    process.stdout.write(`• ${name} … `);
    await fn();
    console.log('ok');
  };
  const settle = async (p = page) => {
    await p.evaluate(() => document.activeElement && document.activeElement.blur());
    await p.waitForTimeout(350);
  };
  const closeSheet = async (p = page) => {
    await closeTop(p);
    await p.waitForTimeout(400);
  };
  const tab = (name, p = page) => p.getByRole('tab', { name, exact: true }).click();
  const addSection = async (kind, p = page) => {
    await settle(p);
    await id('lyric-page', p).evaluate((el) => (el.scrollTop = el.scrollHeight));
    await id('add-section', p).click();
    await id('dialog', p).getByRole('button', { name: kind, exact: true }).click();
  };
  const setupSync = async (p, name) => {
    await p.goto(BASE + '/settings');
    await id('sync-url', p).fill(SERVER);
    await id('sync-token', p).fill('test-key');
    await id('sync-name', p).fill(name);
    await settle(p);
  };

  try {
    await page.goto(BASE);
    await id('lyric-page').waitFor({ timeout: 30000 });
    await id('song-title').fill('Shape Song');
    await id('line-0-0-text').click();
    await id('section-0-input').pressSequentially('I walked along the river in the rain tonight', { delay: 2 });
    await page.keyboard.press('Enter');
    await id('section-0-input').pressSequentially('and every window on the street was closed', { delay: 2 });
    await addSection('Chorus');
    await id('section-1-input').pressSequentially('you set me free', { delay: 2 });
    await settle();

    await check('feeling map: name each section’s feeling, see the arc', async () => {
      await id('open-song-sheet').click();
      await id('open-shape').click();
      await id('shape-sheet').waitFor();
      await page.waitForTimeout(450);
      await id('feeling-input-0').fill('restless');
      await id('feeling-input-1').fill('breaking open');
      const box = await id('intensity-1').boundingBox();
      await page.mouse.click(box.x + box.width * 0.9, box.y + box.height / 2);
      const arc = await id('feeling-arc').innerText();
      assert.match(arc, /restless/);
      assert.match(arc, /breaking open/);
      if (shots) await page.screenshot({ path: `${shots}/p5-feeling.png` });
    });

    await check('energy map: drag the arc, see when the song plays against it', async () => {
      await tab('Energy');
      const box = await id('energy-chart').boundingBox();
      const at = (fx, fy) => [box.x + box.width * fx, box.y + box.height * fy];
      // quiet verse, big chorus: the chorus has the shorter line, so the song agrees
      let [x, y] = at(0.06, 0.8);
      await page.mouse.click(x, y);
      [x, y] = at(0.94, 0.15);
      await page.mouse.click(x, y);
      await id('energy-ok').waitFor();
      // now ask for a big verse and a small chorus: it disagrees and names a lever
      [x, y] = at(0.06, 0.1);
      await page.mouse.click(x, y);
      [x, y] = at(0.94, 0.85);
      await page.mouse.click(x, y);
      await id('energy-advice').waitFor();
      const adv = await id('energy-advice').innerText();
      assert.match(adv, /bigger|Plays bigger/);
      assert.match(adv, /Verse|Chorus/);
    });

    await check('contrast meter compares verse and chorus', async () => {
      await tab('Contrast');
      assert.match(await id('contrast-verdict').innerText(), /contrast|alike/i);
      assert.match(await id('contrast-lineLength').innerText(), /shorter/);
    });

    await check('questions help you say what you mean (and never write lines)', async () => {
      await tab('Questions');
      const qs = await id('questions').innerText();
      assert.match(qs, /\?/);
      await closeSheet();
      await id('line-0-0').innerText(); // the lyric is untouched
      assert.equal(await id('line-0-0-text').innerText(), 'I walked along the river in the rain tonight');
    });

    await check('cliché flags are off by default, and mark well-worn phrases when on', async () => {
      assert.doesNotMatch(await id('line-1-0-text').innerHTML(), /dotted/);
      await id('open-song-sheet').click();
      await tab('View');
      await id('toggle-cliches').click();
      await closeSheet();
      assert.match(await id('line-1-0-text').innerHTML(), /dotted/);
      await id('open-sound').click();
      await id('sound-sheet').waitFor();
      await page.waitForTimeout(400);
      await tab('Checks');
      assert.match(await id('flag-list').innerText(), /set me free/);
      await closeSheet();
    });

    let songUrl = '';
    await check('backup & sync: device A pushes, device B receives the song', async () => {
      songUrl = page.url();
      await setupSync(page, 'Alice');
      await id('sync-now').click();
      await page.getByText(/Synced: 1 sent/).waitFor({ timeout: 10000 });
      const pb = await devB.newPage();
      pb.on('pageerror', (e) => errors.push('B: ' + e.message));
      await pb.goto(BASE);
      await id('lyric-page', pb).waitFor({ timeout: 30000 });
      await setupSync(pb, 'Bob');
      await id('sync-now', pb).click();
      await pb.getByText(/Synced: .*1 received/).waitFor({ timeout: 10000 });
      await pb.goto(BASE + '/library');
      await id('song-Shape Song', pb).waitFor();
      await pb.close();
    });

    let link = '';
    await check('share a song for co-writing by link', async () => {
      await page.goto(songUrl);
      await id('lyric-page').waitFor();
      await id('open-song-sheet').click();
      await id('share-song').click();
      await id('dialog-input').waitFor({ timeout: 10000 });
      link = await id('dialog-input').inputValue();
      assert.match(link, /\/join\/[0-9a-f]+\?k=/);
      await id('dialog-ok').click();
      await closeSheet();
      await page.getByText(/Live · Alice/).waitFor({ timeout: 10000 });
    });

    await check('a co-writer joins from the link and sees edits live', async () => {
      const u = new URL(link);
      const pb = await devB.newPage();
      pb.on('pageerror', (e) => errors.push('B: ' + e.message));
      await pb.goto(`${BASE}/join/${u.pathname.split('/').pop()}?k=${u.searchParams.get('k')}&s=${encodeURIComponent(SERVER)}`);
      await id('lyric-page', pb).waitFor({ timeout: 30000 });
      await pb.getByText(/Live · .*(Alice.*Bob|Bob.*Alice)/).waitFor({ timeout: 10000 });
      await page.getByText(/Live · .*(Alice.*Bob|Bob.*Alice)/).waitFor({ timeout: 10000 });
      // Alice adds a line; Bob sees it
      await id('line-1-0-text').click();
      await id('section-1-input').press('End');
      await page.keyboard.press('Enter');
      await id('section-1-input').pressSequentially('and the morning lets me go', { delay: 5 });
      await pb.getByText('and the morning lets me go').waitFor({ timeout: 10000 });
      // Bob edits Alice's verse; Alice sees it
      await id('line-0-1-text', pb).click();
      await id('section-0-input', pb).press('ControlOrMeta+End');
      await id('section-0-input', pb).pressSequentially(' tight', { delay: 5 });
      await settle(pb);
      await page.getByText('and every window on the street was closed tight').waitFor({ timeout: 10000 });
      if (shots) await pb.screenshot({ path: `${shots}/p5-cowrite-bob.png` });

      // comments on a line
      await id('line-1-1-text', pb).click();
      await settle(pb);
      await id('live-bar', pb).click();
      await id('comments-sheet', pb).waitFor();
      await pb.waitForTimeout(400);
      await id('comment-input', pb).fill('love this, maybe "lets me go" → "lets go of me"?');
      await id('comment-send', pb).click();
      await page.waitForFunction(() => document.querySelector('[data-testid="comment-count"]')?.textContent === '1', null, { timeout: 10000 });
      await id('live-bar').click();
      await id('comments-sheet').waitFor();
      assert.match(await id('comments-sheet').innerText(), /Bob: love this/);
      if (shots) await page.screenshot({ path: `${shots}/p5-comments.png` });
      await closeSheet();
      // both devices have saved the shared song locally
      await pb.reload();
      await id('lyric-page', pb).waitFor();
      await pb.getByText('and the morning lets me go').waitFor();
      await pb.close();
    });

    if (errors.length) console.log('\nBrowser errors:\n' + errors.join('\n'));
    console.log('\nPhase 5 e2e: all checks passed');
  } catch (e) {
    console.log('FAILED');
    if (shots) await page.screenshot({ path: `${shots}/p5-failure.png` });
    console.error(e);
    console.log(errors.slice(0, 10).join('\n'));
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.kill();
  }
})();
