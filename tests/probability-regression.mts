import assert from 'node:assert/strict';
import * as echarts from 'echarts';
import { buildLossProfitCurves, buildProbabilityOption } from '../src/components/probabilityChart';

// Strict threshold semantics, including exact break-even outcomes.
const tied = buildLossProfitCurves([-100, -50, 0, 25, 75], 4);
assert.deepEqual(tied.lossPoints, [[0, .4], [25, .4], [50, .2], [75, .2], [100, 0]]);
assert.deepEqual(tied.profitPoints, [[0, .4], [18.75, .4], [37.5, .2], [56.25, .2], [75, 0]]);
const tiedOption = buildProbabilityOption(tied, true) as any;
assert.deepEqual(tiedOption.series[2].data, [[0, .4], [0, .6]], 'Represent the mass at exactly $0 honestly');
assert.deepEqual(buildProbabilityOption(buildLossProfitCurves([]), true).series?.[2]?.data, []);

for (const values of [[-100, -50, 25, 75], [-100, -50], [10, 20], [0, 0]]) {
  for (const width of [248, 320, 650, 1000]) {
    const curve = buildLossProfitCurves(values, 48);
    const option = buildProbabilityOption(curve, width < 600) as any;
    assert.ok(!Array.isArray(option.grid), 'One coordinate grid, not two padded panels');
    assert.equal(option.xAxis.gridIndex, 0);
    assert.equal(option.yAxis[0].gridIndex, 0);
    assert.equal(option.yAxis[1].gridIndex, 0);
    assert.equal(option.yAxis[0].inverse, false);
    assert.equal(option.yAxis[1].inverse, true);
    const plot = echarts.init(null, undefined, { renderer: 'svg', ssr: true, width, height: 300 });
    plot.setOption(option);
    const lossAtZero = curve.lossPoints[0][1];
    const profitAtZero = curve.profitPoints[0][1];
    const left = plot.convertToPixel({ seriesIndex: 0 }, [0, lossAtZero]) as number[];
    const right = plot.convertToPixel({ seriesIndex: 1 }, [0, profitAtZero]) as number[];
    assert.ok(Math.abs(left[0] - right[0]) < 1e-9, 'No horizontal seam at $0 at any width');
    if (!values.includes(0)) assert.ok(Math.abs(left[1] - right[1]) < 1e-9, 'Complementary endpoints connect vertically');
    const bottomLoss = plot.convertToPixel({ seriesIndex: 0 }, [0, 0]) as number[];
    const bottomProfit = plot.convertToPixel({ seriesIndex: 1 }, [0, 1]) as number[];
    assert.ok(Math.abs(bottomLoss[1] - bottomProfit[1]) < 1e-9, 'Both y-axes share the same plot bounds');
    const negative25 = plot.convertToPixel({ seriesIndex: 0 }, [-25, 0]) as number[];
    const positive25 = plot.convertToPixel({ seriesIndex: 1 }, [25, 0]) as number[];
    assert.ok(Math.abs((left[0] - negative25[0]) - (positive25[0] - right[0])) < 1e-9, 'Same dollar scale on both sides');
    assert.ok(plot.renderToSVGString().includes('<svg'));
    plot.dispose();
  }
}
console.log('PASS connected probability chart: 16 rendered layouts; strict thresholds, reversed profit scale, shared $0, equal dollar scale, and break-even ties');
