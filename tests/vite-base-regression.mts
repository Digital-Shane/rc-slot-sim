import assert from 'node:assert/strict';
import config from '../vite.config';

const keys = ['VITE_BASE', 'BASE_URL', 'GITHUB_REPOSITORY'] as const;
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
const cases = [
  { name: 'custom-domain production', mode: 'production', env: {}, expected: '/' },
  { name: 'GitHub Actions custom domain', mode: 'production', env: { GITHUB_REPOSITORY: 'Digital-Shane/rc-slot-sim' }, expected: '/' },
  { name: 'explicit root', mode: 'production', env: { VITE_BASE: '/', GITHUB_REPOSITORY: 'Digital-Shane/rc-slot-sim' }, expected: '/' },
  { name: 'explicit project subdirectory', mode: 'production', env: { VITE_BASE: '/rc-slot-sim/' }, expected: '/rc-slot-sim/' },
  { name: 'fallback override', mode: 'production', env: { BASE_URL: '/alternate/' }, expected: '/alternate/' },
  { name: 'override precedence', mode: 'production', env: { VITE_BASE: '/preferred/', BASE_URL: '/alternate/' }, expected: '/preferred/' },
  { name: 'development remains at root', mode: 'development', env: { VITE_BASE: '/rc-slot-sim/', GITHUB_REPOSITORY: 'Digital-Shane/rc-slot-sim' }, expected: '/' },
];
try {
  for (const test of cases) {
    for (const key of keys) delete process.env[key];
    Object.assign(process.env, test.env);
    const resolved = typeof config === 'function'
      ? await config({ command: 'build', mode: test.mode, isSsrBuild: false, isPreview: false })
      : await config;
    assert.equal(resolved.base, test.expected, test.name);
    assert.ok(resolved.plugins?.length, 'React plugin must remain configured');
    console.log(`PASS ${test.name}: ${resolved.base}`);
  }
} finally {
  for (const key of keys) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
}
