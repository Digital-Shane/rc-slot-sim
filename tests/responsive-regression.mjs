/**
 * Browser regression shared by standard Playwright and the bundled CUA browser.
 * CUA: await checkResponsiveUI(tab.playwright, size => viewport.set(size),
 *   () => tab.getAXState({ emit: false }));
 * Standard Playwright: await checkResponsiveUI(page, size => page.setViewportSize(size));
 * Open the running local app first. No extra test framework or dependency is required.
 */
export async function checkResponsiveUI(page, resize, observe = async () => {}) {
  const titles = ['Volatility & payout logic', 'Determining machine volatility',
    'Video poker tradeoffs', 'Industry metrics', 'My point strategy'];
  const report = [];
  for (const [width, height] of [[1440, 1000], [1280, 800], [768, 1024], [390, 844], [320, 740]]) {
    await resize({ width, height });
    for (const title of titles) {
      await page.getByRole('button', { name: new RegExp(`^${title}`) }).click();
      await observe();
      const state = await page.evaluate(() => {
        const dialog = document.querySelector('dialog[open]');
        const body = dialog?.querySelector('.reference-body');
        const rect = dialog?.getBoundingClientRect();
        return {
          open: !!dialog,
          overflow: document.documentElement.scrollWidth > innerWidth + 1,
          bounds: rect ? { left: rect.left, right: rect.right, bottom: rect.bottom } : null,
          bodyOverflow: body ? body.scrollWidth > body.clientWidth + 1 : true,
          scrollTop: body?.scrollTop,
          focusInside: dialog?.contains(document.activeElement),
        };
      });
      if (!state.open || state.overflow || state.bodyOverflow || !state.focusInside ||
          state.bounds.left < -1 || state.bounds.right > width + 1 ||
          state.bounds.bottom > height + 1 || state.scrollTop !== 0) {
        throw Error(`${width}px / ${title}: ${JSON.stringify(state)}`);
      }
      await page.getByRole('button', { name: 'Close reference' }).press('Shift+Tab');
      await observe();
      const contained = await page.evaluate(() => document.querySelector('dialog[open]')?.contains(document.activeElement));
      if (!contained) throw Error(`${width}px / ${title}: keyboard focus left the article`);
      // End tests keyboard scrolling. The next opening also verifies reset to top.
      await page.getByRole('region', { name: 'Reference article content', exact: true }).press('End');
      await observe();
      await page.getByRole('button', { name: 'Close reference' }).press(width === 768 ? 'Enter' : 'Escape');
      await observe();
      const restored = await page.evaluate(() => ({
        closed: !document.querySelector('dialog')?.open,
        focusedText: document.activeElement?.textContent,
      }));
      if (!restored.closed || !restored.focusedText.includes(title)) {
        throw Error(`${width}px / ${title}: close did not restore focus`);
      }
    }
    const controls = await page.evaluate(() => {
      const inputs = [...document.querySelectorAll('.controls input[type="text"]')]
        .filter((input) => input.getBoundingClientRect().width > 0);
      return {
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        outside: inputs.some((input) => input.getBoundingClientRect().right > innerWidth + 1),
        smallPhoneInput: innerWidth <= 560 && inputs.some((input) => +getComputedStyle(input).fontSize.replace('px', '') < 16),
        emptyChart: [...document.querySelectorAll('.chart')].some((chart) => chart.clientWidth === 0 || chart.clientHeight === 0),
      };
    });
    if (Object.values(controls).some(Boolean)) throw Error(`${width}px / controls: ${JSON.stringify(controls)}`);
    report.push({ width, height, articles: 5, overflow: false, focus: 'pass', controls: 'pass' });
  }
  return report;
}
