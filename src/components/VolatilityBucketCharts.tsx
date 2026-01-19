import { useEffect, useMemo, useRef } from 'react';
import * as echarts from 'echarts';
import { VOLATILITY_TEMPLATES } from '../sim/volatilityModel';

const TIERS = [
  { key: 'LOW', label: 'Low Volatility', color: '#16a34a' },
  { key: 'MEDIUM', label: 'Medium Volatility', color: '#f59e0b' },
  { key: 'HIGH', label: 'High Volatility', color: '#dc2626' },
] as const;

type TierKey = (typeof TIERS)[number]['key'];

type TierData = {
  key: TierKey;
  label: string;
  color: string;
  buckets: Array<[number, number]>;
  minProb: number;
  maxProb: number;
};

function buildSeriesData(outcomes: Array<{ m_base: number; p: number }>) {
  const buckets = outcomes
    .filter((outcome) => outcome.m_base > 0)
    .map((outcome) => [outcome.m_base, outcome.p] as [number, number]);
  const minProb = buckets.reduce((min, [, p]) => Math.min(min, p), Number.POSITIVE_INFINITY);
  const maxProb = buckets.reduce((max, [, p]) => Math.max(max, p), 0);
  return {
    buckets,
    minProb: Number.isFinite(minProb) ? minProb : 0,
    maxProb,
  };
}

function formatProbability(p: number) {
  if (!Number.isFinite(p) || p <= 0) {
    return '0%';
  }
  const percent = p * 100;
  let digits = 7;
  if (percent < 0.001) {
    digits = 11;
  } else if (percent < 0.01) {
    digits = 10;
  } else if (percent < 0.1) {
    digits = 9;
  } else if (percent < 1) {
    digits = 8;
  }
  return `${percent.toFixed(digits)}%`;
}

function formatProbabilityLabel(p: number) {
  if (!Number.isFinite(p) || p <= 0) {
    return '0%';
  }
  const percent = p * 100;
  if (percent < 0.001) {
    return `${percent.toExponential(1)}%`;
  }
  if (percent < 0.01) {
    return `${percent.toFixed(4)}%`;
  }
  if (percent < 0.1) {
    return `${percent.toFixed(3)}%`;
  }
  if (percent < 1) {
    return `${percent.toFixed(2)}%`;
  }
  return `${percent.toFixed(1)}%`;
}

function useEChart(options: echarts.EChartsOption) {
  const chartRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<echarts.EChartsType | null>(null);

  useEffect(() => {
    if (!chartRef.current) {
      return;
    }
    instanceRef.current = echarts.init(chartRef.current);

    const handleResize = () => {
      instanceRef.current?.resize();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      instanceRef.current?.dispose();
      instanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!instanceRef.current) {
      return;
    }
    instanceRef.current.setOption(options);
  }, [options]);

  return chartRef;
}

function buildTierData(): TierData[] {
  return TIERS.map((tier) => {
    const template = VOLATILITY_TEMPLATES[tier.key];
    const data = buildSeriesData(template.outcomes);
    return {
      key: tier.key,
      label: tier.label,
      color: tier.color,
      ...data,
    };
  });
}

function DensityOverlayChart({ tiers }: { tiers: TierData[] }) {
  const chartRef = useEChart(
    useMemo(() => {
      const minX = Math.min(...tiers.map((tier) => tier.buckets[0]?.[0] ?? 0.1));
      const maxX = 20000;
      const bucketCount = 120;
      const logMin = Math.log(minX);
      const logMax = Math.log(maxX);
      const sharedMultipliers = Array.from({ length: bucketCount }, (_, index) => {
        const ratio = bucketCount === 1 ? 0 : index / (bucketCount - 1);
        return Math.exp(logMin + (logMax - logMin) * ratio);
      });

      const interpolateProbability = (buckets: Array<[number, number]>, value: number) => {
        if (buckets.length === 0) {
          return 0;
        }
        const logValue = Math.log(value);
        const logBuckets = buckets.map(([multiplier]) => Math.log(multiplier));
        if (logValue <= logBuckets[0]) {
          return buckets[0][1];
        }
        const lastIndex = logBuckets.length - 1;
        if (logValue >= logBuckets[lastIndex]) {
          return buckets[lastIndex][1];
        }
        let lo = 0;
        let hi = lastIndex;
        while (lo <= hi) {
          const mid = Math.floor((lo + hi) / 2);
          if (logBuckets[mid] === logValue) {
            return buckets[mid][1];
          }
          if (logBuckets[mid] < logValue) {
            lo = mid + 1;
          } else {
            hi = mid - 1;
          }
        }
        const upperIndex = Math.max(1, lo);
        const lowerIndex = upperIndex - 1;
        const lowerLog = logBuckets[lowerIndex];
        const upperLog = logBuckets[upperIndex];
        const lowerP = buckets[lowerIndex][1];
        const upperP = buckets[upperIndex][1];
        const t = (logValue - lowerLog) / (upperLog - lowerLog);
        return lowerP + (upperP - lowerP) * t;
      };

      const alignedSeries = tiers.map((tier) => ({
        tier,
        data: sharedMultipliers.map((multiplier) => [
          multiplier,
          interpolateProbability(tier.buckets, multiplier),
        ]),
      }));

      const minProb = Math.min(...tiers.map((tier) => tier.minProb || 1e-12));
      const maxProb = Math.max(...tiers.map((tier) => tier.maxProb || 1e-6));
      return {
        animation: false,
        grid: { left: 72, right: 30, top: 30, bottom: 50, containLabel: true },
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'line', snap: true },
          formatter: (params: any) => {
            if (!params?.length) {
              return '';
            }
            const multiplier = params[0].axisValue?.toLocaleString?.() ?? '';
            const lines = params.map((entry: any) =>
              `${entry.marker} ${entry.seriesName}: ${formatProbability(entry.data[1])}`
            );
            return `${multiplier}x<br/>${lines.join('<br/>')}`;
          },
        },
        legend: { top: 0 },
        xAxis: {
          type: 'log',
          name: 'Multiplier (log scale)',
          nameLocation: 'middle',
          nameGap: 34,
          min: minX,
          max: maxX,
          axisLabel: {
            formatter: (value: number) => `${value.toLocaleString()}x`,
          },
        },
        yAxis: {
          type: 'log',
          min: minProb,
          max: maxProb,
          name: 'Bucket probability',
          nameLocation: 'middle',
          nameGap: 68,
          axisLabel: {
            formatter: (value: number) => formatProbabilityLabel(value),
          },
        },
        series: alignedSeries.map(({ tier, data }) => ({
          name: tier.label,
          type: 'line',
          smooth: true,
          showSymbol: false,
          showAllSymbol: 'auto',
          symbolSize: 4,
          data,
          lineStyle: { color: tier.color, width: 2 },
          itemStyle: { color: tier.color },
          areaStyle: { color: `${tier.color}22` },
        })),
      } as echarts.EChartsOption;
    }, [tiers])
  );

  return <div ref={chartRef} className="bucket-chart bucket-chart-wide" />;
}

type VolatilityBucketChartsProps = {
  variant?: 'inline';
};

export default function VolatilityBucketCharts({
  variant = 'inline',
}: VolatilityBucketChartsProps) {
  const tiers = useMemo(() => buildTierData(), []);

  return (
    <div className="bucket-inline">
      <div className="bucket-card bucket-card-wide">
        <div className="bucket-title">Reward Density</div>
        <div className="bucket-subtitle">
          All tiers on the same log scale so tails stay readable.
        </div>
        <DensityOverlayChart tiers={tiers} />
      </div>
    </div>
  );
}
