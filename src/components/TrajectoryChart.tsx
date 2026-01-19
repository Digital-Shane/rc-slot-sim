import { useEffect, useMemo, useRef } from 'react';
import * as echarts from 'echarts';
import { SimulationResult } from '../sim/types';
import { formatCurrency } from '../utils/format';

interface TrajectoryChartProps {
  result: SimulationResult | null;
  showSamples: boolean;
  showBestWorst: boolean;
  showTypical: boolean;
}

export default function TrajectoryChart({
  result,
  showSamples,
  showBestWorst,
  showTypical,
}: TrajectoryChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.EChartsType | null>(null);

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

  const seriesData = useMemo(() => {
    if (!result) {
      return [];
    }

    const runByIndex = new Map(result.runs.map((run) => [run.run_index, run]));
    const grid = result.trajectories.x_coin_in;
    const toPairs = (values: number[]) => grid.map((x, i) => [x, values[i]]);
    const series: echarts.SeriesOption[] = [];

    if (showSamples) {
      const palette = ['#2563eb', '#9333ea', '#f97316', '#0ea5e9', '#22c55e', '#eab308'];
      result.trajectories.samples.forEach((trajectory, idx) => {
        const runIndex = result.trajectories.sample_run_indices[idx];
        const run = runByIndex.get(runIndex);
        const label = `Run ${runIndex} (${formatCurrency(run?.final_net ?? 0)})`;
        const color = palette[idx % palette.length];
        series.push({
          name: label,
          type: 'line',
          showSymbol: false,
          color,
          lineStyle: { width: 1.5, opacity: 0.7, color },
          sampling: 'lttb',
          data: toPairs(trajectory),
        });
      });
    }

    if (showBestWorst) {
      const bestIndex = result.aggregate.selected_runs.best_run_index;
      const worstIndex = result.aggregate.selected_runs.worst_run_index;
      const bestRun = runByIndex.get(bestIndex);
      const worstRun = runByIndex.get(worstIndex);

      series.push({
        name: `Best (${formatCurrency(bestRun?.final_net ?? 0)})`,
        type: 'line',
        showSymbol: false,
        color: '#16a34a',
        lineStyle: { width: 3, color: '#16a34a' },
        emphasis: { focus: 'series' },
        sampling: 'lttb',
        data: toPairs(result.trajectories.best),
      });

      series.push({
        name: `Worst (${formatCurrency(worstRun?.final_net ?? 0)})`,
        type: 'line',
        showSymbol: false,
        color: '#dc2626',
        lineStyle: { width: 3, color: '#dc2626' },
        emphasis: { focus: 'series' },
        sampling: 'lttb',
        data: toPairs(result.trajectories.worst),
      });
    }

    if (showTypical) {
      series.push({
        name: 'Typical (median)',
        type: 'line',
        showSymbol: false,
        color: '#0f766e',
        lineStyle: { width: 3, color: '#0f766e' },
        emphasis: { focus: 'series' },
        sampling: 'lttb',
        data: toPairs(result.trajectories.typical_median),
      });
    }

    const xMax = grid[grid.length - 1];
    series.unshift({
      name: 'Break-even',
      type: 'line',
      showSymbol: false,
      data: [
        [0, 0],
        [xMax, 0],
      ],
      lineStyle: { type: 'dashed', color: '#94a3b8', width: 1.5 },
      tooltip: { show: false },
      silent: true,
      selected: { 'Break-even': false },
    });

    return series;
  }, [result, showSamples, showBestWorst, showTypical]);

  const legendData = useMemo(() => {
    return seriesData
      .map((s) => (typeof s.name === 'string' ? s.name : undefined))
      .filter((name) => name && name !== 'Break-even') as string[];
  }, [seriesData]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }

    if (!result) {
      chart.clear();
      chart.setOption({
        title: {
          text: 'Run a simulation to see trajectories',
          left: 'center',
          top: 'middle',
          textStyle: { color: '#7a7065', fontSize: 14 },
        },
        xAxis: { show: false },
        yAxis: { show: false },
        series: [],
      });
      return;
    }

    chart.clear();

    const chartHeight = chart.getHeight ? chart.getHeight() : 0;
    const resolvedChartHeight = chartHeight > 0 ? chartHeight : 480;
    const legendMaxHeight = Math.max(240, resolvedChartHeight - 20);
    const legendRowHeight = 30;
    const legendPadding = 24;
    const maxLegendItems = Math.max(
      6,
      Math.floor((legendMaxHeight - legendPadding) / legendRowHeight)
    );
    const usePagedLegend = legendData.length > maxLegendItems;

    chart.setOption({
      animation: false,
      title: undefined,
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        formatter: (params: any) => {
          const rows = params
            .map((item: any) => `${item.marker}${item.seriesName}: ${formatCurrency(item.data[1])}`)
            .join('<br/>');
          const coinIn = params[0]?.data[0] ?? 0;
          return `Coin-in: ${formatCurrency(coinIn)}<br/>${rows}`;
        },
      },
      legend: {
        type: usePagedLegend ? 'scroll' : 'plain',
        orient: 'vertical',
        right: 10,
        top: 10,
        padding: [12, 12],
        width: 180,
        itemGap: 12,
        itemWidth: 12,
        itemHeight: 10,
        textStyle: { fontSize: 12, lineHeight: 18 },
        ...(usePagedLegend
          ? {
              height: legendMaxHeight,
              pageFormatter: '{current}/{total}',
            }
          : {}),
        data: legendData,
      },
      grid: { left: 60, right: 260, top: 40, bottom: 60, containLabel: true },
      xAxis: {
        type: 'value',
        name: 'Coin-in ($)',
        min: 0,
        max: result?.inputs.coin_in_target ?? undefined,
        nameGap: 30,
        axisLabel: {
          formatter: (value: number) => `$${value.toLocaleString()}`,
        },
      },
      yAxis: {
        type: 'value',
        name: 'Net ($)',
        nameGap: 30,
        axisLabel: {
          formatter: (value: number) => `$${value.toLocaleString()}`,
        },
        splitLine: { lineStyle: { color: '#e2e8f0' } },
      },
      series: seriesData,
    });
  }, [result, seriesData, legendData]);

  return <div ref={containerRef} className="chart" />;
}
