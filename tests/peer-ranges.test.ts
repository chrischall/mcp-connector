import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { satisfies, minVersion, Range } from 'semver';

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

/**
 * The upper bound a range admits, as a comparable string (`<0.11.0`), or
 * `'unbounded'` when it has none.
 *
 * Returns null for a range whose OR'd branches disagree (`^1 || ^3`): there is
 * no single ceiling to compare, and silently picking one would be worse than
 * refusing.
 */
function upperBound(range: string): string | null {
  const bounds = new Set<string>();
  for (const comparators of new Range(range).set) {
    let found = 'unbounded';
    for (const c of comparators) {
      // The numeric core, NOT c.semver.version: expanding `^0.10.2` yields the
      // comparator `<0.11.0-0`, where the `-0` is semver's way of excluding
      // prereleases. An explicitly written `<0.11.0` carries no such marker, so
      // the two spell the same ceiling differently and a string compare says
      // they disagree when they do not.
      if (c.operator === '<' || c.operator === '<=') {
        found = `${c.operator}${c.semver.major}.${c.semver.minor}.${c.semver.patch}`;
      }
    }
    bounds.add(found);
  }
  return bounds.size === 1 ? [...bounds][0]! : null;
}

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

  // The check above catches a peer range NARROWER than what we build against —
  // the artsonia-mcp#72 shape, where consumers cannot install. It does NOT catch
  // the mirror image: a peer range WIDER than what we build against, which
  // advertises versions CI never runs.
  //
  // That gap shipped. #31 widened this package's workers-oauth-provider peer to
  // `<0.11.0` while devDependencies stayed at `^0.8.1`, so 0.9.x and 0.10.x were
  // public API and never once exercised. The guard passed the whole time, because
  // 0.8.1 does satisfy `>=0.8.1 <0.11.0` — building against the FLOOR of a freshly
  // widened range is exactly what it fails to notice.
  //
  // Comparing ceilings closes it: whatever the highest version we promise to
  // support is, that is the one CI has to resolve.
  for (const [name, peerRange] of Object.entries(pkg.peerDependencies)) {
    it(`builds against the highest ${name} version it advertises`, () => {
      const devRange = pkg.devDependencies[name]!;
      const peerCeiling = upperBound(peerRange);
      const devCeiling = upperBound(devRange);
      expect(peerCeiling, `peerDependencies.${name} (${peerRange}) has no single ceiling to compare`).not.toBeNull();
      expect(devCeiling, `devDependencies.${name} (${devRange}) has no single ceiling to compare`).not.toBeNull();
      expect(
        devCeiling,
        `devDependencies.${name} (${devRange}) stops at ${devCeiling}, but peerDependencies.${name} ` +
          `(${peerRange}) promises support up to ${peerCeiling}. Everything between is advertised and untested — ` +
          `raise the devDependency to the top of the range you advertise.`,
      ).toBe(peerCeiling);
    });
  }
});
