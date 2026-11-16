/** Standard shapes and least-movement fingering in the Shapes tab. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE = process.env.BASE_URL || 'http://localhost:8081';

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 400, height: 860 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const id = (x) => page.getByTestId(x);
  const check = async (name, fn) => {
    process.stdout.write(`• ${name} … `);
    await fn();
    console.log('ok');
  };
  try {
    await page.goto(BASE);
    await id('lyric-page').waitFor({ timeout: 30000 });
    await id('song-title').fill('Shapes Song');
    await id('open-chords').click();
    await id('chords-sheet').waitFor();
    await page.waitForTimeout(450);
    await page.getByRole('tab', { name: 'Ideas', exact: true }).click();
    await id('set-key-C').click();
    for (const c of ['C', 'F', 'G', 'Am']) {
      await id(`add-${c}`).first().click();
      await page.waitForTimeout(150);
    }
    await page.getByRole('tab', { name: 'Shapes', exact: true }).click();

    await check('lists every change with how much moves', async () => {
      await id('easy-fingering').waitFor();
      const t = await id('easy-fingering').innerText();
      assert.match(t, /C → F/);
      assert.match(t, /F → G/);
      assert.match(t, /G → Am/);
      assert.match(t, /stay|move/);
    });

    await check('shows textbook shapes: C is x32010', async () => {
      const label = await page.getByLabel(/^C guitar shape/).first().getAttribute('aria-label');
      assert.match(label, /x 3 2 0 1 0/);
    });

    await check('avoid barres keeps F off the full barre', async () => {
      await id('toggle-avoid-barres').click();
      await page.waitForTimeout(300);
      const label = await page.getByLabel(/^F guitar shape/).first().getAttribute('aria-label');
      assert.doesNotMatch(label, /1 3 3 2 1 1/);
    });

    assert.deepEqual(errors, []);
    console.log('shapes e2e passed');
  } catch (e) {
    console.error('\nFAILED:', e.message);
    await page.screenshot({ path: '/tmp/shapes-fail.png' }).catch(() => {});
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
