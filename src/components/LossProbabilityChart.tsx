import { useEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { SimulationResult } from '../sim/types';
import { formatCurrency, formatPercent } from '../utils/format';

interface LossProbabilityChartProps {
  result: SimulationResult | null;
}

function buildLossProfitCurves(values: number[], steps = 40) {
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

export default function LossProbabilityChart({ result }: LossProbabilityChartProps) {
  const lossRef = useRef<HTMLDivElement>(null);
  const profitRef = useRef<HTMLDivElement>(null);
  const lossChartRef = useRef<echarts.EChartsType | null>(null);
  const profitChartRef = useRef<echarts.EChartsType | null>(null);
  const sliderWrapRef = useRef<HTMLDivElement>(null);
  const [rangeMin, setRangeMin] = useState('-500');
  const [rangeMax, setRangeMax] = useState('250');
  const [activeHandle, setActiveHandle] = useState<'min' | 'max' | null>(null);
  const activeHandleRef = useRef<'min' | 'max' | null>(null);
  const isDraggingRef = useRef(false);
  const lastResultIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!lossRef.current || !profitRef.current) {
      return;
    }
    lossChartRef.current = echarts.init(lossRef.current);
    profitChartRef.current = echarts.init(profitRef.current);

    const handleResize = () => {
      lossChartRef.current?.resize();
      profitChartRef.current?.resize();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      lossChartRef.current?.dispose();
      profitChartRef.current?.dispose();
      lossChartRef.current = null;
      profitChartRef.current = null;
    };
  }, []);

  const curve = useMemo(() => {
    if (!result) {
      return { lossPoints: [], profitPoints: [], maxLoss: 1, maxProfit: 1 };
    }
    const values = result.runs.map((run) => run.final_net);
    return buildLossProfitCurves(values, 48);
  }, [result]);

  const rangeLimits = useMemo(() => {
    if (!result) {
      return { min: -1, max: 1 };
    }
    return {
      min: -Math.ceil(curve.maxLoss),
      max: Math.ceil(curve.maxProfit),
    };
  }, [result, curve.maxLoss, curve.maxProfit]);

  const clampValue = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));

  useEffect(() => {
    if (!result) {
      lastResultIdRef.current = null;
      setRangeMin(String(rangeLimits.min));
      setRangeMax(String(rangeLimits.max));
      return;
    }
    const resultId = result.meta.id;
    if (lastResultIdRef.current === resultId) {
      return;
    }
    lastResultIdRef.current = resultId;
    const runs = result.runs;
    if (!runs.length) {
      setRangeMin(String(rangeLimits.min));
      setRangeMax(String(rangeLimits.max));
      return;
    }
    const pickValue = () =>
      runs[Math.floor(Math.random() * runs.length)]?.final_net ?? 0;
    let valueA = pickValue();
    let valueB = pickValue();
    if (!Number.isFinite(valueA) || !Number.isFinite(valueB)) {
      valueA = rangeLimits.min;
      valueB = rangeLimits.max;
    }
    const nextMin = Math.min(valueA, valueB);
    const nextMax = Math.max(valueA, valueB);
    setRangeMin(String(clampValue(Math.round(nextMin), rangeLimits.min, rangeLimits.max)));
    setRangeMax(String(clampValue(Math.round(nextMax), rangeLimits.min, rangeLimits.max)));
  }, [result, rangeLimits.min, rangeLimits.max]);

  useEffect(() => {
    if (!result) {
      return;
    }
    setRangeMin((prev) => {
      const parsed = Number(prev);
      if (!Number.isFinite(parsed)) {
        return prev;
      }
      return String(clampValue(parsed, rangeLimits.min, rangeLimits.max));
    });
    setRangeMax((prev) => {
      const parsed = Number(prev);
      if (!Number.isFinite(parsed)) {
        return prev;
      }
      return String(clampValue(parsed, rangeLimits.min, rangeLimits.max));
    });
  }, [result, rangeLimits.min, rangeLimits.max]);

  const rangeSummary = useMemo(() => {
    if (!result) {
      return { status: 'idle', value: 'Run a simulation to calculate.', detail: '', label: 'Calculate Range chance' };
    }
    const total = result.runs.length;
    if (total === 0) {
      return { status: 'idle', value: 'No runs to analyze.', detail: '', label: 'Calculate Range chance' };
    }
    if (!rangeMin.trim() || !rangeMax.trim()) {
      return { status: 'invalid', value: 'Enter a valid min and max.', detail: '', label: 'Calculate Range chance' };
    }
    const minValue = Number(rangeMin);
    const maxValue = Number(rangeMax);
    if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
      return { status: 'invalid', value: 'Enter a valid min and max.', detail: '', label: 'Calculate Range chance' };
    }
    if (minValue > maxValue) {
      return { status: 'invalid', value: 'Min must be ≤ max.', detail: '', label: 'Calculate Range chance' };
    }
    let count = 0;
    for (const run of result.runs) {
      if (run.final_net >= minValue && run.final_net <= maxValue) {
        count += 1;
      }
    }
    return {
      status: 'ok',
      value: formatPercent(count / total),
      label: 'Chance in range',
      detail: '',
    };
  }, [result, rangeMin, rangeMax]);

  useEffect(() => {
    const lossChart = lossChartRef.current;
    const profitChart = profitChartRef.current;
    if (!lossChart || !profitChart) {
      return;
    }

    if (!result) {
      lossChart.clear();
      profitChart.clear();
      lossChart.setOption({
        title: {
          text: 'P(loss) curve will appear here',
          left: 'center',
          top: 'middle',
          textStyle: { color: '#7a7065', fontSize: 14 },
        },
        xAxis: { show: false },
        yAxis: { show: false },
        series: [],
      });
      profitChart.setOption({
        title: {
          text: 'P(profit) curve will appear here',
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

    lossChart.clear();
    profitChart.clear();

    lossChart.setOption({
      animation: false,
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const point = params[0]?.data as [number, number] | undefined;
          if (!point) {
            return '';
          }
          const threshold = formatCurrency(point[0]);
          const probability = formatPercent(point[1]);
          return `Loss threshold: ${threshold}<br/>Chance of losing more than that: ${probability}`;
        },
      },
      title: {
        text: 'P(loss)',
        left: '56%',
        top: 8,
        textStyle: { color: '#6b7280', fontSize: 12, fontWeight: 600 },
      },
      grid: { left: 60, right: 0, top: 40, bottom: 50, containLabel: true },
      xAxis: {
        type: 'value',
        name: 'Loss threshold ($)',
        min: 0,
        max: curve.maxLoss,
        inverse: true,
        nameLocation: 'middle',
        nameGap: 32,
        axisLabel: {
          formatter: (value: number) => formatCurrency(value),
        },
      },
      yAxis: {
        type: 'value',
        name: '',
        min: 0,
        max: 1,
        position: 'left',
        axisLabel: {
          formatter: (value: number) => formatPercent(value, 0),
        },
      },
      series: [
        {
          type: 'line',
          data: curve.lossPoints,
          smooth: true,
          showSymbol: false,
          lineStyle: { color: '#dc2626', width: 2 },
          areaStyle: { color: 'rgba(220, 38, 38, 0.12)' },
        },
      ],
    });

    profitChart.setOption({
      animation: false,
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const point = params[0]?.data as [number, number] | undefined;
          if (!point) {
            return '';
          }
          const threshold = formatCurrency(point[0]);
          const probability = formatPercent(point[1]);
          return `Profit threshold: ${threshold}<br/>Chance of earning more than that: ${probability}`;
        },
      },
      title: {
        text: 'P(profit)',
        left: '44%',
        top: 8,
        textStyle: { color: '#6b7280', fontSize: 12, fontWeight: 600 },
      },
      grid: { left: 0, right: 60, top: 40, bottom: 50, containLabel: true },
      xAxis: {
        type: 'value',
        name: 'Profit threshold ($)',
        min: 0,
        max: curve.maxProfit,
        nameLocation: 'middle',
        nameGap: 32,
        axisLabel: {
          formatter: (value: number) => formatCurrency(value),
        },
      },
      yAxis: {
        type: 'value',
        name: '',
        min: 0,
        max: 1,
        inverse: true,
        position: 'right',
        axisLabel: {
          formatter: (value: number) => formatPercent(value, 0),
        },
      },
      series: [
        {
          type: 'line',
          data: curve.profitPoints,
          smooth: true,
          showSymbol: false,
          lineStyle: { color: '#16a34a', width: 2 },
          areaStyle: { color: 'rgba(22, 163, 74, 0.12)' },
        },
      ],
    });
  }, [result, curve]);

  const parsedRangeMin = Number(rangeMin);
  const parsedRangeMax = Number(rangeMax);
  const sliderMinValue = Number.isFinite(parsedRangeMin)
    ? clampValue(parsedRangeMin, rangeLimits.min, rangeLimits.max)
    : rangeLimits.min;
  const sliderMaxValue = Number.isFinite(parsedRangeMax)
    ? clampValue(parsedRangeMax, rangeLimits.min, rangeLimits.max)
    : rangeLimits.max;
  const rangeSpan = rangeLimits.max - rangeLimits.min || 1;
  const rangeStart = ((sliderMinValue - rangeLimits.min) / rangeSpan) * 100;
  const rangeEnd = ((sliderMaxValue - rangeLimits.min) / rangeSpan) * 100;
  const minSliderZIndex = activeHandle === 'min'
    ? 6
    : activeHandle === 'max'
      ? 4
      : sliderMinValue >= sliderMaxValue - 1
        ? 5
        : 4;
  const maxSliderZIndex = activeHandle === 'max' ? 6 : 5;

  const updateActiveHandle = (handle: 'min' | 'max' | null) => {
    activeHandleRef.current = handle;
    setActiveHandle(handle);
  };

  const setHandleValue = (handle: 'min' | 'max', nextValue: number) => {
    const clamped = clampValue(nextValue, rangeLimits.min, rangeLimits.max);
    if (handle === 'min') {
      setRangeMin(String(clamped));
      if (clamped > sliderMaxValue) {
        setRangeMax(String(clamped));
      }
    } else {
      setRangeMax(String(clamped));
      if (clamped < sliderMinValue) {
        setRangeMin(String(clamped));
      }
    }
  };

  const handleTrackPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!result || !sliderWrapRef.current) {
      return;
    }
    const rect = sliderWrapRef.current.getBoundingClientRect();
    const ratio = clampValue((event.clientX - rect.left) / rect.width, 0, 1);
    const nextValue = Math.round(rangeLimits.min + ratio * rangeSpan);
    const distToMin = Math.abs(nextValue - sliderMinValue);
    const distToMax = Math.abs(nextValue - sliderMaxValue);
    const handle = distToMin <= distToMax ? 'min' : 'max';
    updateActiveHandle(handle);
    setHandleValue(handle, nextValue);
    isDraggingRef.current = true;
    sliderWrapRef.current.setPointerCapture(event.pointerId);
  };

  const handleTrackPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || !sliderWrapRef.current) {
      return;
    }
    const handle = activeHandleRef.current;
    if (!handle) {
      return;
    }
    const rect = sliderWrapRef.current.getBoundingClientRect();
    const ratio = clampValue((event.clientX - rect.left) / rect.width, 0, 1);
    const nextValue = Math.round(rangeLimits.min + ratio * rangeSpan);
    setHandleValue(handle, nextValue);
  };

  const handleTrackPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (sliderWrapRef.current?.hasPointerCapture(event.pointerId)) {
      sliderWrapRef.current.releasePointerCapture(event.pointerId);
    }
    isDraggingRef.current = false;
    updateActiveHandle(null);
  };

  return (
    <div className="loss-profit-panel">
      <div className="loss-profit-grid">
        <div ref={lossRef} className="chart loss-probability-chart" />
        <div ref={profitRef} className="chart profit-probability-chart" />
      </div>
      <div className="loss-profit-range">
        <div className="loss-profit-range-header">
          <div>
            <div className="loss-profit-range-title">Calculate Range chance</div>
            <div className="loss-profit-range-subtitle">
              Drag the handles or type exact values.
            </div>
          </div>
        </div>
        <div className="loss-profit-range-layout">
          <div className="loss-profit-range-left">
            <div className="loss-profit-range-controls">
              <label className="loss-profit-range-field">
                <span className="loss-profit-range-label">From</span>
                <span className="loss-profit-range-amount">
                  <span className="loss-profit-range-currency">$</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={rangeMin}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setRangeMin(nextValue);
                      const parsed = Number(nextValue);
                      if (Number.isFinite(parsed)) {
                        setRangeMax((prev) => {
                          const prevParsed = Number(prev);
                          if (!Number.isFinite(prevParsed)) {
                            return prev;
                          }
                          return parsed > prevParsed ? String(parsed) : prev;
                        });
                      }
                    }}
                    aria-label="Range minimum dollars"
                    className="loss-profit-range-input"
                  />
                </span>
              </label>
              <label className="loss-profit-range-field">
                <span className="loss-profit-range-label">To</span>
                <span className="loss-profit-range-amount">
                  <span className="loss-profit-range-currency">$</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={rangeMax}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setRangeMax(nextValue);
                      const parsed = Number(nextValue);
                      if (Number.isFinite(parsed)) {
                        setRangeMin((prev) => {
                          const prevParsed = Number(prev);
                          if (!Number.isFinite(prevParsed)) {
                            return prev;
                          }
                          return parsed < prevParsed ? String(parsed) : prev;
                        });
                      }
                    }}
                    aria-label="Range maximum dollars"
                    className="loss-profit-range-input"
                  />
                </span>
              </label>
            </div>
            <div
              ref={sliderWrapRef}
              className="loss-profit-range-slider-wrap"
              onPointerDown={handleTrackPointerDown}
              onPointerMove={handleTrackPointerMove}
              onPointerUp={handleTrackPointerUp}
              onPointerCancel={handleTrackPointerUp}
              style={
                {
                  '--range-start': `${rangeStart}%`,
                  '--range-end': `${rangeEnd}%`,
                } as { [key: string]: string }
              }
            >
              <div className="loss-profit-range-slider-track" />
              <input
                type="range"
                min={rangeLimits.min}
                max={rangeLimits.max}
                step={1}
                value={sliderMinValue}
                onChange={(event) => {
                  const nextValue = Number(event.target.value);
                  if (!Number.isFinite(nextValue)) {
                    return;
                  }
                  setRangeMin(String(nextValue));
                  if (nextValue > sliderMaxValue) {
                    setRangeMax(String(nextValue));
                  }
                }}
                aria-label="Range minimum slider"
                disabled={!result}
                className="loss-profit-range-slider loss-profit-range-slider-min"
                style={{ zIndex: minSliderZIndex }}
              />
              <input
                type="range"
                min={rangeLimits.min}
                max={rangeLimits.max}
                step={1}
                value={sliderMaxValue}
                onChange={(event) => {
                  const nextValue = Number(event.target.value);
                  if (!Number.isFinite(nextValue)) {
                    return;
                  }
                  setRangeMax(String(nextValue));
                  if (nextValue < sliderMinValue) {
                    setRangeMin(String(nextValue));
                  }
                }}
                aria-label="Range maximum slider"
                disabled={!result}
                className="loss-profit-range-slider loss-profit-range-slider-max"
                style={{ zIndex: maxSliderZIndex }}
              />
              <div className="loss-profit-range-scale">
                <span>{formatCurrency(rangeLimits.min)}</span>
                <span>{formatCurrency(rangeLimits.max)}</span>
              </div>
            </div>
          </div>
          <div className={`loss-profit-range-result ${rangeSummary.status}`}>
            <div className="loss-profit-range-result-text">
              <span>{rangeSummary.label}</span>
              {rangeSummary.detail && (
                <span className="loss-profit-range-result-detail">{rangeSummary.detail}</span>
              )}
            </div>
            <div className="loss-profit-range-result-value">{rangeSummary.value}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
