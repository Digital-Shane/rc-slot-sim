import { runVolatilitySweep, runVolatilityTuning, formatVolatilityReport } from '../src/sim/volatilityTuning';
import { Volatility } from '../src/sim/types';

type ParsedArgs = {
  tier: Volatility | 'ALL';
  rtp: number;
  spins: number;
  seed?: string;
  bet: number;
};

const DEFAULTS: ParsedArgs = {
  tier: 'ALL',
  rtp: 88,
  spins: 1_000_000,
  bet: 1,
};

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

const config = {
  ...DEFAULTS,
  ...args.values,
};

if (!Number.isFinite(config.rtp) || config.rtp <= 0) {
  throw new Error('Invalid --rtp. Provide a positive number, e.g. 88 or 0.88.');
}

if (!Number.isFinite(config.spins) || config.spins <= 0) {
  throw new Error('Invalid --spins. Provide a positive integer.');
}

if (!Number.isFinite(config.bet) || config.bet <= 0) {
  throw new Error('Invalid --bet. Provide a positive number.');
}

if (config.tier === 'ALL') {
  const results = runVolatilitySweep(config.rtp, config.spins, config.seed, config.bet);
  for (const result of results) {
    process.stdout.write(`${formatVolatilityReport(result)}\n\n`);
  }
} else {
  const result = runVolatilityTuning({
    volatility: config.tier,
    rtp: config.rtp,
    spins: config.spins,
    seed: config.seed ?? null,
    bet: config.bet,
  });
  process.stdout.write(`${formatVolatilityReport(result)}\n`);
}

function parseArgs(argv: string[]): { help: boolean; values: Partial<ParsedArgs> } {
  const values: Partial<ParsedArgs> = {};
  let help = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }

    if (arg.startsWith('--tier')) {
      const value = readArgValue(arg, argv[i + 1]);
      i += value.consumed;
      const tier = value.value.toUpperCase();
      if (tier === 'ALL') {
        values.tier = 'ALL';
      } else if (tier === 'LOW' || tier === 'MEDIUM' || tier === 'HIGH') {
        values.tier = tier as Volatility;
      } else {
        throw new Error('Invalid --tier. Use LOW, MEDIUM, HIGH, or ALL.');
      }
      continue;
    }

    if (arg.startsWith('--rtp')) {
      const value = readArgValue(arg, argv[i + 1]);
      i += value.consumed;
      values.rtp = Number(value.value);
      continue;
    }

    if (arg.startsWith('--spins')) {
      const value = readArgValue(arg, argv[i + 1]);
      i += value.consumed;
      values.spins = Number(value.value);
      continue;
    }

    if (arg.startsWith('--seed')) {
      const value = readArgValue(arg, argv[i + 1]);
      i += value.consumed;
      values.seed = value.value;
      continue;
    }

    if (arg.startsWith('--bet')) {
      const value = readArgValue(arg, argv[i + 1]);
      i += value.consumed;
      values.bet = Number(value.value);
      continue;
    }
  }

  return { help, values };
}

function readArgValue(arg: string, next?: string): { value: string; consumed: number } {
  const parts = arg.split('=');
  if (parts.length > 1) {
    return { value: parts.slice(1).join('='), consumed: 0 };
  }
  if (!next) {
    throw new Error(`Missing value for ${arg}.`);
  }
  return { value: next, consumed: 1 };
}

function printHelp() {
  process.stdout.write(`
Volatility tuning runner

Usage:
  npm run tune:volatility -- --tier HIGH --rtp 88 --spins 5000000 --seed tune-1 --bet 1
  npm run tune:volatility -- --tier ALL --rtp 0.88 --spins 2000000

Options:
  --tier   LOW | MEDIUM | HIGH | ALL   (default: ALL)
  --rtp    RTP percent or fraction     (default: 88)
  --spins  Number of spins             (default: 1000000)
  --seed   Seed for reproducibility    (optional)
  --bet    Bet size in dollars         (default: 1)
`);
}
