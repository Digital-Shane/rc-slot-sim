import type { EChartsOption } from 'echarts';
import { formatCurrency, formatPercent } from '../utils/format';

// Probability calculations retained verbatim from the original chart.
export function buildLossProfitCurves(values: number[], steps = 40) {
  if (values.length === 0) {
    return { lossPoints: [], profitPoints: [], maxLoss: 1, maxProfit: 1 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const minValue = sorted[0];
  const maxValue = sorted[sorted.length - 1];
  const maxLoss = Math.max(1, -minValue);
  const maxProfit = Math.max(1, maxValue);
  const lossStep = maxLoss / steps;
  const profitStep = maxProfit / steps;

  const lossPoints: Array<[number, number]> = [];
  const profitPoints: Array<[number, number]> = [];
  const total = sorted.length;

  const countBelow = (limit: number) => {
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (sorted[mid] < limit) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    return lo;
  };

  const countAtOrBelow = (limit: number) => {
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (sorted[mid] <= limit) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    return lo;
  };

  for (let i = 0; i <= steps; i += 1) {
    const lossThreshold = lossStep * i;
    const profitThreshold = profitStep * i;
    const lossCount = countBelow(-lossThreshold);
    const profitCount = total - countAtOrBelow(profitThreshold);
    lossPoints.push([lossThreshold, lossCount / total]);
    profitPoints.push([profitThreshold, profitCount / total]);
  }

  return { lossPoints, profitPoints, maxLoss, maxProfit };
}


export type ProbabilityCurve = ReturnType<typeof buildLossProfitCurves>;
export const LOSS_COLOR = '#bb4c49';
export const PROFIT_COLOR = '#36785b';

/**
 * A single grid and dollar axis remove the old seam altogether. Loss thresholds
 * are signed negative; raw loss/profit probabilities and strict comparisons stay
 * unchanged. The profit y-axis is reversed, exactly as in the original chart.
 */
export function buildProbabilityOption(curve: ProbabilityCurve, narrow: boolean): EChartsOption {
  const lossAtZero = curve.lossPoints[0]?.[1] ?? 0;
  const profitAtZero = curve.profitPoints[0]?.[1] ?? 0;
  const breakEvenProbability = curve.lossPoints.length ? Math.max(0, 1 - lossAtZero - profitAtZero) : 0;
  const compactDollars = (value: number) => Math.abs(value) >= 1000
    ? `${value < 0 ? '-' : ''}$${Number((Math.abs(value) / 1000).toFixed(1))}k`
    : formatCurrency(value);
  return {
    animation: false,
    // Both series MUST use this same grid. There is no inner margin at $0.
    grid: { left: narrow ? 35 : 46, right: narrow ? 35 : 46, top: 24, bottom: 54, containLabel: false },
    tooltip: {
      trigger: 'axis', confine: true, axisPointer: { type: 'line' },
      formatter: (params: any) => {
        const rows = (Array.isArray(params) ? params : [params]).filter((row: any) => row.data);
        const threshold = Number(rows[0]?.axisValue ?? 0);
        const candidates = rows.filter((row: any) => row.seriesName === (threshold < 0 ? 'P(loss)' : threshold > 0 ? 'P(profit)' : row.seriesName));
        return candidates.map((row: any) => {
          const [amount, probability] = row.data as [number, number];
          if (row.seriesName === 'Break-even outcomes') return `Exactly $0: ${formatPercent(breakEvenProbability)}`;
          const action = row.seriesName === 'P(loss)' ? 'Losing more than' : 'Finishing above';
          return `${row.marker}${action} ${formatCurrency(Math.abs(amount))}: ${formatPercent(probability)}`;
        }).join('<br/>');
      },
    },
    xAxis: {
      type: 'value', gridIndex: 0, min: -curve.maxLoss, max: curve.maxProfit,
      name: 'Final net threshold ($)', nameLocation: 'middle', nameGap: 34,
      splitNumber: narrow ? 3 : 6,
      axisLabel: { formatter: narrow ? compactDollars : formatCurrency, hideOverlap: true, fontSize: narrow ? 10 : 12 },
      axisLine: { onZero: false, lineStyle: { color: '#a6b6c7' } },
      splitLine: { lineStyle: { color: '#e1e8f0' } },
    },
    yAxis: [
      { type: 'value', gridIndex: 0, min: 0, max: 1, inverse: false, position: 'left', interval: 0.25,
        axisLabel: { formatter: (value: number) => formatPercent(value, 0), color: LOSS_COLOR, fontSize: narrow ? 10 : 11 },
        splitLine: { lineStyle: { color: '#e1e8f0' } } },
      { type: 'value', gridIndex: 0, min: 0, max: 1, inverse: true, position: 'right', interval: 0.25,
        axisLabel: { formatter: (value: number) => formatPercent(value, 0), color: PROFIT_COLOR, fontSize: narrow ? 10 : 11 },
        splitLine: { show: false } },
    ],
    series: [
      { name: 'P(loss)', type: 'line', xAxisIndex: 0, yAxisIndex: 0,
        data: curve.lossPoints.map(([threshold, probability]) => [-threshold, probability]),
        smooth: true, showSymbol: false, lineStyle: { color: LOSS_COLOR, width: 2.5 },
        itemStyle: { color: LOSS_COLOR }, areaStyle: { color: 'rgba(187, 76, 73, 0.11)', origin: 0 },
        markLine: { silent: true, symbol: 'none', label: { formatter: '$0', position: 'end', color: '#586b80', fontSize: 11 },
          lineStyle: { color: '#8297ae', type: 'dashed', width: 1 }, data: [{ xAxis: 0 }] } },
      { name: 'P(profit)', type: 'line', xAxisIndex: 0, yAxisIndex: 1,
        data: curve.profitPoints, smooth: true, showSymbol: false,
        lineStyle: { color: PROFIT_COLOR, width: 2.5 }, itemStyle: { color: PROFIT_COLOR },
        areaStyle: { color: 'rgba(54, 120, 91, 0.11)', origin: 0 } },
      // An exact-$0 atom is a real vertical probability step, not a layout gap.
      { name: 'Break-even outcomes', type: 'line', xAxisIndex: 0, yAxisIndex: 0,
        data: breakEvenProbability > 1e-12 ? [[0, lossAtZero], [0, 1 - profitAtZero]] : [],
        showSymbol: false, lineStyle: { color: '#8297ae', width: 2.5 }, itemStyle: { color: '#8297ae' } },
    ],
  };
}
