/** Focused polish smoke test with completed, seeded results and no exact-$0 runs.
 * Fixture: HIGH, RTP 88%, bet 1.5, target 100 points, 100 runs, seed redesign-regression.
 * Accepts CUA tab.playwright or a standard Playwright Page; no new dependencies.
 */
export async function checkNotebookPolish(page, resize, observe = async () => {}) {
  const report = [];
  for (const [width, height] of [[1280, 800], [320, 740]]) {
    await resize({ width, height });
    const help = page.getByRole('button', { name: 'RTP range and meaning', exact: true });
    await help.click();
    await observe();
    const checkHelp = async (label) => {
      const state = await page.evaluate((label) => {
        const button = document.querySelector(`[aria-label="${label}"]`);
        const tip = document.querySelector('[role="tooltip"]');
        const box = tip?.getBoundingClientRect();
        return {
          expanded: button?.getAttribute('aria-expanded') === 'true',
          described: button?.getAttribute('aria-describedby') === tip?.id,
          visible: tip && getComputedStyle(tip).visibility === 'visible',
          fits: box && box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight,
          overflow: document.documentElement.scrollWidth > innerWidth + 1,
        };
      }, label);
      if (!state.expanded || !state.described || !state.visible || !state.fits || state.overflow) {
        throw Error(`${width}px help: ${JSON.stringify(state)}`);
      }
    };
    await checkHelp('RTP range and meaning');
    await help.press('Escape'); await observe();
    if (await page.getByRole('tooltip').count()) throw Error('Escape did not dismiss help');
    await help.press('Enter'); await observe(); await checkHelp('RTP range and meaning');
    await help.press('Tab'); await observe();
    if (await page.getByRole('tooltip').count()) throw Error('Tab did not dismiss help');
    const edgeHelp = page.getByRole('button', { name: 'P95 drawdown info', exact: true });
    await edgeHelp.click(); await observe(); await checkHelp('P95 drawdown info');
    await page.locator('#results-heading').click(); await observe();
    if (await page.getByRole('tooltip').count()) throw Error('Outside click did not dismiss help');

    await page.getByRole('button', { name: /^Volatility & payout logic/ }).click(); await observe();
    await page.getByRole('region', { name: 'Reference article content', exact: true }).press('End'); await observe();
    const sheet = await page.evaluate(() => {
      const dialog = document.querySelector('dialog[open]');
      const body = dialog?.querySelector('.reference-body');
      return { open: !!dialog, scrollable: body.scrollHeight > body.clientHeight, scrolled: body.scrollTop > 0,
        contained: body.scrollWidth <= body.clientWidth + 1, overflow: document.documentElement.scrollWidth > innerWidth + 1 };
    });
    if (!sheet.open || !sheet.scrollable || !sheet.scrolled || !sheet.contained || sheet.overflow) throw Error('Reading sheet fit failed');
    await page.getByRole('button', { name: 'Close reference' }).press('Shift+Tab'); await observe();
    if (!await page.evaluate(() => document.querySelector('dialog[open]')?.contains(document.activeElement))) throw Error('Sheet focus escaped');
    await page.getByRole('button', { name: 'Close reference' }).press('Escape'); await observe();
    if (!await page.evaluate(() => document.activeElement?.textContent?.includes('Volatility & payout logic'))) throw Error('Sheet focus was not restored');

    const geometry = await page.evaluate(() => {
      const plot = document.querySelector('.probability-chart');
      const point = (color) => plot?.querySelector(`path[stroke="${color}"]`)?.getAttribute('d')?.match(/^M(-?[\d.]+)[, ]+(-?[\d.]+)/)?.slice(1).map((n) => +n);
      return { count: document.querySelectorAll('.probability-chart svg').length, loss: point('#bb4c49'), profit: point('#36785b') };
    });
    if (geometry.count !== 1 || !geometry.loss || !geometry.profit ||
        Math.abs(geometry.loss[0] - geometry.profit[0]) > .01 || Math.abs(geometry.loss[1] - geometry.profit[1]) > .01) throw Error('Probability seam changed');
    report.push({ width, height, help: 'pass', readingSheet: 'pass', chartSeam: '0px' });
  }
  return report;
}
