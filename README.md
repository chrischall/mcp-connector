# @chrischall/mcp-connector

Reusable, **auth-agnostic** Cloudflare Worker harness that turns any MCP server's
tool registrars into a hosted **remote connector** for claude.ai — OAuth login +
streamable-HTTP/SSE via the `agents` SDK `McpAgent` and
`@cloudflare/workers-oauth-provider`.

It is the shared harness behind the `*-mcp` connector fleet (ofw, untappd, …). Each
MCP keeps its own Worker, hostname, KV, and Durable Objects; this package supplies
the identical OAuth + transport plumbing so none of it is copy-pasted per repo.

> **AI-maintained.** This package is developed and maintained by Claude.

## Install

```sh
npm i @chrischall/mcp-connector
```

Peer dependencies (provide these in the consuming Worker so a single copy is
bundled): `@modelcontextprotocol/sdk`, `agents`, `@cloudflare/workers-oauth-provider`.

## Usage

In your Worker entry point (`src/worker.ts`):

```ts
import { createConnector, type ConnectorAuth } from '@chrischall/mcp-connector';
import { MyClient } from './client.js';
import { registerFooTools } from './tools/foo.js';

interface Props { apiKey: string; [k: string]: unknown }

const myAuth: ConnectorAuth<Props> = {
  service: 'MyService',
  accent: '#3366ff',
  privacyNote: 'Your key is stored encrypted and used only to call MyService on your behalf.',
  fields: [{ name: 'apiKey', label: 'MyService API key', type: 'password' }],
  async login(fields, env) {
    // verify the credentials (throw on bad creds → shown on the login page)
    await MyClient.verify(fields.apiKey);
    return { apiKey: fields.apiKey };
  },
};

const { Agent, handler } = createConnector<Props, MyClient>({
  name: 'my-mcp',
  version: '1.0.0',
  auth: myAuth,
  buildClient: (props, env) => new MyClient({ apiKey: props.apiKey }),
  tools: [registerFooTools],
});

export { Agent as MyMcpAgent };
export default handler;
```

`createConnector` mounts `/mcp` (streamable HTTP), `/sse`, `/authorize`, `/token`,
and `/register` (dynamic client registration), and renders a self-contained,
theme-aware login page from the `ConnectorAuth` descriptor.

## API

- `createConnector<Props, Client>(opts): { Agent, handler }` — `opts`:
  `{ name, version, auth, buildClient(props, env), tools: Array<(server, client) => void> }`.
  Bind `Agent` to a Durable Object namespace (`MCP_OBJECT`) in `wrangler.jsonc` and
  `export default handler`.
- `ConnectorAuth<Props>` — `{ service, fields: LoginField[], login(fields, env): Promise<Props>, privacyNote?, accent? }`.
- `LoginField` — `{ name, label, type?: 'text' | 'password' }`.

## License

MIT
