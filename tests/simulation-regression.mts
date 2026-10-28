import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Execute the actual, unchanged simulation algorithm through its worker message contract.
// Baselines were captured before the visual redesign. Exclude only nondeterministic metadata.
const fixtures = JSON.parse(readFileSync(new URL('./simulation-baseline.json', import.meta.url), 'utf8'));
let receive: (result: any) => void;
(globalThis as any).self = {};
(globalThis as any).postMessage = (message: any) => {
  if (message.type === 'done') receive(message.payload.result);
  if (message.type === 'error') throw Error(message.payload.message);
};
await import('../src/worker/simWorker.ts');
for (const fixture of fixtures) {
  const result = await new Promise<any>((resolve) => {
    receive = resolve;
    (globalThis as any).self.onmessage({ data: { type: 'simulate', payload: { inputs: fixture.inputs } } });
  });
  const { meta, ...stable } = result;
  assert.equal(createHash('sha256').update(JSON.stringify(stable)).digest('hex'), fixture.sha256,
    `${fixture.volatility}: simulation outputs must match the pre-redesign baseline`);
  assert.equal(result.runs.length, fixture.inputs.runs);
  assert.equal(result.trajectories.x_coin_in.at(-1), fixture.inputs.coin_in_target);
  console.log(`PASS ${fixture.volatility}: all runs, aggregates and trajectories match the original`);
}
