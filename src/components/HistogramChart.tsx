import { useEffect, useMemo, useRef } from 'react';
import * as echarts from 'echarts';
import { useChartSize } from './useChartSize';
import { SimulationResult } from '../sim/types';
import { formatCurrency } from '../utils/format';

interface HistogramChartProps {
  result: SimulationResult | null;
}

function buildHistogram(values: number[], bins = 30) {
  if (values.length === 0) {
    return { centers: [], counts: [], binWidth: 1 };
  }

  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }

  const binWidth = (max - min) / bins;
  const counts = new Array(bins).fill(0);

  values.forEach((value) => {
    const index = Math.min(bins - 1, Math.floor((value - min) / binWidth));
    counts[index] += 1;
  });

  const centers = counts.map((_, idx) => min + (idx + 0.5) * binWidth);
  return { centers, counts, binWidth };
}

export default function HistogramChart({ result }: HistogramChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.EChartsType | null>(null);
  const narrow = useChartSize(containerRef, chartRef);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }
    chartRef.current = echarts.init(containerRef.current);

    const handleResize = () => {
      chartRef.current?.resize();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, []);

  const histogram = useMemo(() => {
    if (!result) {
      return { centers: [], counts: [], binWidth: 1 };
    }
    const values = result.runs.map((run) => run.final_net);
    return buildHistogram(values, 32);
  }, [result]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }

    if (!result) {
      chart.clear();
      chart.setOption({
        title: {
          text: 'Final net distribution will appear here',
          left: 'center',
          top: 'middle',
          textStyle: { color: '#536b7e', fontSize: narrow ? 11 : 13 },
        },
        xAxis: { show: false },
        yAxis: { show: false },
        series: [],
      });
      return;
    }

    chart.clear();

    const mean = result.aggregate.final_net.mean;
    const median = result.aggregate.final_net.median;
    const data = histogram.centers.map((center, idx) => [center, histogram.counts[idx]]);
    const xMin = Math.min(result.aggregate.final_net.p01, histogram.centers[0] ?? 0);
    const xMax = Math.max(result.aggregate.final_net.p99, histogram.centers[histogram.centers.length - 1] ?? 0);

    chart.setOption({
      animation: false,
      title: undefined,
      tooltip: {
        trigger: 'axis',
        confine: true,
        axisPointer: { type: 'shadow' },
        formatter: (params: any) => {
          const bin = params[0]?.data;
          if (!bin) {
            return '';
          }
          return `Final net: ${formatCurrency(bin[0])}<br/>Runs: ${bin[1]}`;
        },
      },
      grid: { left: narrow ? 8 : 40, right: narrow ? 18 : 40, top: 35, bottom: 50, containLabel: true },
      xAxis: {
        type: 'value',
        name: 'Final net ($)',
        nameLocation: 'middle',
        nameGap: 32,
        splitNumber: narrow ? 3 : 5,
        min: xMin,
        max: xMax,
        axisLabel: {
          formatter: (value: number) => formatCurrency(value),
        },
      },
      yAxis: {
        type: 'value',
        name: 'Runs',
      },
      series: [
        {
          type: 'bar',
          data,
          itemStyle: { color: '#138b80', borderRadius: [3, 3, 0, 0] },
          barWidth: 12,
          markLine: {
            symbol: ['none', 'none'],
            label: { show: false },
            data: [
              { name: 'Mean', xAxis: mean, lineStyle: { color: '#0f766e' } },
              { name: 'Median', xAxis: median, lineStyle: { color: '#2563eb' } },
              { name: 'Break-even', xAxis: 0, lineStyle: { color: '#94a3b8', type: 'dashed' } },
            ],
          },
        },
      ],
    });
  }, [result, histogram, narrow]);

  return (
    <div className="histogram-view">
      <div ref={containerRef} className="chart histogram-chart" />
      {result && <div className="histogram-key" aria-label="Distribution markers">
        <span className="mean">Mean</span><span className="median">Median</span><span className="break-even">Break-even</span>
      </div>}
    </div>
  );
}
