export type Volatility = 'LOW' | 'MEDIUM' | 'HIGH';

export interface SimulationInputs {
  rtp_percent: number;
  volatility: Volatility;
  bet_size: number;
  deposit_amount: number;
  target_points: number;
  points_per_dollar: number;
  coin_in_target: number;
  runs: number;
  seed: string | null;
  spins_per_sec: number;
  spins_per_min?: number;
  traj_points: number;
}

export interface RunMetrics {
  run_index: number;
  spins: number;
  total_coin_in: number;
  total_payout: number;
  final_net: number;
  max_drawdown: number;
  time_estimate_minutes: number;
  total_cash_in: number;
  ending_balance: number;
}

export interface AggregateMetrics {
  final_net: {
    mean: number;
    median: number;
    stddev: number;
    min: number;
    max: number;
    p01: number;
    p05: number;
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
    p95: number;
    p99: number;
    p_profit: number;
    p_loss_gt: Record<string, number>;
    cvar_5: number;
    cvar_1: number;
  };
  max_drawdown: {
    mean: number;
    median: number;
    p95: number;
  };
  cash_in: {
    mean: number;
    median: number;
  };
  ending_balance: {
    mean: number;
    median: number;
  };
  selected_runs: {
    best_run_index: number;
    worst_run_index: number;
    sample_run_indices: number[];
  };
}

export interface SimulationResult {
  schema_version: '1.0';
  model_version: 'slot-volatility-v2';
  meta: {
    id: string;
    name: string;
    created_at: string;
    app_version: string;
  };
  inputs: SimulationInputs;
  aggregate: AggregateMetrics;
  runs: RunMetrics[];
  trajectories: {
    x_coin_in: number[];
    samples: number[][];
    sample_run_indices: number[];
    best: number[];
    worst: number[];
    typical_median: number[];
  };
}
