import { Volatility } from './types';
import {
  VOLATILITY_TEMPLATES,
  buildCalibratedDistribution,
  normalizeRtp,
  sampleMultiplier,
} from './volatilityModel';
import { createRng } from './rng';

export type VolatilityTuningInput = {
  volatility: Volatility;
  rtp: number;
  spins?: number;
  seed?: string | null;
  bet?: number;
};

export type VolatilityTuningStats = {
  volatility: Volatility;
  spins: number;
  bet: number;
  rtp_target: number;
  rtp_observed: number;
  mean_multiplier: number;
  stddev_multiplier: number;
  hit_rate: number;
  tail_rates: {
    gte_2x: number;
    gte_5x: number;
    gte_10x: number;
    gte_20x: number;
    gte_100x: number;
  };
  max_multiplier: number;
  mean_payout: number;
  base_mean: number;
  scale_factor: number;
};

export function runVolatilityTuning(input: VolatilityTuningInput): VolatilityTuningStats {
  const spins = Math.max(1, Math.floor(input.spins ?? 1_000_000));
  const bet = Math.max(0.01, input.bet ?? 1);
  const rtpTarget = normalizeRtp(input.rtp);
  const distribution = buildCalibratedDistribution(input.volatility, rtpTarget);
  const rng = createRng(input.seed);

  let mean = 0;
  let m2 = 0;
  let hits = 0;
  let maxMultiplier = 0;
  let gte2 = 0;
  let gte5 = 0;
  let gte10 = 0;
  let gte20 = 0;
  let gte100 = 0;

  for (let i = 1; i <= spins; i += 1) {
    const multiplier = sampleMultiplier(distribution, rng);
    if (multiplier > 0) {
      hits += 1;
    }
    if (multiplier >= 2) {
      gte2 += 1;
    }
    if (multiplier >= 5) {
      gte5 += 1;
    }
    if (multiplier >= 10) {
      gte10 += 1;
    }
    if (multiplier >= 20) {
      gte20 += 1;
    }
    if (multiplier >= 100) {
      gte100 += 1;
    }
    if (multiplier > maxMultiplier) {
      maxMultiplier = multiplier;
    }

    const delta = multiplier - mean;
    mean += delta / i;
    m2 += delta * (multiplier - mean);
  }

  const variance = m2 / spins;
  const stddev = Math.sqrt(Math.max(0, variance));
  const baseStats = computeBaseStats(input.volatility);
  const scaleFactor = baseStats.mean > 0 ? rtpTarget / baseStats.mean : 0;

  return {
    volatility: input.volatility,
    spins,
    bet,
    rtp_target: rtpTarget,
    rtp_observed: mean,
    mean_multiplier: mean,
    stddev_multiplier: stddev,
    hit_rate: hits / spins,
    tail_rates: {
      gte_2x: gte2 / spins,
      gte_5x: gte5 / spins,
      gte_10x: gte10 / spins,
      gte_20x: gte20 / spins,
      gte_100x: gte100 / spins,
    },
    max_multiplier: maxMultiplier,
    mean_payout: mean * bet,
    base_mean: baseStats.mean,
    scale_factor: scaleFactor,
  };
}

export function runVolatilitySweep(
  rtp: number,
  spins = 1_000_000,
  seed?: string | null,
  bet = 1
): VolatilityTuningStats[] {
  return (['LOW', 'MEDIUM', 'HIGH'] as Volatility[]).map((volatility) =>
    runVolatilityTuning({ volatility, rtp, spins, seed, bet })
  );
}

export function formatVolatilityReport(stats: VolatilityTuningStats): string {
  const pct = (value: number) => `${(value * 100).toFixed(3)}%`;
  return [
    `Volatility: ${stats.volatility}`,
    `Spins: ${stats.spins.toLocaleString()}`,
    `RTP target: ${(stats.rtp_target * 100).toFixed(2)}%`,
    `RTP observed: ${(stats.rtp_observed * 100).toFixed(3)}%`,
    `Mean multiplier: ${stats.mean_multiplier.toFixed(4)}`,
    `Stddev multiplier: ${stats.stddev_multiplier.toFixed(4)}`,
    `Hit rate: ${pct(stats.hit_rate)}`,
    `Tail >=2x: ${pct(stats.tail_rates.gte_2x)}`,
    `Tail >=5x: ${pct(stats.tail_rates.gte_5x)}`,
    `Tail >=10x: ${pct(stats.tail_rates.gte_10x)}`,
    `Tail >=20x: ${pct(stats.tail_rates.gte_20x)}`,
    `Tail >=100x: ${pct(stats.tail_rates.gte_100x)}`,
    `Max multiplier: ${stats.max_multiplier.toFixed(2)}`,
    `Base mean: ${stats.base_mean.toFixed(4)}`,
    `Scale factor: ${stats.scale_factor.toFixed(4)}`,
  ].join('\n');
}

function computeBaseStats(volatility: Volatility): { mean: number } {
  const template = VOLATILITY_TEMPLATES[volatility];
  const total = template.outcomes.reduce((sum, outcome) => sum + outcome.p, 0);
  if (total === 0) {
    return { mean: 0 };
  }
  const mean = template.outcomes.reduce(
    (sum, outcome) => sum + (outcome.p / total) * outcome.m_base,
    0
  );
  return { mean };
}
