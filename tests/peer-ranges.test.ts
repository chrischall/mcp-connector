import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { satisfies, minVersion } from 'semver';

// The harness declares its Cloudflare/MCP dependencies as PEERS so each consumer
// Worker owns the single installed copy. That makes the peer ranges a public API
// contract, and it has already broken the fleet once: `agents` shipped 0.19.0,
// dependabot bumped a consumer to it, and npm refused to install because this
// package still claimed `agents@^0.17.3` (artsonia-mcp#72, 2026-07-24).
//
// The version we develop and test against is whatever `devDependencies` pins.
// If that drifts outside the range we advertise, we are testing a version we
// tell consumers we do not support — or advertising one we never exercise.
const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as {
  peerDependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

describe('peer dependency ranges', () => {
  it('declares every peer as a devDependency so CI actually exercises it', () => {
    const missing = Object.keys(pkg.peerDependencies).filter(
      (name) => !pkg.devDependencies[name],
    );
    expect(missing).toEqual([]);
  });

  for (const [name, peerRange] of Object.entries(pkg.peerDependencies)) {
    it(`accepts the ${name} version we build against`, () => {
      const devRange = pkg.devDependencies[name];
      const devFloor = minVersion(devRange);
      expect(devFloor, `unparseable devDependency range: ${devRange}`).not.toBeNull();
      expect(
        satisfies(devFloor!.version, peerRange),
        `devDependencies.${name} (${devRange}) is outside peerDependencies.${name} (${peerRange})`,
      ).toBe(true);
    });
  }
});
