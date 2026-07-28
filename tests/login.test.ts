import { describe, it, expect, vi } from 'vitest';
import { handleAuthorize } from '../src/login.js';

const auth = {
  service: 'Untappd',
  fields: [{ name: 'username', label: 'Username' }, { name: 'password', label: 'Password', type: 'password' as const }],
  login: vi.fn(async (f: Record<string,string>) => ({ token: 'TOK', username: f.username })),
};

function fakeEnv() {
  return { OAUTH_PROVIDER: {
    parseAuthRequest: vi.fn(async () => ({ clientId: 'c', redirectUri: 'https://claude.ai/cb', scope: [], state: 's' })),
    completeAuthorization: vi.fn(async () => ({ redirectTo: 'https://claude.ai/cb?code=xyz' })),
  }};
}

it('POST /authorize verifies creds and completes authorization with props', async () => {
  const env = fakeEnv();
  const body = new URLSearchParams({ username: 'chris', password: 'pw', oauthReq: btoa(JSON.stringify({ clientId: 'c' })) });
  const req = new Request('https://x/authorize', { method: 'POST', body });
  const res = await handleAuthorize(req, env, auth);
  expect(auth.login).toHaveBeenCalledWith({ username: 'chris', password: 'pw' }, env);
  expect(env.OAUTH_PROVIDER.completeAuthorization).toHaveBeenCalledWith(
    expect.objectContaining({ props: { token: 'TOK', username: 'chris' }, userId: 'chris' }),
  );
  expect(res.status).toBe(302);
  expect(res.headers.get('location')).toContain('code=xyz');
});

describe('zero-auth (public) connectors', () => {
  const publicAuth = {
    service: 'Charlotte On The Cheap',
    fields: [],
    login: vi.fn(async () => ({ site: 'https://www.charlotteonthecheap.com' })),
  };

  it('completes authorization with no fields instead of throwing on fields[0]', async () => {
    const env = fakeEnv();
    const body = new URLSearchParams({ oauthReq: btoa(JSON.stringify({ clientId: 'c' })) });
    const req = new Request('https://x/authorize', { method: 'POST', body });
    const res = await handleAuthorize(req, env, publicAuth);
    expect(publicAuth.login).toHaveBeenCalledWith({}, env);
    expect(env.OAUTH_PROVIDER.completeAuthorization).toHaveBeenCalledWith(
      expect.objectContaining({ props: { site: 'https://www.charlotteonthecheap.com' }, userId: 'public' }),
    );
    expect(res.status).toBe(302);
  });

  it('honors an explicit userId override', async () => {
    const env = fakeEnv();
    const body = new URLSearchParams({ oauthReq: btoa(JSON.stringify({ clientId: 'c' })) });
    const req = new Request('https://x/authorize', { method: 'POST', body });
    await handleAuthorize(req, env, { ...publicAuth, userId: 'cotc-reader' });
    expect(env.OAUTH_PROVIDER.completeAuthorization).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'cotc-reader' }),
    );
  });

  it('still surfaces a login failure as a re-rendered page, not a crash', async () => {
    const env = fakeEnv();
    const failing = { ...publicAuth, login: vi.fn(async () => { throw new Error('site unreachable'); }) };
    const body = new URLSearchParams({ oauthReq: btoa(JSON.stringify({ clientId: 'c' })) });
    const req = new Request('https://x/authorize', { method: 'POST', body });
    const res = await handleAuthorize(req, env, failing);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('site unreachable');
    expect(env.OAUTH_PROVIDER.completeAuthorization).not.toHaveBeenCalled();
  });
});

it('POST with bad creds re-renders the form with an error (no completeAuthorization)', async () => {
  const env = fakeEnv();
  const badAuth = { ...auth, login: vi.fn(async () => { throw new Error('login failed'); }) };
  const body = new URLSearchParams({ username: 'x', password: 'y', oauthReq: btoa(JSON.stringify({ clientId: 'c' })) });
  const req = new Request('https://x/authorize', { method: 'POST', body });
  const res = await handleAuthorize(req, env, badAuth);
  expect(res.status).toBe(200);
  expect(await res.text()).toContain('login failed');
  expect(env.OAUTH_PROVIDER.completeAuthorization).not.toHaveBeenCalled();
});

describe('preserveFieldsOnError — AJAX submission', () => {
  const encodedReq = btoa(JSON.stringify({ clientId: 'c' }));
  const post = (extraHeaders: Record<string, string> = {}) =>
    new Request('https://x/authorize', {
      method: 'POST',
      headers: extraHeaders,
      body: new URLSearchParams({ username: 'chris', password: 'pw', oauthReq: encodedReq }),
    });

  it('returns the redirect target as JSON instead of a 302 the fetch would chase', async () => {
    // A 302 to the OAuth client would be followed in the background, leaving the
    // user staring at a form that silently succeeded.
    const res = await handleAuthorize(post({ 'x-connector-ajax': '1' }), fakeEnv(), auth);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    await expect(res.json()).resolves.toEqual({ ok: true, redirectTo: 'https://claude.ai/cb?code=xyz' });
  });

  it('reports a rejected attempt as ok:false with HTTP 200', async () => {
    // 200 on purpose: rejecting submission 1 is how a multi-step login ASKS for
    // the next input. A 4xx would make ordinary flow control look like a
    // transport failure to the script.
    const failing = { ...auth, login: vi.fn(async () => { throw new Error('we texted you a code'); }) };
    const res = await handleAuthorize(post({ 'x-connector-ajax': '1' }), fakeEnv(), failing);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: false, error: 'we texted you a code' });
  });

  it('passes revealFields from a thrown error into the JSON', async () => {
    const failing = { ...auth, login: vi.fn(async () => {
      const err = new Error('we texted you a code');
      (err as { revealFields?: string[] }).revealFields = ['otp'];
      throw err;
    }) };
    const res = await handleAuthorize(post({ 'x-connector-ajax': '1' }), fakeEnv(), failing);
    await expect(res.json()).resolves.toEqual({ ok: false, error: 'we texted you a code', revealFields: ['otp'] });
  });

  it('omits revealFields entirely for an ordinary rejection', async () => {
    const failing = { ...auth, login: vi.fn(async () => { throw new Error('bad password'); }) };
    const res = await handleAuthorize(post({ 'x-connector-ajax': '1' }), fakeEnv(), failing);
    await expect(res.json()).resolves.toEqual({ ok: false, error: 'bad password' });
  });

  it('still serves the original HTML flow when the header is absent', async () => {
    // The header is the ONLY switch, so a browser with JavaScript disabled is
    // unaffected by this feature existing.
    const failing = { ...auth, login: vi.fn(async () => { throw new Error('nope'); }) };
    const res = await handleAuthorize(post(), fakeEnv(), failing);

    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('nope');
  });

  it('redirects normally without the header, even on success', async () => {
    const res = await handleAuthorize(post(), fakeEnv(), auth);
    expect(res.status).toBe(302);
  });
});
