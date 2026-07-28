import { renderLoginPage } from './login-page.js';
import type { ConnectorAuth } from './types.js';

export interface ParsedLoginForm {
  /** Raw form field values, keyed by input name (excludes the hidden oauthReq carrier). */
  values: Record<string, string>;
  /** The decoded OAuth authorization request carried in the hidden `oauthReq` field. */
  oauthReq: unknown;
}

/**
 * Parses the login form's POST body: extracts plain field values and decodes
 * the hidden `oauthReq` field (base64-encoded JSON) that round-trips the
 * pending OAuth authorization request across the login form submission.
 */
export async function parseLoginForm(request: Request): Promise<ParsedLoginForm> {
  const formData = await request.formData();
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') {
      values[key] = value;
    }
  }
  const { oauthReq: encodedOauthReq, ...rest } = values;
  const oauthReq = encodedOauthReq ? JSON.parse(atob(encodedOauthReq)) : undefined;
  return { values: rest, oauthReq };
}

/**
 * The user id recorded for the grant: an explicit `auth.userId` wins, otherwise
 * the first field's submitted value. A public connector declares no fields and
 * so has no per-user identity — it keys every grant on `'public'`.
 */
function resolveUserId<Props>(auth: ConnectorAuth<Props>, fields: Record<string, string>): string {
  if (auth.userId) return auth.userId;
  const first = auth.fields[0];
  return first ? fields[first.name] : 'public';
}

function messageOf(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

/**
 * Default handler for the `/authorize` route: GET renders the service's login
 * form; POST verifies the submitted credentials via `auth.login` and, on
 * success, completes the OAuth authorization with the resulting props.
 */
export async function handleAuthorize<Props>(
  request: Request,
  env: any,
  auth: ConnectorAuth<Props>,
): Promise<Response> {
  if (request.method === 'GET') {
    const oauthReqInfo = await env.OAUTH_PROVIDER.parseAuthRequest(request);
    return new Response(renderLoginPage(auth, { oauthReq: oauthReqInfo }), {
      headers: { 'content-type': 'text/html' },
    });
  }

  // Set by the progressive-enhancement script when `preserveFieldsOnError` is
  // on. Its presence is the ONLY thing that changes the response shape — a
  // browser without JavaScript never sends it and gets the original HTML flow.
  const wantsJson = request.headers.get('x-connector-ajax') === '1';

  const { values, oauthReq: oauthReqInfo } = await parseLoginForm(request);
  const fields: Record<string, string> = {};
  for (const field of auth.fields) {
    fields[field.name] = values[field.name] ?? '';
  }

  try {
    const props = await auth.login(fields, env);
    const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
      request: oauthReqInfo,
      userId: resolveUserId(auth, fields),
      scope: [],
      metadata: {},
      props,
    });
    // `fetch` cannot follow a 302 to the OAuth client's redirect_uri usefully —
    // it would be chased in the background and the user would sit on a form that
    // silently succeeded. Hand the URL back and let the page navigate.
    if (wantsJson) {
      return Response.json({ ok: true, redirectTo });
    }
    return Response.redirect(redirectTo, 302);
  } catch (e) {
    const error = messageOf(e);
    // A connector advances a multi-step login by REJECTING with instructions:
    // it names the fields that rejection brings into play.
    const revealFields = Array.isArray((e as { revealFields?: unknown })?.revealFields)
      ? ((e as { revealFields: string[] }).revealFields)
      : undefined;
    const rawHints = (e as { fieldHints?: unknown })?.fieldHints;
    const fieldHints =
      rawHints && typeof rawHints === 'object' && !Array.isArray(rawHints)
        ? (rawHints as Record<string, string>)
        : undefined;
    if (wantsJson) {
      // 200, not 4xx: a rejected first submission is how a multi-step login ASKS
      // for the next input. The `ok` flag carries the outcome; an error status
      // would make ordinary flow control look like a transport failure.
      return Response.json({ ok: false, error, ...(revealFields ? { revealFields } : {}), ...(fieldHints ? { fieldHints } : {}) });
    }
    return new Response(renderLoginPage(auth, { error, oauthReq: oauthReqInfo, revealFields, fieldHints }), {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });
  }
}
