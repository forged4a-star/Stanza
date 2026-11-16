/** Custom strumming: build a pattern, hear it, save, select, edit, delete. */
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
  const label = (i) => id(`step-${i}`).getAttribute('aria-label');
  try {
    await page.goto(BASE);
    await id('lyric-page').waitFor({ timeout: 30000 });
    await id('song-title').fill('Strum Song');
    await id('open-chords').click();
    await id('chords-sheet').waitFor();
    await page.waitForTimeout(450);
    await page.getByRole('tab', { name: 'Ideas', exact: true }).click();
    await id('set-key-G').click();
    await id('add-G').first().click().catch(() => {});
    await page.getByRole('tab', { name: 'Play', exact: true }).click();

    await check('open the editor with an empty grid', async () => {
      await id('new-strum').scrollIntoViewIfNeeded();
      await id('new-strum').click();
      await id('strum-editor').waitFor();
      assert.match(await label(0), /rest/);
      assert.equal(await id('strum-preview').isDisabled(), true);
    });

    await check('tap cycles a step through the stroke types', async () => {
      const seen = [];
      for (let k = 0; k < 6; k++) {
        await id('step-0').click();
        seen.push(await label(0));
      }
      assert.match(seen[0], /down stroke/);
      assert.match(seen[5], /rest/);
      assert.equal(new Set(seen).size, 6);
    });

    await check('template fills the grid; sixteenths doubles it', async () => {
      await id('tpl-Folk').click().catch(() => {});
      const anyTpl = page.locator('[data-testid^="tpl-"]').first();
      await anyTpl.click();
      assert.equal(await id('step-7').count(), 1);
      await page.getByRole('tab', { name: /Sixteenths/ }).click();
      assert.equal(await id('step-15').count(), 1);
      await page.getByRole('tab', { name: /Eighths/ }).click();
      assert.equal(await id('step-8').count(), 0);
    });

    await check('name, save, and it becomes the selected pattern', async () => {
      await id('strum-name').fill('Campfire');
      await id('strum-save').click();
      await page.waitForTimeout(500);
      assert.equal(await id('strum-editor').count(), 0);
      const chip = id('custom-Campfire');
      await chip.waitFor();
      assert.equal(await id('edit-strum').count(), 1);
    });

    await check('plays with the custom pattern without errors', async () => {
      await id('player-play').click();
      await page.waitForTimeout(1500);
      await id('player-play').click();
    });

    await check('edit then delete', async () => {
      await id('edit-strum').click();
      await id('strum-editor').waitFor();
      assert.equal(await id('strum-name').inputValue(), 'Campfire');
      await id('strum-delete').click();
      await page.getByRole('button', { name: 'Delete', exact: true }).last().click();
      await page.waitForTimeout(500);
      assert.equal(await id('custom-Campfire').count(), 0);
    });

    assert.deepEqual(errors, []);
    console.log('strum e2e passed');
  } catch (e) {
    console.error('\nFAILED:', e.message);
    await page.screenshot({ path: '/tmp/strum-fail.png' }).catch(() => {});
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
