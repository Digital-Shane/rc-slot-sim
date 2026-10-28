import { useEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { useChartSize } from './useChartSize';
import { buildLossProfitCurves, buildProbabilityOption } from './probabilityChart';
import { SimulationResult } from '../sim/types';
import { formatCurrency, formatPercent } from '../utils/format';

interface LossProbabilityChartProps {
  result: SimulationResult | null;
}


export default function LossProbabilityChart({ result }: LossProbabilityChartProps) {
  const plotRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.EChartsType | null>(null);
  const narrow = useChartSize(plotRef, chartRef);
  const sliderWrapRef = useRef<HTMLDivElement>(null);
  const [rangeMin, setRangeMin] = useState('-500');
  const [rangeMax, setRangeMax] = useState('250');
  const [activeHandle, setActiveHandle] = useState<'min' | 'max' | null>(null);
  const activeHandleRef = useRef<'min' | 'max' | null>(null);
  const isDraggingRef = useRef(false);
  const lastResultIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!plotRef.current) return;
    chartRef.current = echarts.init(plotRef.current, undefined, { renderer: 'svg' });
    return () => { chartRef.current?.dispose(); chartRef.current = null; };
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
      return { status: 'idle', value: 'Run a simulation to calculate.', detail: '', label: 'Chance of finishing in a range' };
    }
    const total = result.runs.length;
    if (total === 0) {
      return { status: 'idle', value: 'No runs to analyze.', detail: '', label: 'Chance of finishing in a range' };
    }
    if (!rangeMin.trim() || !rangeMax.trim()) {
      return { status: 'invalid', value: 'Enter a valid min and max.', detail: '', label: 'Chance of finishing in a range' };
    }
    const minValue = Number(rangeMin);
    const maxValue = Number(rangeMax);
    if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
      return { status: 'invalid', value: 'Enter a valid min and max.', detail: '', label: 'Chance of finishing in a range' };
    }
    if (minValue > maxValue) {
      return { status: 'invalid', value: 'Min must be ≤ max.', detail: '', label: 'Chance of finishing in a range' };
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
    const chart = chartRef.current;
    if (!chart) return;
    chart.clear();
    chart.setOption(result ? buildProbabilityOption(curve, narrow) : {
      title: {
        text: 'Run a simulation to explore both sides of $0',
        left: 'center', top: 'middle',
        textStyle: { color: '#5b6b7b', fontSize: narrow ? 10 : 13, fontWeight: 400 },
      },
      xAxis: { show: false }, yAxis: { show: false }, series: [],
    });
  }, [result, curve, narrow]);

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
      <div className="probability-sides" aria-hidden="true"><span>P(loss) · read the left scale</span><span>P(profit) · read the right scale</span></div>
      <div ref={plotRef} className="chart probability-chart" role="img" aria-label="Connected P(loss) and P(profit) chart" />
      <div className="loss-profit-range">
        <div className="loss-profit-range-header">
          <div>
            <div className="loss-profit-range-title">Chance of finishing in a range</div>
            <div className="loss-profit-range-subtitle">
              Pick two amounts below, or drag the handles to explore.
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
