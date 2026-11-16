/** Phase 2 in the browser: sound highlighting modes/settings, counts panel, word tools. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE = process.env.BASE_URL || 'http://localhost:8081';
const shots = process.argv[2] || null;

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 400, height: 860 } })).newPage();
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
    // the newest sheet is on top
    await page.getByRole('button', { name: 'Close sheet' }).last().click();
    await page.waitForTimeout(400);
  };
  const open = async (btn, sheet) => {
    await id(btn).click();
    await id(sheet).waitFor();
    await page.waitForTimeout(450);
  };
  const marked = (testId) => id(testId).evaluate((el) => [...el.querySelectorAll('div,span')].filter((n) => n.style.backgroundColor && n.children.length === 0).map((n) => n.textContent));
  const underlined = (testId) => id(testId).evaluate((el) => [...el.querySelectorAll('div,span')].filter((n) => (n.style.textDecorationLine || n.style.textDecoration || '').includes('underline')).map((n) => n.textContent));

  try {
    await page.goto(BASE);
    await id('lyric-page').waitFor({ timeout: 30000 });
    await id('line-0-0-text').click();
    for (const [i, text] of ['the night is bright and I feel alright', 'my rhymes are so fantastic', 'my style is like elastic', 'Peter picked a peck of pickled peppers'].entries()) {
      if (i) await page.keyboard.press('Enter');
      await id(`line-0-${i}-input`).pressSequentially(text, { delay: 3 });
    }
    await settle();

    await check('perfect rhymes are highlighted per syllable, internal rhymes included', async () => {
      const m = await marked('line-0-0-text');
      assert.deepEqual(m.map((x) => x.trim()), ['night', 'bright', 'right']);
    });

    await check('switching to line endings only drops internal rhymes', async () => {
      await open('open-sound', 'sound-sheet');
      await page.getByRole('tab', { name: 'Line endings only' }).click();
      await closeSheet();
      assert.deepEqual(await marked('line-0-0-text'), []);
      assert.ok((await marked('line-0-1-text')).join('').includes('tas'));
    });

    await check('multisyllabic, alliteration and assonance modes', async () => {
      await open('open-sound', 'sound-sheet');
      await page.getByRole('tab', { name: 'Internal too' }).click();
      await id('mode-multi').click();
      await id('mode-alliteration').click();
      await closeSheet();
      const multi = await marked('line-0-2-text');
      assert.ok(multi.join('').includes('las'), 'multisyllabic match highlighted: ' + multi);
      const allit = await underlined('line-0-3-text');
      assert.ok(allit.length >= 4, 'alliteration underlines: ' + allit);
    });

    await check('colour-blind palette changes the highlight colours', async () => {
      const before = await id('line-0-0-text').evaluate((el) => [...el.querySelectorAll('div,span')].find((n) => n.style.backgroundColor)?.style.backgroundColor);
      await open('open-sound', 'sound-sheet');
      await id('palette-colorblind').click();
      await closeSheet();
      const after = await id('line-0-0-text').evaluate((el) => [...el.querySelectorAll('div,span')].find((n) => n.style.backgroundColor)?.style.backgroundColor);
      assert.notEqual(before, after);
    });

    await check('counts: rhyme families, phonemes, vowel heatmap, repeated words', async () => {
      await open('open-sound', 'sound-sheet');
      await page.getByRole('tab', { name: 'Counts' }).click();
      const text = await id('sound-sheet').innerText();
      assert.match(text, /Rhyme families · \d+/i);
      assert.match(text, /night · bright · right/);
      assert.match(text, /\d+ syllables/);
      assert.match(text, /Most repeated words/i);
      assert.ok((await id('phoneme-counts').locator('> div').count()) > 10);
      await id('vowel-heatmap').waitFor();
      if (shots) await page.screenshot({ path: `${shots}/p2-counts.png` });
      await closeSheet();
    });

    await check('words: rhymes for the word at the cursor, filtered by syllables', async () => {
      await id('line-0-0-text').click();
      await id('line-0-0-input').press('End');
      await page.waitForTimeout(100);
      await open('open-words', 'word-sheet');
      assert.equal(await id('word-input').inputValue(), 'alright');
      assert.match(await id('word-pron').innerText(), /2 syllables/);
      const all = await id('word-results').innerText();
      assert.match(all, /\bdelight\b/);
      await id('syl-1').click();
      const one = await id('word-results').innerText();
      assert.match(one, /\bnight\b/);
      assert.doesNotMatch(one, /\bdelight\b/);
      if (shots) await page.screenshot({ path: `${shots}/p2-words.png` });
    });

    await check('near and multisyllabic rhymes', async () => {
      await id('word-input').fill('fantastic');
      await id('word-input').press('Enter');
      await id('rhyme-multi').click();
      assert.match(await id('word-results').innerText(), /elastic|plastic/);
      await id('word-input').fill('home');
      await id('word-input').press('Enter');
      await id('rhyme-near').click();
      assert.match(await id('word-results').innerText(), /\balone\b/);
    });

    await check('thesaurus, dictionary and related words (offline)', async () => {
      await id('word-input').fill('bright');
      await id('word-input').press('Enter');
      await page.getByRole('tab', { name: 'Similar' }).click();
      assert.match(await id('word-results').innerText(), /\bbrilliant\b|\bvivid\b|\bsmart\b/);
      await page.getByRole('tab', { name: 'Meaning' }).click();
      assert.match(await id('sense-0').innerText(), /light|emit|shining/i);
      await page.getByRole('tab', { name: 'Related' }).click();
      await id('word-results').waitFor();
    });

    await check('picking a word swaps it into the line you came from', async () => {
      await page.getByRole('tab', { name: 'Rhymes' }).click();
      await id('word-input').fill('alright');
      await id('word-input').press('Enter');
      await id('rhyme-perfect').click();
      await id('word-results').getByRole('button', { name: /^delight,/ }).click();
      await id('dialog').getByRole('button', { name: /Use instead/ }).click();
      await page.waitForTimeout(500);
      assert.equal(await id('line-0-0-text').innerText(), 'the night is bright and I feel delight');
    });

    const real = errors.filter((e) => !/favicon|DevTools/i.test(e));
    if (real.length) console.log('\nBrowser errors:\n' + real.join('\n'));
    console.log('\nPhase 2 e2e: all checks passed');
  } catch (e) {
    console.log('FAILED');
    if (shots) await page.screenshot({ path: `${shots}/p2-failure.png` });
    console.error(e);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
