/**
 * The song screen is split into tabs (Write, Music, Takes, Shape, Song).
 * These helpers let a test ask for a control by its test id and get there:
 * if the control lives on another tab, that tab is opened first.
 */

/** Controls that live on a tab page, and the tab button that shows them. */
const WHERE = {
  'open-web': 'open-shape',
  'open-arrange': 'open-shape',
  'open-compare': 'open-shape',
  progress: 'open-shape',
  'progress-title': 'open-shape',
  'progress-next': 'open-shape',
  'progress-items': 'open-shape',
  'open-full-take': 'open-takes',
  'open-inbox': 'open-takes',
  'open-versions': 'open-song-sheet',
  'open-replay': 'open-song-sheet',
  'open-stage': 'open-song-sheet',
  'edit-tags': 'open-song-sheet',
  'share-song': 'open-song-sheet',
  'song-sheet-tabs': 'open-song-sheet',
};

/** Song page controls that sit on its Details sub-tab. */
const DETAILS = new Set(['open-versions', 'open-replay', 'open-stage', 'edit-tags', 'share-song']);

const ACTIONS = new Set(['click', 'dblclick', 'tap', 'hover', 'focus', 'fill', 'press', 'pressSequentially', 'type', 'check', 'uncheck', 'waitFor', 'boundingBox', 'dispatchEvent', 'scrollIntoViewIfNeeded', 'selectText', 'setInputFiles']);

async function sheetOpen(page) {
  return (await page.getByRole('button', { name: 'Close sheet' }).filter({ visible: true }).count()) > 0;
}

/** Make the control with this test id reachable (switch tab if it is on another one). */
async function reach(page, testId) {
  const loc = page.getByTestId(testId).first();
  if (await loc.isVisible().catch(() => false)) return;
  let tab = WHERE[testId];
  // present in the page but hidden: it is on the Write tab, which stays mounted
  if (!tab && (await page.getByTestId(testId).count()) > 0) tab = 'tab-write';
  if (!tab || (await sheetOpen(page))) return;
  const btn = page.getByTestId(tab);
  const selected = (await btn.getAttribute('aria-selected').catch(() => null)) === 'true';
  if (!selected && (await btn.isVisible().catch(() => false))) {
    await btn.click();
    await page.waitForTimeout(250);
  }
  if (DETAILS.has(testId) && !(await loc.isVisible().catch(() => false))) {
    await page.getByTestId('song-sheet').getByRole('tab', { name: 'Details', exact: true }).click().catch(() => {});
    await page.waitForTimeout(200);
  }
}

/** A drop-in for `(x) => page.getByTestId(x)` that switches tabs as needed. */
function navId(page) {
  return (testId) => {
    const loc = page.getByTestId(testId);
    return new Proxy(loc, {
      get(target, prop) {
        const v = target[prop];
        if (typeof v !== 'function') return v;
        if (prop === 'click' && /^line-\d+-\d+-text$/.test(testId))
          return async (...args) => {
            await reach(page, testId);
            // a tap on a line just opens its editor; one that lands in the instant a page is still settling can be lost, so tap again
            const input = `section-${testId.split('-')[1]}-input`;
            for (let k = 0; k < 4; k++) {
              await v.apply(target, args);
              await page.waitForTimeout(350);
              if ((await page.getByTestId(input).count()) > 0) return;
            }
          };
        if (ACTIONS.has(prop))
          return async (...args) => {
            await reach(page, testId);
            return v.apply(target, args);
          };
        return v.bind(target);
      },
    });
  };
}

/** Close the sheet on top, or (with none open) go back to the Write tab. */
async function closeTop(page) {
  const c = page.getByRole('button', { name: 'Close sheet' }).filter({ visible: true });
  if (await c.count()) await c.last().click();
  else {
    const w = page.getByTestId('tab-write');
    const selected = (await w.getAttribute('aria-selected').catch(() => null)) === 'true';
    if (!selected && (await w.isVisible().catch(() => false))) await w.click();
  }
  await page.waitForTimeout(400);
}

/** Tap a line until its editor is open (a tap in the instant after the page loads can land before it settles). */
async function openEditor(page, line, input) {
  for (let k = 0; k < 6; k++) {
    await page.getByTestId(line).click();
    await page.waitForTimeout(400);
    if ((await page.getByTestId(input).count()) > 0) return;
  }
  throw new Error(`could not open the editor for ${line}`);
}

module.exports = { navId, closeTop, reach, openEditor, WHERE };
