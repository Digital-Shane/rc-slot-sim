Volatility controls *how* payouts show up, while return-to-player RTP controls *how much* you get back on average. The simulator keeps those two ideas separate. Rewards scale linearly up with bets. A $2 spin always pays exactly twice a $1 spin for the same sampled outcome.

### Volatility Implementation

Think of each volatility tier as a payout distribution built from 80 reward buckets. At a glance

| Tier   | Hit rate | Max win cap | Shape |
|--------|----------|-------------|-------|
| Low    | ~45%     | 1,000x      | tight cluster of small wins, short tail |
| Medium | ~30%     | 5,000x      | wider spread, occasional big spikes     |
| High.  | ~12%     | 20,000x     | long tail, big wins possible            |


VOLATILITY_GRAPHS

### How spin outcome is calculated

Each spin picks one outcome from the tier s 80-bucket distribution, then adjusts the whole distribution so the math lines
up with your return to player (RTP) setting. First the tier probabilities are normalized to add up to one, and the base
average payout is computed (`mu_base = sum(p_i * m_base_i)` where:

* `i` is the outcome index in the buckets
* `p_i`is the probability of outcome `i`
* `m_base_i` is the base multiplier for outcome `i`
* `mu_base` is the base mean multiplier

Then RTP is treated as the target average multiplier (for example, `92% RTP -> 0.92`), and every base multiplier is scaled by a
factor k `k = RTP_mean / mu_base`, `m_i = m_base_i * k`, where `m_i` is the scaled multiplier for outcome `i`) so the overall
average matches the RTP while keeping the same “shape” of wins. If that scaling would push the biggest multiplier past the tier’s
cap, the top values are clipped and the remaining non-capped multipliers are proportionally scaled up to try to hit the target
mean (while respecting the cap). A cumulative distribution is built from the probabilities (CDF, cumulative distribution function),
a uniform random number is drawn (`u in [0, 1)`), and the first bucket where `u <= CDF_i` is the chosen outcome. Finally,
payout is just bet times multiplier, rounded to cents (`payout = bet * multiplier`), and partial final spins
still use the same distribution.
