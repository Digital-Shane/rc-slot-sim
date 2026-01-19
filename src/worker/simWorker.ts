/// <reference lib="webworker" />
import { AggregateMetrics, RunMetrics, SimulationInputs, SimulationResult, Volatility } from '../sim/types';

const MODEL_VERSION = 'slot-mixture-v1' as const;
const SCHEMA_VERSION = '1.0' as const;
const APP_VERSION = '0.1.0';

const LOSS_THRESHOLDS = [500, 1000, 2000, 3000, 5000];

const VOLATILITY_SETTINGS: Record<Volatility, {
  p0: number;
  type: 'gamma' | 'lognormal';
  k?: number;
  sigma?: number;
  cap: number;
}> = {
  LOW: { p0: 0.55, type: 'gamma', k: 6, cap: 50 },
  MEDIUM: { p0: 0.7, type: 'gamma', k: 2, cap: 200 },
  HIGH: { p0: 0.82, type: 'lognormal', sigma: 1.3, cap: 2000 },
};

let cancelled = false;

self.onmessage = (event: MessageEvent) => {
  const { type, payload } = event.data as {
    type: 'simulate' | 'cancel';
    payload?: { inputs: SimulationInputs };
  };

  if (type === 'cancel') {
    cancelled = true;
    return;
  }

  if (type === 'simulate' && payload) {
    cancelled = false;
    runSimulation(payload.inputs)
      .then((result) => {
        if (cancelled) {
          postMessage({ type: 'cancelled' });
          return;
        }
        postMessage({ type: 'done', payload: { result } });
      })
      .catch((error: Error) => {
        postMessage({ type: 'error', payload: { message: error.message } });
      });
  }
};

async function runSimulation(inputs: SimulationInputs): Promise<SimulationResult> {
  const rtp = inputs.rtp_percent / 100;
  const settings = VOLATILITY_SETTINGS[inputs.volatility];
  const muNonzero = rtp / (1 - settings.p0);
  const rng = createRng(inputs.seed);
  const capRng = createRng(`${inputs.seed ?? 'seedless'}-cap`);
  const capAdjustment = computeCapAdjustment(settings, muNonzero, capRng);
  const depositAmount = Math.max(0.01, inputs.deposit_amount);

  const coinInTarget = inputs.coin_in_target;
  const betCents = Math.round(inputs.bet_size * 100);
  const targetCents = Math.round(coinInTarget * 100);
  const grid = buildCoinInGrid(inputs.traj_points, coinInTarget);

  const runs: RunMetrics[] = [];
  const finalNets: number[] = [];
  const maxDrawdowns: number[] = [];
  const cashIns: number[] = [];
  const endingBalances: number[] = [];
  const downsampledRuns: number[][] = [];

  let bestRunIndex = 1;
  let worstRunIndex = 1;
  let bestNet = -Infinity;
  let worstNet = Infinity;
  let bestTrajectory: number[] = [];
  let worstTrajectory: number[] = [];

  const progressInterval = Math.max(1, Math.floor(inputs.runs / 100));

  for (let runIndex = 1; runIndex <= inputs.runs; runIndex += 1) {
    if (cancelled) {
      break;
    }

    const coinInHistory: number[] = [0];
    const netHistory: number[] = [0];

    let coinInCents = 0;
    let totalPayout = 0;
    let net = 0;
    let peakNet = 0;
    let maxDrawdown = 0;
    let spins = 0;
    let balance = depositAmount;
    let totalCashIn = depositAmount;

    while (coinInCents < targetCents) {
      const remainingCents = targetCents - coinInCents;
      const spinBetCents = Math.min(betCents, remainingCents);
      const bet = spinBetCents / 100;

      while (balance + 1e-9 < bet) {
        balance += depositAmount;
        totalCashIn += depositAmount;
      }

      balance -= bet;
      const payout = samplePayout(bet, settings, muNonzero, capAdjustment, rng);

      coinInCents += spinBetCents;
      totalPayout += payout;
      net += payout - bet;
      balance += payout;

      if (net > peakNet) {
        peakNet = net;
      }
      const drawdown = peakNet - net;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }

      spins += 1;
      coinInHistory.push(coinInCents / 100);
      netHistory.push(net);
    }

    const downsampled = downsampleTrajectory(coinInHistory, netHistory, grid);
    downsampledRuns.push(downsampled);

    const finalNet = net;
    if (finalNet > bestNet) {
      bestNet = finalNet;
      bestRunIndex = runIndex;
      bestTrajectory = downsampled;
    }
    if (finalNet < worstNet) {
      worstNet = finalNet;
      worstRunIndex = runIndex;
      worstTrajectory = downsampled;
    }

    const runMetrics: RunMetrics = {
      run_index: runIndex,
      spins,
      total_coin_in: coinInCents / 100,
      total_payout: totalPayout,
      final_net: finalNet,
      max_drawdown: maxDrawdown,
      time_estimate_minutes: spins / Math.max(0.01, inputs.spins_per_sec) / 60,
      total_cash_in: totalCashIn,
      ending_balance: balance,
    };

    runs.push(runMetrics);
    finalNets.push(finalNet);
    maxDrawdowns.push(maxDrawdown);
    cashIns.push(totalCashIn);
    endingBalances.push(balance);

    if (runIndex % progressInterval === 0 || runIndex === inputs.runs) {
      postMessage({ type: 'progress', payload: { completed: runIndex, total: inputs.runs } });
      await yieldToEventLoop();
    }
  }

  const typicalTrajectory = medianTrajectory(downsampledRuns);

  const sampleIndices = sampleRunIndices(inputs.runs);
  const sampleTrajectories = sampleIndices.map((idx) => downsampledRuns[idx - 1]);

  const aggregate = computeAggregate(finalNets, maxDrawdowns, cashIns, endingBalances, {
    best_run_index: bestRunIndex,
    worst_run_index: worstRunIndex,
    sample_run_indices: sampleIndices,
  });

  return {
    schema_version: SCHEMA_VERSION,
    model_version: MODEL_VERSION,
    meta: {
      id: crypto.randomUUID(),
      name: '',
      created_at: new Date().toISOString(),
      app_version: APP_VERSION,
    },
    inputs,
    aggregate,
    runs,
    trajectories: {
      x_coin_in: grid,
      samples: sampleTrajectories,
      sample_run_indices: sampleIndices,
      best: bestTrajectory,
      worst: worstTrajectory,
      typical_median: typicalTrajectory,
    },
  };
}

function samplePayout(
  bet: number,
  settings: (typeof VOLATILITY_SETTINGS)[Volatility],
  muNonzero: number,
  capAdjustment: number,
  rng: () => number
): number {
  if (rng() < settings.p0) {
    return 0;
  }

  let raw = 1;
  if (settings.type === 'gamma' && settings.k) {
    raw = gammaSample(settings.k, rng) * (1 / settings.k);
  } else if (settings.type === 'lognormal' && settings.sigma) {
    const muL = -(settings.sigma ** 2) / 2;
    raw = Math.exp(muL + settings.sigma * randomNormal(rng));
  }

  let multiplier = muNonzero * raw;
  if (multiplier > settings.cap) {
    multiplier = settings.cap;
  }
  multiplier *= capAdjustment;

  return bet * multiplier;
}

function computeCapAdjustment(
  settings: (typeof VOLATILITY_SETTINGS)[Volatility],
  muNonzero: number,
  rng: () => number
): number {
  const samples = 2_000_000;
  let sum = 0;

  for (let i = 0; i < samples; i += 1) {
    let raw = 1;
    if (settings.type === 'gamma' && settings.k) {
      raw = gammaSample(settings.k, rng) * (1 / settings.k);
    } else if (settings.type === 'lognormal' && settings.sigma) {
      const muL = -(settings.sigma ** 2) / 2;
      raw = Math.exp(muL + settings.sigma * randomNormal(rng));
    }

    let value = muNonzero * raw;
    if (value > settings.cap) {
      value = settings.cap;
    }
    sum += value;
  }

  const meanCapped = sum / samples;
  return muNonzero / meanCapped;
}

function medianTrajectory(runs: number[][]): number[] {
  if (runs.length === 0) {
    return [];
  }
  const points = runs[0].length;
  const median: number[] = new Array(points).fill(0);

  for (let i = 0; i < points; i += 1) {
    const values = runs.map((run) => run[i]).sort((a, b) => a - b);
    median[i] = medianSorted(values);
  }

  return median;
}

function computeAggregate(
  finalNets: number[],
  maxDrawdowns: number[],
  cashIns: number[],
  endingBalances: number[],
  selectedRuns: AggregateMetrics['selected_runs']
): AggregateMetrics {
  const sortedFinals = [...finalNets].sort((a, b) => a - b);
  const sortedDrawdowns = [...maxDrawdowns].sort((a, b) => a - b);
  const sortedCashIns = [...cashIns].sort((a, b) => a - b);
  const sortedEndingBalances = [...endingBalances].sort((a, b) => a - b);

  const meanFinal = mean(finalNets);
  const stddevFinal = stddev(finalNets, meanFinal);
  const medianFinal = percentileSorted(sortedFinals, 50);
  const lossProbs: Record<string, number> = {};

  for (const threshold of LOSS_THRESHOLDS) {
    const count = finalNets.filter((value) => value < -threshold).length;
    lossProbs[String(threshold)] = count / finalNets.length;
  }

  const cvar5Count = Math.max(1, Math.floor(finalNets.length * 0.05));
  const cvar1Count = Math.max(1, Math.floor(finalNets.length * 0.01));

  const cvar5 = mean(sortedFinals.slice(0, cvar5Count));
  const cvar1 = mean(sortedFinals.slice(0, cvar1Count));

  return {
    final_net: {
      mean: meanFinal,
      median: medianFinal,
      stddev: stddevFinal,
      min: sortedFinals[0],
      max: sortedFinals[sortedFinals.length - 1],
      p01: percentileSorted(sortedFinals, 1),
      p05: percentileSorted(sortedFinals, 5),
      p10: percentileSorted(sortedFinals, 10),
      p25: percentileSorted(sortedFinals, 25),
      p50: percentileSorted(sortedFinals, 50),
      p75: percentileSorted(sortedFinals, 75),
      p90: percentileSorted(sortedFinals, 90),
      p95: percentileSorted(sortedFinals, 95),
      p99: percentileSorted(sortedFinals, 99),
      p_profit: finalNets.filter((value) => value > 0).length / finalNets.length,
      p_loss_gt: lossProbs,
      cvar_5: cvar5,
      cvar_1: cvar1,
    },
    max_drawdown: {
      mean: mean(maxDrawdowns),
      median: percentileSorted(sortedDrawdowns, 50),
      p95: percentileSorted(sortedDrawdowns, 95),
    },
    cash_in: {
      mean: mean(cashIns),
      median: percentileSorted(sortedCashIns, 50),
    },
    ending_balance: {
      mean: mean(endingBalances),
      median: percentileSorted(sortedEndingBalances, 50),
    },
    selected_runs: selectedRuns,
  };
}

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stddev(values: number[], meanValue: number): number {
  if (values.length === 0) {
    return 0;
  }
  const variance = values.reduce((sum, value) => sum + (value - meanValue) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function percentileSorted(sorted: number[], percentile: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const index = (percentile / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) {
    return sorted[lower];
  }
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function medianSorted(sorted: number[]): number {
  return percentileSorted(sorted, 50);
}

function sampleRunIndices(totalRuns: number, step = 100): number[] {
  const indices = new Set<number>();
  indices.add(Math.min(1, totalRuns));
  for (let i = step; i <= totalRuns; i += step) {
    indices.add(i);
  }
  indices.add(totalRuns);
  return Array.from(indices).sort((a, b) => a - b);
}

function buildCoinInGrid(points: number, maxCoinIn: number): number[] {
  if (points <= 1) {
    return [0, maxCoinIn];
  }
  const grid: number[] = [];
  const step = maxCoinIn / (points - 1);
  for (let i = 0; i < points; i += 1) {
    grid.push(Number((i * step).toFixed(6)));
  }
  return grid;
}

function downsampleTrajectory(
  coinIn: number[],
  net: number[],
  grid: number[]
): number[] {
  const result: number[] = new Array(grid.length).fill(0);
  let index = 0;

  for (let i = 0; i < grid.length; i += 1) {
    const x = grid[i];
    while (index < coinIn.length - 1 && coinIn[index + 1] < x) {
      index += 1;
    }

    if (x <= coinIn[0]) {
      result[i] = net[0];
      continue;
    }

    if (index >= coinIn.length - 1) {
      result[i] = net[net.length - 1];
      continue;
    }

    const x0 = coinIn[index];
    const x1 = coinIn[index + 1];
    const y0 = net[index];
    const y1 = net[index + 1];

    if (x1 === x0) {
      result[i] = y1;
      continue;
    }

    const t = (x - x0) / (x1 - x0);
    result[i] = y0 + t * (y1 - y0);
  }

  return result;
}

function createRng(seed?: string | null): () => number {
  if (seed === undefined || seed === null || seed === '') {
    return () => Math.random();
  }
  const seedStr = String(seed);
  const seedFn = xmur3(seedStr);
  const initial = seedFn();
  return mulberry32(initial);
}

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function mulberry32(seed: number): () => number {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function randomNormal(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) {
    u = rng();
  }
  while (v === 0) {
    v = rng();
  }
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function gammaSample(k: number, rng: () => number): number {
  if (k < 1) {
    const u = rng();
    return gammaSample(1 + k, rng) * Math.pow(u, 1 / k);
  }

  const d = k - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  while (true) {
    const x = randomNormal(rng);
    let v = 1 + c * x;
    if (v <= 0) {
      continue;
    }
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * (x ** 4)) {
      return d * v;
    }
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
      return d * v;
    }
  }
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
