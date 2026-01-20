import { useEffect, useMemo, useRef, useState } from 'react';
import TrajectoryChart from './components/TrajectoryChart';
import HistogramChart from './components/HistogramChart';
import { db, SavedSimulation } from './db';
import { SimulationInputs, SimulationResult, Volatility } from './sim/types';
import { formatCurrency, formatCurrencyWithCents, formatPercent } from './utils/format';

const TARGET_POINTS = 2500;
const POINTS_PER_DOLLAR = 1 / 5;
const COIN_IN_TARGET = TARGET_POINTS / POINTS_PER_DOLLAR;
const TRAJECTORY_SAMPLE_STEPS = [100, 50, 25, 10, 5] as const;

function estimateSampleCount(totalRuns: number, step: number) {
  if (totalRuns <= 1) {
    return totalRuns;
  }
  const base = Math.floor(totalRuns / step);
  const extra = totalRuns % step === 0 ? 0 : 1;
  return 1 + base + extra;
}

type NumericInputKey =
  | 'target_points'
  | 'bet_size'
  | 'deposit_amount'
  | 'runs'
  | 'spins_per_sec'
  | 'traj_points';
type NumericDrafts = Record<NumericInputKey, string>;

const DEFAULT_INPUTS: SimulationInputs = {
  rtp_percent: 88.0,
  volatility: 'HIGH',
  bet_size: 1.5,
  deposit_amount: 100,
  target_points: TARGET_POINTS,
  points_per_dollar: POINTS_PER_DOLLAR,
  coin_in_target: COIN_IN_TARGET,
  runs: 1000,
  seed: null,
  spins_per_sec: 0.1,
  traj_points: 300,
};

export default function App() {
  const [inputs, setInputs] = useState<SimulationInputs>(DEFAULT_INPUTS);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [saveName, setSaveName] = useState('');
  const [saved, setSaved] = useState<SavedSimulation[]>([]);
  const [rtpDraft, setRtpDraft] = useState(inputs.rtp_percent.toFixed(1));
  const [numericDrafts, setNumericDrafts] = useState<NumericDrafts>(() => ({
    target_points: String(inputs.target_points),
    bet_size: String(inputs.bet_size),
    deposit_amount: String(inputs.deposit_amount),
    runs: String(inputs.runs),
    spins_per_sec: String(inputs.spins_per_sec),
    traj_points: String(inputs.traj_points),
  }));
  const [activeDraft, setActiveDraft] = useState<NumericInputKey | null>(null);

  const [showSamples, setShowSamples] = useState(true);
  const [showBestWorst, setShowBestWorst] = useState(true);
  const [showTypical, setShowTypical] = useState(true);
  const [trajectorySampleIndex, setTrajectorySampleIndex] = useState(0);
  const [resampleSourceId, setResampleSourceId] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const trajectorySampleStepRef = useRef(TRAJECTORY_SAMPLE_STEPS[0]);
  const resampleSourceIdRef = useRef<string | null>(null);

  const trajectorySampleStep = TRAJECTORY_SAMPLE_STEPS[trajectorySampleIndex];
  const canResample =
    !!result && resampleSourceId === result?.meta.id && !running;

  useEffect(() => {
    const worker = new Worker(new URL('./worker/simWorker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent) => {
      const { type, payload } = event.data as {
        type: 'progress' | 'done' | 'cancelled' | 'error' | 'resampled' | 'resample_error';
        payload?: any;
      };

      if (type === 'progress') {
        setProgress({ completed: payload.completed, total: payload.total });
      }

      if (type === 'done') {
        setRunning(false);
        setResult(payload.result as SimulationResult);
        setProgress({ completed: payload.result.inputs.runs, total: payload.result.inputs.runs });
        setError(null);
        setResampleSourceId(payload.result.meta.id);
        const step = trajectorySampleStepRef.current;
        if (step !== TRAJECTORY_SAMPLE_STEPS[0]) {
          workerRef.current?.postMessage({
            type: 'resample',
            payload: { step, sessionId: payload.result.meta.id },
          });
        }
      }

      if (type === 'cancelled') {
        setRunning(false);
      }

      if (type === 'error') {
        setRunning(false);
        setError(payload.message ?? 'Simulation failed.');
      }

      if (type === 'resampled') {
        const sessionId = payload.sessionId as string | undefined;
        if (sessionId && sessionId !== resampleSourceIdRef.current) {
          return;
        }
        setResult((prev) => {
          if (!prev) {
            return prev;
          }
          return {
            ...prev,
            aggregate: {
              ...prev.aggregate,
              selected_runs: {
                ...prev.aggregate.selected_runs,
                sample_run_indices: payload.sample_run_indices ?? prev.aggregate.selected_runs.sample_run_indices,
              },
            },
            trajectories: {
              ...prev.trajectories,
              samples: payload.samples ?? prev.trajectories.samples,
              sample_run_indices:
                payload.sample_run_indices ?? prev.trajectories.sample_run_indices,
            },
          };
        });
      }
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    refreshSaved();
  }, []);

  useEffect(() => {
    setRtpDraft(inputs.rtp_percent.toFixed(1));
  }, [inputs.rtp_percent]);

  useEffect(() => {
    trajectorySampleStepRef.current = trajectorySampleStep;
  }, [trajectorySampleStep]);

  useEffect(() => {
    resampleSourceIdRef.current = resampleSourceId;
  }, [resampleSourceId]);

  useEffect(() => {
    setNumericDrafts((prev) => ({
      ...prev,
      ...(activeDraft !== 'target_points'
        ? { target_points: String(inputs.target_points) }
        : {}),
      ...(activeDraft !== 'bet_size' ? { bet_size: String(inputs.bet_size) } : {}),
      ...(activeDraft !== 'deposit_amount'
        ? { deposit_amount: String(inputs.deposit_amount) }
        : {}),
      ...(activeDraft !== 'runs' ? { runs: String(inputs.runs) } : {}),
      ...(activeDraft !== 'spins_per_sec'
        ? { spins_per_sec: String(inputs.spins_per_sec) }
        : {}),
      ...(activeDraft !== 'traj_points' ? { traj_points: String(inputs.traj_points) } : {}),
    }));
  }, [
    inputs.target_points,
    inputs.bet_size,
    inputs.deposit_amount,
    inputs.runs,
    inputs.spins_per_sec,
    inputs.traj_points,
    activeDraft,
  ]);

  const spinsPerRun = useMemo(() => {
    const betCents = Math.round(inputs.bet_size * 100);
    const targetCents = Math.round(inputs.coin_in_target * 100);
    return Math.ceil(targetCents / Math.max(1, betCents));
  }, [inputs.bet_size, inputs.coin_in_target]);

  const minutesPerRun = useMemo(() => {
    return spinsPerRun / Math.max(0.01, inputs.spins_per_sec) / 60;
  }, [spinsPerRun, inputs.spins_per_sec]);

  const medianSpinsPerRun = useMemo(() => {
    if (!result || result.runs.length === 0) {
      return null;
    }
    const spins = result.runs.map((run) => run.spins).sort((a, b) => a - b);
    const mid = Math.floor(spins.length / 2);
    if (spins.length % 2 === 0) {
      return Math.round((spins[mid - 1] + spins[mid]) / 2);
    }
    return spins[mid];
  }, [result]);

  const resultSpinRatePerSec = useMemo(() => {
    if (!result) {
      return inputs.spins_per_sec;
    }
    return resolveSpinRatePerSec(result.inputs);
  }, [result, inputs.spins_per_sec]);

  const timeInCasinoMinutes = useMemo(() => {
    if (medianSpinsPerRun === null) {
      return null;
    }
    return medianSpinsPerRun / Math.max(0.01, resultSpinRatePerSec) / 60;
  }, [medianSpinsPerRun, resultSpinRatePerSec]);

  const runtimeWarning = spinsPerRun > 50000;
  const runsWarning = inputs.runs > 20000;

  function resolveSpinRatePerSec(nextInputs: SimulationInputs) {
    if (Number.isFinite(nextInputs.spins_per_sec)) {
      return nextInputs.spins_per_sec;
    }
    if (Number.isFinite(nextInputs.spins_per_min)) {
      return nextInputs.spins_per_min / 60;
    }
    return DEFAULT_INPUTS.spins_per_sec;
  }

  function normalizeInputs(nextInputs: SimulationInputs): SimulationInputs {
    return {
      ...DEFAULT_INPUTS,
      ...nextInputs,
      spins_per_sec: resolveSpinRatePerSec(nextInputs),
    };
  }

  function formatDuration(minutes: number) {
    if (!Number.isFinite(minutes)) {
      return '-';
    }
    if (minutes < 60) {
      return `${minutes.toFixed(1)} min`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}h ${String(mins).padStart(2, '0')}m`;
  }

  function updateInput<K extends keyof SimulationInputs>(key: K, value: SimulationInputs[K]) {
    setInputs((prev) => {
      const next = { ...prev, [key]: value } as SimulationInputs;
      if (key === 'target_points' || key === 'points_per_dollar') {
        next.coin_in_target = Number((next.target_points / next.points_per_dollar).toFixed(2));
      }
      return next;
    });
  }

  function parseNumericDraft(value: string): number | null {
    const trimmed = value.trim();
    if (trimmed === '' || trimmed === '.' || trimmed === '-' || trimmed === '+') {
      return null;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    return parsed;
  }

  function handleNumericDraftChange(key: NumericInputKey, value: string) {
    setNumericDrafts((prev) => ({ ...prev, [key]: value }));
    const parsed = parseNumericDraft(value);
    if (parsed === null) {
      return;
    }
    updateInput(key, parsed as SimulationInputs[typeof key]);
  }

  function commitNumericDraft(key: NumericInputKey) {
    const parsed = parseNumericDraft(numericDrafts[key]);
    if (parsed === null) {
      setNumericDrafts((prev) => ({ ...prev, [key]: String(inputs[key]) }));
      return;
    }
    updateInput(key, parsed as SimulationInputs[typeof key]);
  }

  function commitRtpDraft() {
    const parsed = Number(rtpDraft);
    if (!Number.isFinite(parsed)) {
      setRtpDraft(inputs.rtp_percent.toFixed(1));
      return;
    }
    const clamped = Math.min(99.9, Math.max(80, parsed));
    updateInput('rtp_percent', Number(clamped.toFixed(1)));
  }

  function handleRun() {
    if (!workerRef.current) {
      return;
    }
    setError(null);
    setRunning(true);
    setResult(null);
    setResampleSourceId(null);
    setProgress({ completed: 0, total: inputs.runs });
    workerRef.current.postMessage({ type: 'simulate', payload: { inputs } });
  }

  function handleCancel() {
    workerRef.current?.postMessage({ type: 'cancel' });
  }

  function handleTrajectorySampleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextIndex = Number(event.target.value);
    setTrajectorySampleIndex(nextIndex);
    const step = TRAJECTORY_SAMPLE_STEPS[nextIndex];
    if (!workerRef.current || !result || !canResample) {
      return;
    }
    workerRef.current.postMessage({
      type: 'resample',
      payload: { step, sessionId: result.meta.id },
    });
  }

  async function refreshSaved() {
    const data = await db.simulations.orderBy('created_at').reverse().toArray();
    setSaved(data);
  }

  async function handleSave() {
    if (!result) {
      setError('Run a simulation before saving.');
      return;
    }
    if (!saveName.trim()) {
      setError('Enter a name to save this simulation.');
      return;
    }

    const savedResult: SimulationResult = {
      ...result,
      meta: {
        ...result.meta,
        id: crypto.randomUUID(),
        name: saveName.trim(),
        created_at: new Date().toISOString(),
      },
    };

    await db.simulations.put({
      id: savedResult.meta.id,
      name: savedResult.meta.name,
      created_at: savedResult.meta.created_at,
      data: savedResult,
    });

    setResult(savedResult);
    setResampleSourceId(savedResult.meta.id);
    setSaveName('');
    refreshSaved();
  }

  async function handleLoad(id: string) {
    const savedSim = await db.simulations.get(id);
    if (!savedSim) {
      return;
    }
    const normalizedInputs = normalizeInputs(savedSim.data.inputs);
    setResult({ ...savedSim.data, inputs: normalizedInputs });
    setInputs(normalizedInputs);
    setSaveName(savedSim.name);
    setError(null);
    setResampleSourceId(null);
  }

  async function handleDelete(id: string) {
    await db.simulations.delete(id);
    refreshSaved();
  }

  function handleExport() {
    if (!result) {
      setError('Run a simulation before exporting.');
      return;
    }
    const name = result.meta.name || 'simulation';
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${name.replace(/\s+/g, '_')}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      const data = JSON.parse(text) as SimulationResult;
      if (!data.schema_version || !data.meta?.id) {
        throw new Error('Invalid simulation file.');
      }
      const normalizedInputs = normalizeInputs(data.inputs);
      const normalizedData = { ...data, inputs: normalizedInputs };
      await db.simulations.put({
        id: normalizedData.meta.id,
        name: normalizedData.meta.name || 'Imported simulation',
        created_at: normalizedData.meta.created_at || new Date().toISOString(),
        data: normalizedData,
      });
      setResult(normalizedData);
      setInputs(normalizedInputs);
      refreshSaved();
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const summary = result?.aggregate;
  const trajectorySampleCount = useMemo(() => {
    if (!result) {
      return 0;
    }
    return estimateSampleCount(result.inputs.runs, trajectorySampleStep);
  }, [result, trajectorySampleStep]);

  return (
    <div className="app-shell">
      <div className="panel controls fade-in">
        <h1 className="title">RC Casino Points Simulator</h1>
        <p className="note">
          Simulate runs to reach {inputs.target_points.toLocaleString()} RC points
          ({formatCurrency(inputs.coin_in_target)} in coin-in).
        </p>
        <p className="note">
          Coin-in includes all wagers, including recycled winnings. Cash-in tracks the money
          added when the balance hits $0.
        </p>

        <div className="section-block">
          <div className="section-title">Simulation inputs</div>

          <div className="input-row">
            <div className="label-row">
              <label htmlFor="rtp-range">RTP</label>
              <span
                className="info-tip"
                data-tooltip="Average return per $1 coin-in. Land casinos typically return 92-97% per US regulations. Cruise ships often use lower return rates, around 85-90%."
                aria-label="RTP range and meaning"
                tabIndex={0}
              >
                i
              </span>
              <span className="label-meta">80-99.9%</span>
            </div>
            <div className="range-row">
              <input
                id="rtp-range"
                type="range"
                min={80}
                max={99.9}
                step={0.1}
                value={inputs.rtp_percent}
                onChange={(event) => updateInput('rtp_percent', Number(event.target.value))}
              />
              <div className="input-group compact">
                <input
                  id="rtp-input"
                  type="text"
                  inputMode="decimal"
                  value={rtpDraft}
                  onChange={(event) => setRtpDraft(event.target.value)}
                  onBlur={commitRtpDraft}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      commitRtpDraft();
                    }
                  }}
                  aria-label="RTP percent"
                />
                <span className="input-addon suffix">%</span>
              </div>
            </div>
          </div>

          <div className="input-row">
            <div className="label-row">
              <label htmlFor="target-points">Target RC points</label>
              <span
                className="info-tip"
                data-tooltip="RC awards 1 point per $5 coin-in. Reward tiers: Prime at 2,500, Signature at 25,000, Masters at 100,000+."
                aria-label="Target points info"
                tabIndex={0}
              >
                i
              </span>
              <span className="label-meta">100-250,000</span>
            </div>
            <div className="input-inline">
              <input
                id="target-points"
                type="text"
                inputMode="numeric"
                value={numericDrafts.target_points}
                onChange={(event) =>
                  handleNumericDraftChange('target_points', event.target.value)
                }
                onFocus={() => setActiveDraft('target_points')}
                onBlur={() => {
                  commitNumericDraft('target_points');
                  setActiveDraft(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    commitNumericDraft('target_points');
                    setActiveDraft(null);
                  }
                }}
              />
              <span className="input-meta">
                Coin-in {formatCurrency(inputs.coin_in_target)}
              </span>
            </div>
          </div>

          <div className="input-row">
            <div className="label-row">
              <label>Machine Volatility</label>
              <span
                className="info-tip"
                data-tooltip="High volatility machines include extra features beyond the base spin, like multiple bonus types that can stack or combine. Medium volatility has a single bonus feature, such as one bonus round or free spins. Low volatility has no bonus mechanics."
                aria-label="Machine volatility help"
                tabIndex={0}
              >
                i
              </span>
            </div>
            <div className="pill-group" role="group" aria-label="Volatility">
              {(['LOW', 'MEDIUM', 'HIGH'] as Volatility[]).map((vol) => (
                <button
                  key={vol}
                  type="button"
                  className={`pill ${inputs.volatility === vol ? 'active' : ''}`}
                  onClick={() => updateInput('volatility', vol)}
                  aria-pressed={inputs.volatility === vol}
                >
                  {vol}
                </button>
              ))}
            </div>
          </div>

          <div className="input-row">
            <div className="label-row">
              <label htmlFor="bet-size">Bet size</label>
              <span
                className="info-tip"
                data-tooltip="Amount spent per spin."
                aria-label="Bet size info"
                tabIndex={0}
              >
                i
              </span>
              <span className="label-meta">$0.25-$1,000</span>
            </div>
            <div className="input-group">
              <span className="input-addon">$</span>
              <input
                id="bet-size"
                type="text"
                inputMode="decimal"
                value={numericDrafts.bet_size}
                onChange={(event) => handleNumericDraftChange('bet_size', event.target.value)}
                onFocus={() => setActiveDraft('bet_size')}
                onBlur={() => {
                  commitNumericDraft('bet_size');
                  setActiveDraft(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    commitNumericDraft('bet_size');
                    setActiveDraft(null);
                  }
                }}
              />
            </div>
          </div>

          <div className="input-row">
            <div className="label-row">
              <label htmlFor="deposit-amount">Top-up Amount</label>
              <span
                className="info-tip"
                data-tooltip="Cash-in amount when the balance hits $0."
                aria-label="Top-up info"
                tabIndex={0}
              >
                i
              </span>
              <span className="label-meta">$20-$50,000</span>
            </div>
            <div className="input-group">
              <span className="input-addon">$</span>
              <input
                id="deposit-amount"
                type="text"
                inputMode="decimal"
                value={numericDrafts.deposit_amount}
                onChange={(event) =>
                  handleNumericDraftChange('deposit_amount', event.target.value)
                }
                onFocus={() => setActiveDraft('deposit_amount')}
                onBlur={() => {
                  commitNumericDraft('deposit_amount');
                  setActiveDraft(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    commitNumericDraft('deposit_amount');
                    setActiveDraft(null);
                  }
                }}
              />
            </div>
          </div>

          <details className="advanced-section">
            <summary className="advanced-summary">
              Advanced
              <span>Runs, seed, timing</span>
            </summary>
            <div className="input-row">
              <div className="label-row">
                <label htmlFor="runs">Runs per simulation</label>
                <span
                  className="info-tip"
                  data-tooltip="Number of runs per simulation."
                  aria-label="Runs per simulation info"
                  tabIndex={0}
                >
                  i
                </span>
                <span className="label-meta">100-100,000</span>
              </div>
              <input
                id="runs"
                type="text"
                inputMode="numeric"
                value={numericDrafts.runs}
                onChange={(event) => handleNumericDraftChange('runs', event.target.value)}
                onFocus={() => setActiveDraft('runs')}
                onBlur={() => {
                  commitNumericDraft('runs');
                  setActiveDraft(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    commitNumericDraft('runs');
                    setActiveDraft(null);
                  }
                }}
              />
            </div>
            <div className="input-row">
              <div className="label-row">
                <label htmlFor="seed">Seed (optional)</label>
                <span
                  className="info-tip"
                  data-tooltip="Reproducible runs."
                  aria-label="Seed info"
                  tabIndex={0}
                >
                  i
                </span>
              </div>
              <input
                id="seed"
                type="text"
                value={inputs.seed ?? ''}
                onChange={(event) => updateInput('seed', event.target.value || null)}
              />
            </div>
            <div className="input-row">
              <div className="label-row">
                <label htmlFor="spins-per-sec">Spins per second</label>
                <span
                  className="info-tip"
                  data-tooltip={`Used for time estimates. Minutes/run: ${minutesPerRun.toFixed(1)}.`}
                  aria-label="Spins per second info"
                  tabIndex={0}
                >
                  i
                </span>
                <span className="label-meta">0.01-30</span>
              </div>
              <input
                id="spins-per-sec"
                type="text"
                inputMode="decimal"
                value={numericDrafts.spins_per_sec}
                onChange={(event) =>
                  handleNumericDraftChange('spins_per_sec', event.target.value)
                }
                onFocus={() => setActiveDraft('spins_per_sec')}
                onBlur={() => {
                  commitNumericDraft('spins_per_sec');
                  setActiveDraft(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    commitNumericDraft('spins_per_sec');
                    setActiveDraft(null);
                  }
                }}
              />
            </div>
            <div className="input-row">
              <div className="label-row">
                <label htmlFor="traj-points">Trajectory points</label>
                <span
                  className="info-tip"
                  data-tooltip="Line resolution for trajectories."
                  aria-label="Trajectory points info"
                  tabIndex={0}
                >
                  i
                </span>
                <span className="label-meta">100-1,000</span>
              </div>
              <input
                id="traj-points"
                type="text"
                inputMode="numeric"
                value={numericDrafts.traj_points}
                onChange={(event) =>
                  handleNumericDraftChange('traj_points', event.target.value)
                }
                onFocus={() => setActiveDraft('traj_points')}
                onBlur={() => {
                  commitNumericDraft('traj_points');
                  setActiveDraft(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    commitNumericDraft('traj_points');
                    setActiveDraft(null);
                  }
                }}
              />
            </div>
          </details>
        </div>

        <div className="section-block">
          <div className="section-title">Run simulation</div>
          <div className="split input-row">
            <button className="button" onClick={handleRun} disabled={running}>
              Run simulation
            </button>
            <button className="button ghost" onClick={handleCancel} disabled={!running}>
              Cancel
            </button>
          </div>

          <div className="progress">
            <span>{running ? 'Running' : 'Idle'}</span>
            <progress max={progress.total || 1} value={progress.completed} />
            <span>
              {progress.completed}/{progress.total || inputs.runs}
            </span>
          </div>

          {runsWarning && (
            <div className="notice warning">Warning: runs &gt; 20,000 may be slow.</div>
          )}
          {runtimeWarning && (
            <div className="notice warning">Warning: bet size implies &gt; 50,000 spins/run.</div>
          )}
          {error && <div className="notice error">{error}</div>}
        </div>

        <div className="section-block">
          <div className="section-title">Save and Share</div>
          <div className="input-row">
            <div className="label-row">
              <label htmlFor="save-name">Save name</label>
              <span className="label-meta">Stored in this browser</span>
            </div>
            <input
              id="save-name"
              type="text"
              placeholder="My 90% RTP run"
              value={saveName}
              onChange={(event) => setSaveName(event.target.value)}
            />
          </div>
          <div className="split action-row">
            <button className="button secondary" onClick={handleSave} disabled={!result}>
              Save
            </button>
            <button className="button ghost" onClick={handleExport} disabled={!result}>
              Export JSON
            </button>
            <label className="button ghost">
              Import JSON
              <input
                type="file"
                accept="application/json"
                onChange={handleImport}
                style={{ display: 'none' }}
              />
            </label>
          </div>
        </div>

        <div className="section-block">
          <div className="section-title">Saved simulations</div>
          <div className="saved-list">
            {saved.length === 0 && <div className="note">No saved simulations yet.</div>}
            {saved.map((item) => (
              <div key={item.id} className="saved-item">
                <div>
                  <div>{item.name}</div>
                  <div className="note">{new Date(item.created_at).toLocaleString()}</div>
                </div>
                <div className="split">
                  <button className="button secondary" onClick={() => handleLoad(item.id)}>
                    Load
                  </button>
                  <button className="button ghost" onClick={() => handleDelete(item.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="note">
          Results are illustrative and depend on the selected RTP and volatility model.
        </div>
      </div>

      <div className="chart-stack">
        <div className="panel trajectory-panel">
          <div className="section-title chart-header">Trajectory (Net vs Coin-in)</div>
          <div className="chart-slot">
            <TrajectoryChart
              result={result}
              showSamples={showSamples}
              showBestWorst={showBestWorst}
              showTypical={showTypical}
            />
          </div>
          <div className="toggle-group">
            <label className="toggle">
              <input
                type="checkbox"
                checked={showSamples}
                onChange={(event) => setShowSamples(event.target.checked)}
              />
              Sampled runs (every {trajectorySampleStep})
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={showBestWorst}
                onChange={(event) => setShowBestWorst(event.target.checked)}
              />
              Best + Worst
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={showTypical}
                onChange={(event) => setShowTypical(event.target.checked)}
              />
              Typical
            </label>
          </div>
          <div className="trajectory-sample">
            <div className="label-row">
              <label htmlFor="trajectory-sample">Sample density</label>
              <span className="label-meta">
                {result ? `${trajectorySampleCount} lines` : 'Run to enable'}
              </span>
            </div>
            <input
              id="trajectory-sample"
              type="range"
              min={0}
              max={TRAJECTORY_SAMPLE_STEPS.length - 1}
              step={1}
              value={trajectorySampleIndex}
              onChange={handleTrajectorySampleChange}
              disabled={!canResample}
            />
            <div className="trajectory-sample-ticks">
              {TRAJECTORY_SAMPLE_STEPS.map((step, index) => (
                <span
                  key={step}
                  className={index === trajectorySampleIndex ? 'active' : undefined}
                >
                  {step}
                </span>
              ))}
            </div>
            <div className="trajectory-sample-note">
              Every {trajectorySampleStep} runs
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="section-title">Distribution + Summary</div>
          <div className="summary-grid">
            <div className="histogram-wrap">
              <HistogramChart result={result} />
            </div>
            <div>
              {!summary && <div className="note">Run a simulation to see metrics.</div>}
              {summary && (
                <div className="kv metrics">
                  <div>
                    <div className="metric-label">
                      <span>Median final net</span>
                      <span
                        className="info-tip"
                        data-tooltip="Middle final net across all runs (50% above, 50% below). Final net equals total payout minus total coin-in."
                        aria-label="Median final net info"
                        tabIndex={0}
                      >
                        i
                      </span>
                    </div>
                    <strong>{formatCurrency(summary.final_net.median)}</strong>
                  </div>
                  <div>
                    <div className="metric-label">
                      <span>Mean final net</span>
                      <span
                        className="info-tip"
                        data-tooltip="Average final net across all runs. This is sensitive to rare big wins or losses."
                        aria-label="Mean final net info"
                        tabIndex={0}
                      >
                        i
                      </span>
                    </div>
                    <strong>{formatCurrency(summary.final_net.mean)}</strong>
                  </div>
                  <div>
                    <div className="metric-label">
                      <span>P10 / P90</span>
                      <span
                        className="info-tip"
                        data-tooltip="10th and 90th percentile final net values. 80% of outcomes fall between these two numbers."
                        aria-label="P10 and P90 info"
                        tabIndex={0}
                      >
                        i
                      </span>
                    </div>
                    <strong>
                      {formatCurrency(summary.final_net.p10)} / {formatCurrency(summary.final_net.p90)}
                    </strong>
                  </div>
                  <div>
                    <div className="metric-label">
                      <span>Worst / Best</span>
                      <span
                        className="info-tip"
                        data-tooltip="Lowest and highest final net observed across all runs."
                        aria-label="Worst and best info"
                        tabIndex={0}
                      >
                        i
                      </span>
                    </div>
                    <strong>
                      {formatCurrency(summary.final_net.min)} / {formatCurrency(summary.final_net.max)}
                    </strong>
                  </div>
                  <div>
                    <div className="metric-label">
                      <span>P(profit)</span>
                      <span
                        className="info-tip"
                        data-tooltip="Share of runs that end with a positive final net."
                        aria-label="Probability of profit info"
                        tabIndex={0}
                      >
                        i
                      </span>
                    </div>
                    <strong>{formatPercent(summary.final_net.p_profit)}</strong>
                  </div>
                  <div>
                    <div className="metric-label">
                      <span>P(loss &gt; $1k)</span>
                      <span
                        className="info-tip"
                        data-tooltip="Probability the final net is worse than -$1,000."
                        aria-label="Probability of loss greater than one thousand info"
                        tabIndex={0}
                      >
                        i
                      </span>
                    </div>
                    <strong>{formatPercent(summary.final_net.p_loss_gt['1000'])}</strong>
                  </div>
                  <div>
                    <div className="metric-label">
                      <span>P(loss &gt; $2k)</span>
                      <span
                        className="info-tip"
                        data-tooltip="Probability the final net is worse than -$2,000."
                        aria-label="Probability of loss greater than two thousand info"
                        tabIndex={0}
                      >
                        i
                      </span>
                    </div>
                    <strong>{formatPercent(summary.final_net.p_loss_gt['2000'])}</strong>
                  </div>
                  <div>
                    <div className="metric-label">
                      <span>P(loss &gt; $3k)</span>
                      <span
                        className="info-tip"
                        data-tooltip="Probability the final net is worse than -$3,000."
                        aria-label="Probability of loss greater than three thousand info"
                        tabIndex={0}
                      >
                        i
                      </span>
                    </div>
                    <strong>{formatPercent(summary.final_net.p_loss_gt['3000'])}</strong>
                  </div>
                  <div>
                    <div className="metric-label">
                      <span>Total cash in (median)</span>
                      <span
                        className="info-tip"
                        data-tooltip="Median total cash-in across runs. Cash-in is the sum of top-ups when the balance hits $0."
                        aria-label="Median total cash in info"
                        tabIndex={0}
                      >
                        i
                      </span>
                    </div>
                    <strong>{formatCurrency(summary.cash_in.median)}</strong>
                  </div>
                  <div>
                    <div className="metric-label">
                      <span>Ending balance (median)</span>
                      <span
                        className="info-tip"
                        data-tooltip="Median ending balance after reaching the coin-in target."
                        aria-label="Median ending balance info"
                        tabIndex={0}
                      >
                        i
                      </span>
                    </div>
                    <strong>{formatCurrency(summary.ending_balance.median)}</strong>
                  </div>
                  <div>
                    <div className="metric-label">
                      <span>Median spins/run</span>
                      <span
                        className="info-tip"
                        data-tooltip="Median number of spins needed to reach the coin-in target."
                        aria-label="Median spins per run info"
                        tabIndex={0}
                      >
                        i
                      </span>
                    </div>
                    <strong>
                      {medianSpinsPerRun === null ? '-' : medianSpinsPerRun.toLocaleString()}
                    </strong>
                  </div>
                  <div>
                    <div className="metric-label">
                      <span>Time in casino</span>
                      <span
                        className="info-tip"
                        data-tooltip="Estimated real time for a typical run based on median spins and the configured spins per second."
                        aria-label="Time in casino info"
                        tabIndex={0}
                      >
                        i
                      </span>
                    </div>
                    <strong>
                      {timeInCasinoMinutes === null ? '-' : formatDuration(timeInCasinoMinutes)}
                    </strong>
                  </div>
                  <div>
                    <div className="metric-label">
                      <span>CVaR 5%</span>
                      <span
                        className="info-tip"
                        data-tooltip="Average of the worst 5% final net outcomes. A tail-risk measure for bad runs."
                        aria-label="CVaR 5% info"
                        tabIndex={0}
                      >
                        i
                      </span>
                    </div>
                    <strong>{formatCurrency(summary.final_net.cvar_5)}</strong>
                  </div>
                  <div>
                    <div className="metric-label">
                      <span>CVaR 1%</span>
                      <span
                        className="info-tip"
                        data-tooltip="Average of the worst 1% final net outcomes. This highlights extreme downside risk."
                        aria-label="CVaR 1% info"
                        tabIndex={0}
                      >
                        i
                      </span>
                    </div>
                    <strong>{formatCurrency(summary.final_net.cvar_1)}</strong>
                  </div>
                  <div>
                    <div className="metric-label">
                      <span>Drawdown (mean)</span>
                      <span
                        className="info-tip"
                        data-tooltip="Average maximum drawdown across runs. Drawdown is the peak-to-trough drop in net during a run."
                        aria-label="Mean drawdown info"
                        tabIndex={0}
                      >
                        i
                      </span>
                    </div>
                    <strong>{formatCurrency(summary.max_drawdown.mean)}</strong>
                  </div>
                  <div>
                    <div className="metric-label">
                      <span>Drawdown (p95)</span>
                      <span
                        className="info-tip"
                        data-tooltip="95th percentile of maximum drawdown. Only 5% of runs experience a larger peak-to-trough drop."
                        aria-label="P95 drawdown info"
                        tabIndex={0}
                      >
                        i
                      </span>
                    </div>
                    <strong>{formatCurrency(summary.max_drawdown.p95)}</strong>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {result && (
          <div className="panel">
            <div className="section-title">Run snapshot</div>
            <div className="kv">
              <div>
                Runs
                <strong>{result.inputs.runs}</strong>
              </div>
              <div>
                Target points
                <strong>{result.inputs.target_points.toLocaleString()}</strong>
              </div>
              <div>
                Coin-in target
                <strong>{formatCurrency(result.inputs.coin_in_target)}</strong>
              </div>
              <div>
                Bet size
                <strong>{formatCurrencyWithCents(result.inputs.bet_size)}</strong>
              </div>
              <div>
                Volatility
                <strong>{result.inputs.volatility}</strong>
              </div>
              <div>
                Top-up amount
                <strong>{formatCurrencyWithCents(result.inputs.deposit_amount)}</strong>
              </div>
              <div>
                RTP
                <strong>{result.inputs.rtp_percent.toFixed(1)}%</strong>
              </div>
              <div>
                Typical spins/run
                <strong>{spinsPerRun}</strong>
              </div>
              <div>
                Time estimate/run
                <strong>{formatDuration(spinsPerRun / Math.max(0.01, resultSpinRatePerSec) / 60)}</strong>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
