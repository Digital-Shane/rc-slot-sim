import { Volatility } from './types';

export type Outcome = {
  m_base: number;
  p: number;
};

export type TierTemplate = {
  outcomes: Outcome[];
  max_multiplier_allowed: number;
};

export type CalibratedDistribution = {
  multipliers: number[];
  cdf: number[];
  mean: number;
};

type BucketConfig = {
  bucket_count: number;
  zero_probability: number;
  min_multiplier: number;
  max_multiplier: number;
  log_mu: number;
  log_sigma: number;
  tail_weight: number;
  tail_alpha: number;
};

const BUCKET_COUNT = 80;

function buildBucketedOutcomes(config: BucketConfig): Outcome[] {
  const {
    bucket_count,
    zero_probability,
    min_multiplier,
    max_multiplier,
    log_mu,
    log_sigma,
    tail_weight,
    tail_alpha,
  } = config;

  const logMin = Math.log(min_multiplier);
  const logMax = Math.log(max_multiplier);
  const step = (logMax - logMin) / bucket_count;
  const weights: number[] = [];
  const multipliers: number[] = [];

  for (let i = 0; i < bucket_count; i += 1) {
    const logMid = logMin + step * (i + 0.5);
    const multiplier = Math.exp(logMid);
    const logNormal = Math.exp(-((logMid - log_mu) ** 2) / (2 * log_sigma ** 2));
    const tail = tail_weight * Math.pow(multiplier, -tail_alpha);
    const weight = logNormal + tail;
    weights.push(weight);
    multipliers.push(multiplier);
  }

  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  const outcomes: Outcome[] = [{ m_base: 0, p: zero_probability }];
  if (totalWeight <= 0) {
    return outcomes;
  }

  const scale = (1 - zero_probability) / totalWeight;
  for (let i = 0; i < weights.length; i += 1) {
    outcomes.push({
      m_base: multipliers[i],
      p: weights[i] * scale,
    });
  }
  return outcomes;
}

function buildBucketedTemplate(config: BucketConfig): TierTemplate {
  return {
    outcomes: buildBucketedOutcomes(config),
    max_multiplier_allowed: config.max_multiplier,
  };
}

export const VOLATILITY_TEMPLATES: Record<Volatility, TierTemplate> = {
  LOW: buildBucketedTemplate({
    bucket_count: BUCKET_COUNT,
    zero_probability: 0.55,
    min_multiplier: 0.1,
    max_multiplier: 1000,
    log_mu: Math.log(0.6),
    log_sigma: 0.55,
    tail_weight: 0.02,
    tail_alpha: 3.3,
  }),
  MEDIUM: buildBucketedTemplate({
    bucket_count: BUCKET_COUNT,
    zero_probability: 0.7,
    min_multiplier: 0.1,
    max_multiplier: 5000,
    log_mu: Math.log(0.8),
    log_sigma: 0.75,
    tail_weight: 0.06,
    tail_alpha: 2.7,
  }),
  HIGH: buildBucketedTemplate({
    bucket_count: BUCKET_COUNT,
    zero_probability: 0.88,
    min_multiplier: 0.1,
    max_multiplier: 20000,
    log_mu: Math.log(1.0),
    log_sigma: 0.95,
    tail_weight: 0.12,
    tail_alpha: 2.2,
  }),
};

export function normalizeRtp(rtp: number): number {
  return rtp > 1 ? rtp / 100 : rtp;
}

export function buildCalibratedDistribution(
  volatility: Volatility,
  rtpMean: number
): CalibratedDistribution {
  const template = VOLATILITY_TEMPLATES[volatility];
  const normalized = normalizeOutcomes(template.outcomes);
  const muBase = normalized.reduce((sum, outcome) => sum + outcome.p * outcome.m_base, 0);
  if (muBase <= 0) {
    const cdf = buildCdf(normalized.map((outcome) => outcome.p));
    return { multipliers: normalized.map(() => 0), cdf, mean: 0 };
  }

  const k = rtpMean / muBase;
  const scaled = normalized.map((outcome) => ({
    p: outcome.p,
    m: outcome.m_base * k,
  }));

  const maxScaled = Math.max(...scaled.map((outcome) => outcome.m));
  const calibrated = maxScaled > template.max_multiplier_allowed
    ? capAwareCalibration(scaled, rtpMean, template.max_multiplier_allowed)
    : scaled;

  const multipliers = calibrated.map((outcome) => outcome.m);
  const cdf = buildCdf(calibrated.map((outcome) => outcome.p));
  return { multipliers, cdf, mean: meanMultiplier(calibrated) };
}

export function sampleMultiplier(
  distribution: CalibratedDistribution,
  rng: () => number
): number {
  const u = rng();
  const { cdf, multipliers } = distribution;
  for (let i = 0; i < cdf.length; i += 1) {
    if (u <= cdf[i]) {
      return multipliers[i];
    }
  }
  return multipliers[multipliers.length - 1] ?? 0;
}

export function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}

export function meanMultiplier(outcomes: Array<{ p: number; m: number }>): number {
  return outcomes.reduce((sum, outcome) => sum + outcome.p * outcome.m, 0);
}

function capAwareCalibration(
  outcomes: Array<{ p: number; m: number }>,
  rtpMean: number,
  maxAllowed: number
): Array<{ p: number; m: number }> {
  const calibrated = outcomes.map((outcome) => ({
    p: outcome.p,
    m: Math.min(outcome.m, maxAllowed),
  }));

  let currentMean = meanMultiplier(calibrated);
  let delta = rtpMean - currentMean;
  if (delta <= 0) {
    return calibrated;
  }

  const epsilon = 1e-10;
  const adjustable = calibrated.map((outcome) => outcome.m > 0 && outcome.m < maxAllowed - epsilon);
  let guard = 0;

  while (delta > epsilon && guard < 20) {
    let sumMid = 0;
    for (let i = 0; i < calibrated.length; i += 1) {
      if (adjustable[i]) {
        sumMid += calibrated[i].p * calibrated[i].m;
      }
    }

    if (sumMid <= 0) {
      break;
    }

    const factor = 1 + delta / sumMid;
    let anyCapped = false;

    for (let i = 0; i < calibrated.length; i += 1) {
      if (!adjustable[i]) {
        continue;
      }
      const next = calibrated[i].m * factor;
      if (next >= maxAllowed) {
        calibrated[i].m = maxAllowed;
        adjustable[i] = false;
        anyCapped = true;
      } else {
        calibrated[i].m = next;
      }
    }

    currentMean = meanMultiplier(calibrated);
    delta = rtpMean - currentMean;
    guard += 1;

    if (!anyCapped) {
      break;
    }
  }

  return calibrated;
}

function normalizeOutcomes(outcomes: Outcome[]): Outcome[] {
  const total = outcomes.reduce((sum, outcome) => sum + outcome.p, 0);
  if (total === 0) {
    return outcomes.map((outcome) => ({ ...outcome }));
  }
  return outcomes.map((outcome) => ({
    ...outcome,
    p: outcome.p / total,
  }));
}

function buildCdf(probabilities: number[]): number[] {
  const cdf: number[] = [];
  let total = 0;
  for (const p of probabilities) {
    total += p;
    cdf.push(total);
  }
  if (cdf.length > 0) {
    cdf[cdf.length - 1] = 1;
  }
  return cdf;
}
