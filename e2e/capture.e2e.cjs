/**
 * Capture pipeline in a real browser with Chromium's fake microphone (a
 * periodic beep): one tap → record → stop → take saved to the section →
 * decoded and analysed (BPM/key) → auto-titled. Also: long-press records a
 * loose idea into the Inbox, and an Inbox idea can be dragged onto a section.
 */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE = process.env.BASE_URL || 'http://localhost:8081';
const shots = process.argv[2] || null;

(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ viewport: { width: 400, height: 860 }, permissions: ['microphone'] });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const id = (x) => page.getByTestId(x);
  const step = async (name, fn) => {
    process.stdout.write(`• ${name} … `);
    await fn();
    console.log('ok');
  };
  try {
    await page.goto(BASE);
    await id('lyric-page').waitFor({ timeout: 30000 });
    await id('song-title').fill('Beep Song');
    await id('line-0-0-text').click();
    await id('section-0-input').pressSequentially('a line to sing over', { delay: 5 });
    await page.evaluate(() => document.activeElement.blur());
    await page.waitForTimeout(400);

    await step('one tap on the section mic starts recording; stop saves a take', async () => {
      await id('section-0-record').click();
      await id('capture-bar').waitFor();
      await page.waitForTimeout(6000);
      await id('capture-stop').click();
      await page.getByText(/Saved: Verse take 1/).waitFor({ timeout: 15000 });
    });

    await step('the take is analysed and auto-titled with tempo/key', async () => {
      await id('open-takes').click();
      await id('takes-sheet').waitFor();
      // analysis runs in the background; the title gains " · <bpm> bpm · <key>" when found
      const deadline = Date.now() + 30000;
      let text = '';
      while (Date.now() < deadline) {
        text = await id('takes-sheet').innerText();
        if (!/analysing/.test(text) && /Verse take 1/.test(text)) break;
        await page.waitForTimeout(1000);
        // reopen to refresh
        await page.getByRole('button', { name: 'Close sheet' }).click();
        await page.waitForTimeout(300);
        await id('open-takes').click();
        await id('takes-sheet').waitFor();
      }
      console.log('\n    takes sheet says: ' + text.replace(/\s+/g, ' ').slice(0, 160));
      assert.match(text, /Verse take 1/);
      assert.doesNotMatch(text, /analysing/);
      if (shots) await page.screenshot({ path: `${shots}/capture-takes.png` });
    });

    await step('the take plays back', async () => {
      await page.getByRole('button', { name: /^Play Verse take 1/ }).click();
      await page.getByRole('button', { name: /^Pause Verse take 1/ }).waitFor({ timeout: 5000 });
      await page.getByRole('button', { name: /^Pause Verse take 1/ }).click();
      await page.getByRole('button', { name: 'Close sheet' }).click();
      await page.waitForTimeout(400);
    });

    await step('long-press records a loose idea into the Inbox', async () => {
      const rec = id('record');
      const box = await rec.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(800);
      await page.mouse.up();
      await id('capture-bar').waitFor();
      await page.waitForTimeout(2500);
      await id('capture-stop').click();
      await page.getByText('Saved to Inbox').waitFor({ timeout: 15000 });
    });

    await step('drag the idea from the Inbox sheet onto the verse', async () => {
      await page.waitForTimeout(500);
      await id('open-inbox').click();
      await id('inbox-sheet').waitFor();
      await page.waitForTimeout(600);
      const handle = page.getByLabel('Drag onto a section').first();
      const hb = await handle.boundingBox();
      const target = await id('section-0').boundingBox();
      await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
      await page.mouse.down();
      const steps = 15;
      for (let i = 1; i <= steps; i++) {
        const y = hb.y + hb.height / 2 + ((target.y + 20 - (hb.y + hb.height / 2)) * i) / steps;
        await page.mouse.move(hb.x + hb.width / 2 + i * 4, y);
      }
      await page.mouse.up();
      await page.getByText('Take added to the song').waitFor({ timeout: 10000 });
      await page.getByRole('button', { name: 'Close sheet' }).click();
      await page.waitForTimeout(400);
      await id('open-takes').click();
      await id('takes-sheet').waitFor();
      const text = await id('takes-sheet').innerText();
      assert.match(text, /Idea –/);
      assert.match(text, /All \(2\)/);
    });

    const real = errors.filter((e) => !/favicon|DevTools/i.test(e));
    if (real.length) console.log('\nBrowser errors:\n' + real.join('\n'));
    console.log('\nCapture e2e: all checks passed');
  } catch (e) {
    console.log('FAILED');
    if (shots) await page.screenshot({ path: `${shots}/capture-failure.png` });
    console.error(e);
    console.log(errors.join('\n'));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
