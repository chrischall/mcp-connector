# @chrischall/mcp-connector

The generic **OAuth + `McpAgent` harness** every hosted Cloudflare Worker "remote
connector" in the fleet is built on. It is auth-agnostic: it knows nothing about any
particular service beyond what a consumer's `ConnectorAuth` descriptor tells it. Four
source files, ~300 lines total (`src/index.ts`, `login.ts`, `login-page.ts`, `types.ts`).

This is **shared infrastructure**, not a product. Read the blast-radius section before
changing anything in `src/`.

## Blast radius (read this first)

Nine repos consume it, all as a **devDependency** of their Worker build:

`artsonia-mcp` · `gogcli-mcp` · `ofw-mcp` · `setlist-mcp` · `sixflags-mcp` ·
`splitwise-mcp` · `untappd-mcp` · `vibo-mcp` · `zola-mcp`

**Every one of them pins `"@chrischall/mcp-connector": "^0.1.0"`** (verified across all
nine `package.json` files, 2026-07-19). That range matters in both directions:

- A **0.1.x** release (patch *or* minor — `release-please` is configured with
  `bump-minor-pre-major` + `bump-patch-for-minor-pre-major`, so pre-1.0 `feat:` also
  lands as a patch) is picked up by all nine on their next lockfile refresh, with no
  human reviewing it per-repo. There is no staged rollout. Treat a breaking change to
  `createConnector`, `ConnectorAuth`, or the mounted route set as a change you are
  shipping simultaneously to nine live Workers.
- A **0.2.0** would be picked up by *none* of them (caret on `0.1.x` excludes `0.2.0`),
  so it silently strands the fleet on the old harness until nine PRs bump the range.

Neither outcome is what you want by accident. If a change is genuinely breaking, bump
to `0.2.0` **and** open the nine follow-up bumps; if it is compatible, ship it as 0.1.x
knowing it auto-propagates.

**The tests in this repo do not protect the consumers.** `tests/` covers `login.ts` and
`login-page.ts` only — `createConnector` itself (the `OAuthProvider` wiring, the
`McpAgent` subclass, the route mounting) has **no test here**, and this repo has no
Workers-runtime vitest pool. The only real integration coverage lives in the consumer
repos' `vitest.workers.config.ts` suites. So a harness change can go green on
`npm run typecheck && npm run build && npm test` here and still break all nine at
deploy. Before releasing anything touching `src/index.ts`, build at least one consumer
Worker against the local package (`npm pack` here, install the tarball there, then that
repo's `npm run worker:test`).

## Commands

```bash
npm run typecheck   # tsc --noEmit
npm run build       # tsc -p tsconfig.json → dist/  (also the `prepare` script)
npm test            # vitest run — tests/login.test.ts, tests/login-page.test.ts
```

CI (`.github/workflows/ci.yml`) runs typecheck → build → test on Node 22. `dist/` is
gitignored and produced by `prepare`, so a git-URL install still works.

## What it serves

`createConnector()` returns `{ Agent, handler }`. The `handler` is an `OAuthProvider`
mounting exactly five paths:

| Path | Served by | Purpose |
| --- | --- | --- |
| `/mcp` | `ConnectorAgent.serve('/mcp')` | Streamable-HTTP MCP transport — what claude.ai uses |
| `/sse` | `ConnectorAgent.serveSSE('/sse')` | Legacy SSE MCP transport, kept for older clients |
| `/authorize` | `handleAuthorize` (our `defaultHandler`) | GET renders the login page; POST verifies creds and completes the OAuth grant |
| `/token` | `OAuthProvider` | Token exchange |
| `/register` | `OAuthProvider` | RFC 7591 dynamic client registration (claude.ai self-registers here) |

Anything else returns a bare `404 Not found` — there is deliberately no `/` or health
route. If you add one, add it to `defaultHandler.fetch` in `src/index.ts`, *not* to the
`OAuthProvider` config.

## The `ConnectorAuth` contract

A consumer implements this (`src/types.ts`) and passes it as `opts.auth`:

```ts
{
  service: string          // login-page branding, e.g. "Untappd"
  fields: LoginField[]     // { name, label, type?: 'text' | 'password' }
  login(fields, env): Promise<Props>   // verify creds; THROW on bad creds
  privacyNote?: string
  accent?: string          // #rgb / #rrggbb only
}
```

Three constraints that are easy to get wrong:

1. **The FIRST field's submitted value becomes the OAuth `userId`.**
   `handleAuthorize` calls `completeAuthorization({ userId: fields[auth.fields[0].name], … })`.
   So field order is load-bearing identity, not cosmetics: put the stable account
   identifier (username, email) first, never a password or an API key that rotates.
   Reordering `fields` in a consumer re-keys every stored grant.
2. **`login` signals failure by throwing.** The thrown message is rendered verbatim
   (HTML-escaped) into the login page, so it is user-facing — write it as a fix
   instruction, and never let a credential or upstream response body into it.
3. **The failure response is HTTP 200**, not 4xx — it re-renders the form so the browser
   shows it rather than an error page. Don't "fix" that status.

`login`'s returned `Props` are stored encrypted in `OAUTH_KV` by the OAuth provider and
handed back to `buildClient(props, env)` on every subsequent MCP request.

## How a consumer wires it

`src/worker.ts` in the consuming repo:

```ts
const { Agent, handler } = createConnector<Props, Client>({
  name, version, auth, buildClient: (props, env) => new Client(...), tools: [...registrars],
});
export { Agent as FooMcpAgent };   // ← the Durable Object class
export default handler;
```

and `wrangler.jsonc` needs both bindings — `MCP_OBJECT` (Durable Object → the exported
Agent class name, with a `new_sqlite_classes` migration) and `OAUTH_KV` (KV namespace,
where the provider stores grants/props). The `tools` array is the *same* registrars the
repo's stdio entry point uses; that shared-registrar shape is the whole point of the
package.

Peer deps (`@modelcontextprotocol/sdk`, `agents`, `@cloudflare/workers-oauth-provider`)
must be provided by the consumer so the Worker bundles exactly one copy of each. Two
copies of `agents` means two `McpAgent` classes and a Durable Object that doesn't
resolve.

## `@cloudflare/workers-oauth-provider` — pinned old, and what that costs

The peer range is `^0.0.11`. On a `0.0.x` version caret is effectively an **exact pin**
(`>=0.0.11 <0.0.12`), so this is 0.0.11 and nothing else. **Latest on npm is 0.8.2**
(checked 2026-07-19) — the pin is many majors behind.

The concrete consequence, verified by unpacking both versions on 2026-07-19:

- **0.0.11** serves only `/.well-known/oauth-authorization-server` (legacy discovery).
- **0.8.2** additionally serves `/.well-known/oauth-protected-resource` and
  `/.well-known/oauth-protected-resource/mcp` — the **RFC 9728** protected-resource
  metadata that current MCP authorization drafts expect a resource server to publish.

**This is a forward-compatibility risk, not a current outage.** Verified live against
the two deployed connectors on 2026-07-19:

| | `/.well-known/oauth-authorization-server` | `/.well-known/oauth-protected-resource` |
| --- | --- | --- |
| `connector.untappd.nullnet.app` | 200 | 404 |
| `connector.setlist.nullnet.app` | 200 | 404 |

Both connect and work fine on claude.ai today via the legacy discovery path. The
exposure is that a client which drops the legacy fallback and requires RFC 9728 would
fail to discover *all nine* connectors at once. If you upgrade the pin, that is a
cross-fleet change — see the blast-radius rules above, and re-probe both hosts after.

**Known drift to be aware of:** `untappd-mcp` has moved its own
`@cloudflare/workers-oauth-provider` devDependency to `^0.8.1` (its lockfile resolves
0.8.1) while every other consumer — and this package's peer range — still says
`^0.0.11`. Its `node_modules` was still on 0.0.11 when checked, so what its last deploy
actually bundled is **UNVERIFIED**. Don't treat untappd as evidence that 0.8.x works
with this harness until someone confirms the deployed bundle.

## Gotchas in the source

- **The `Agent` cast is deliberate.** `createConnector` returns
  `ConnectorAgent as unknown as typeof McpAgent`. `ConnectorAgent` fixes `Props` to the
  call's type parameter, but `typeof McpAgent` is universally quantified over `Props` in
  its constructor signature, so no concrete subclass can satisfy it generically. The
  comment in `src/index.ts` says as much — don't try to "clean up" that cast, and don't
  widen it into the `apiHandlers` casts, which paper over a different mismatch.
- **The pending OAuth request round-trips through the form as base64 JSON** in a hidden
  `oauthReq` input (`btoa(JSON.stringify(...))` out, `JSON.parse(atob(...))` back). It
  is the only state carried across the GET→POST hop; there is no server-side session.
  `parseLoginForm` strips `oauthReq` out of `values`, so a consumer must never name a
  login field `oauthReq`.
- **`accent` is validated, not escaped.** `safeAccent` accepts only `#rgb`/`#rrggbb` and
  falls back to `#4f46e5` otherwise, because the value is interpolated raw into a
  `<style>` block where HTML escaping would not help. Keep that allowlist if you extend
  color support.
- **`inkOn` uses 0.179, not 0.5**, as the light/dark text crossover — it's the WCAG
  relative-luminance crossover, so mid-range accents (a saturated blue at L≈0.3)
  correctly get dark ink. The naive midpoint gets this visibly wrong.
- **The login page must stay fully self-contained** — inline CSS, inline SVG, no
  external assets, no scripts. It renders under a strict Worker CSP.
- `env` is typed `any` in `ConnectorAuth.login` and `buildClient` because the harness
  can't know a consumer's bindings; the consumer types it at its own boundary.

<!-- pr-workflow:v3 -->
## Pull requests & release notes

Fleet policy — Conventional-Commit PR titles, labels, the auto-review /
auto-merge ladder, auto-review follow-up issues, PR timing, and release PRs —
lives in `~/.claude/CLAUDE.md`. Don't restate it here; the copies drifted.

Shared technical conventions (publishing, bundling, versioning guards,
write-verification, transport archetypes, testing traps) live in
[`chrischall/workflows`](https://github.com/chrischall/workflows):
`docs/fleet-conventions.md`, plus `README.md` for the CI pipeline contract.

Repo-specific: because this package is pre-1.0 and `release-please` is configured with
`bump-minor-pre-major` + `bump-patch-for-minor-pre-major`, the bump ladder is shifted
down one notch — `feat:` ships as a **patch** (0.1.x) that all nine consumers auto-adopt
on their next install, and a breaking change (`feat!:` / `BREAKING CHANGE`) ships as
**0.2.0**, which their `^0.1.0` ranges exclude, so it reaches nobody until nine bump PRs
land. Pick the prefix with that in mind: `feat:` means "this goes live in nine Workers",
`feat!:` means "and now I owe nine PRs".
