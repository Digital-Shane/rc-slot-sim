/** Run on a completed seeded simulation with no exactly-zero outcomes.
 * Supports CUA tab.playwright or an existing standard Playwright Page.
 */
export async function checkConnectedProbability(page, resize, observe = async () => {}) {
  const report = [];
  for (const [width, height] of [[1440, 1000], [768, 1024], [390, 844], [320, 740]]) {
    await resize({ width, height });
    await observe();
    const state = await page.evaluate(() => {
      const plot = document.querySelector('.probability-chart');
      const start = (selector) => {
        const path = plot?.querySelector(selector);
        const match = path?.getAttribute('d')?.match(/^M(-?[\d.]+)[, ]+(-?[\d.]+)/);
        return match ? [+match[1], +match[2]] : null;
      };
      return {
        plots: document.querySelectorAll('.probability-chart').length,
        svg: plot?.querySelectorAll('svg').length,
        oldSeparatePlots: document.querySelectorAll('.loss-profit-grid,.loss-probability-chart,.profit-probability-chart').length,
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        plotWidth: plot?.clientWidth,
        lossStart: start('path[stroke="#bb4c49"]'),
        profitStart: start('path[stroke="#36785b"]'),
      };
    });
    if (state.plots !== 1 || state.svg !== 1 || state.oldSeparatePlots || state.overflow ||
        !state.lossStart || !state.profitStart ||
        Math.abs(state.lossStart[0] - state.profitStart[0]) > 0.01 ||
        Math.abs(state.lossStart[1] - state.profitStart[1]) > 0.01) {
      throw Error(`${width}px probability geometry: ${JSON.stringify(state)}`);
    }
    report.push({ width, height, plotWidth: state.plotWidth, lossStart: state.lossStart,
      profitStart: state.profitStart, horizontalGap: 0, verticalGap: 0 });
  }
  return report;
}
