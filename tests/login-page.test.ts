import { describe, it, expect } from 'vitest';
import { renderLoginPage } from '../src/login-page.js';
import type { ConnectorAuth } from '../src/types.js';

const auth: ConnectorAuth<{ token: string }> = {
  service: 'Untappd',
  fields: [
    { name: 'username', label: 'Username' },
    { name: 'password', label: 'Password', type: 'password' },
  ],
  login: async () => ({ token: 'TOK' }),
  privacyNote: 'We never store your password.',
};

describe('renderLoginPage — zero-auth (public) connectors', () => {
  const publicAuth: ConnectorAuth<{ site: string }> = {
    service: 'Charlotte On The Cheap',
    fields: [],
    login: async () => ({ site: 'https://www.charlotteonthecheap.com' }),
    privacyNote: 'This service needs no account — only public data is read.',
  };

  it('renders no credential inputs when there are no fields', () => {
    const html = renderLoginPage(publicAuth);
    expect(html).not.toMatch(/<input[^>]*type="(text|password)"/);
  });

  it('still carries the oauthReq and a submit button so the grant can complete', () => {
    const html = renderLoginPage(publicAuth, { oauthReq: { clientId: 'c' } });
    expect(html).toContain('name="oauthReq"');
    expect(html).toMatch(/<button[^>]*type="submit"/);
  });

  it('does not claim a sign-in is needed', () => {
    const html = renderLoginPage(publicAuth);
    expect(html).not.toContain('Secure sign-in');
    expect(html).not.toMatch(/Sign in with your .* account/);
  });

  it('still shows the service name and privacy note', () => {
    const html = renderLoginPage(publicAuth);
    expect(html).toContain('Charlotte On The Cheap');
    expect(html).toContain('only public data is read');
  });

  it('surfaces an error (e.g. the site being unreachable) on the public page too', () => {
    const html = renderLoginPage(publicAuth, { error: 'site unreachable' });
    expect(html).toContain('site unreachable');
  });
});

describe('renderLoginPage', () => {
  it('renders an input for each field', () => {
    const html = renderLoginPage(auth);
    expect(html).toContain('name="username"');
    expect(html).toContain('name="password"');
  });

  it('marks password fields with type="password"', () => {
    const html = renderLoginPage(auth);
    expect(html).toMatch(/name="password"[^>]*type="password"|type="password"[^>]*name="password"/);
  });

  it('defaults non-password fields to type="text"', () => {
    const html = renderLoginPage(auth);
    expect(html).toMatch(/name="username"[^>]*type="text"|type="text"[^>]*name="username"/);
  });

  it('shows the service name', () => {
    const html = renderLoginPage(auth);
    expect(html).toContain('Untappd');
  });

  it('shows the privacy note', () => {
    const html = renderLoginPage(auth);
    expect(html).toContain('We never store your password.');
  });

  it('shows the error text when passed', () => {
    const html = renderLoginPage(auth, { error: 'login failed' });
    expect(html).toContain('login failed');
  });

  it('omits any error markup when no error is passed', () => {
    const html = renderLoginPage(auth);
    expect(html).not.toContain('role="alert"');
  });

  it('carries the oauthReq through a hidden field', () => {
    const html = renderLoginPage(auth, { oauthReq: { clientId: 'c' } });
    const expected = btoa(JSON.stringify({ clientId: 'c' }));
    expect(html).toContain(`name="oauthReq" value="${expected}"`);
  });

  it('applies a provided accent color and derives readable button text', () => {
    const html = renderLoginPage({ ...auth, accent: '#FFC000' });
    expect(html).toContain('--accent: #FFC000');
    // #FFC000 is light → dark ink on the button
    expect(html).toContain('--accent-ink: #141414');
  });

  it('picks dark ink on a mid-range accent (L≈0.33), not the WCAG-crossover-violating white', () => {
    // #0ea5e9 has relative luminance ~0.329 — comfortably above the WCAG
    // AA contrast crossover (~0.179 for white-vs-black text) but below the
    // old, too-high 0.5 threshold. White text on this background reads
    // poorly; dark text is the correct, more-readable choice.
    const html = renderLoginPage({ ...auth, accent: '#0ea5e9' });
    expect(html).toContain('--accent-ink: #141414');
  });

  it('falls back to the neutral accent when none/invalid is given', () => {
    expect(renderLoginPage(auth)).toContain('--accent: #4f46e5');
    expect(renderLoginPage({ ...auth, accent: 'red; }evil' })).toContain('--accent: #4f46e5');
  });

  it('is a styled, theme-aware document (inline CSS, dark mode, reduced motion, no external assets)', () => {
    const html = renderLoginPage(auth);
    expect(html).toContain('<style>');
    expect(html).toContain('prefers-color-scheme: dark');
    expect(html).toContain('prefers-reduced-motion');
    expect(html).not.toContain('http://');
    expect(html).not.toContain('https://');
  });

  it('sets autocomplete + autofocus for password-manager friendliness', () => {
    const html = renderLoginPage(auth);
    expect(html).toMatch(/name="username"[^>]*autocomplete="username"/);
    expect(html).toMatch(/name="password"[^>]*autocomplete="current-password"/);
    expect(html).toContain('autofocus');
  });
});

describe('preserveFieldsOnError — page markup', () => {
  const base = { service: 'Kia', fields: [{ name: 'username', label: 'Email' }], login: async () => ({}) };

  it('emits no script at all by default', () => {
    // Opt-in: the other connectors pinning this package must be untouched.
    expect(renderLoginPage(base as never)).not.toContain('<script');
  });

  it('emits the enhancement and a live error region when enabled', () => {
    const html = renderLoginPage({ ...base, preserveFieldsOnError: true } as never);
    expect(html).toContain('<script');
    expect(html).toContain("'x-connector-ajax'");
    expect(html).toContain('id="cx-error"');
    expect(html).toContain('aria-live="polite"');
  });

  it('keeps method="post" so a no-JS browser still submits', () => {
    const html = renderLoginPage({ ...base, preserveFieldsOnError: true } as never);
    expect(html).toContain('<form method="post">');
  });

  it('writes server text with textContent, never innerHTML', () => {
    // The error string comes from the server; assigning it as markup would make
    // an upstream message a script-injection vector.
    const html = renderLoginPage({ ...base, preserveFieldsOnError: true } as never);
    expect(html).toContain('textContent');
    // Assert no ASSIGNMENT, not the bare token: a comment explaining why the
    // token is avoided would otherwise fail this, which is the test policing
    // its own documentation rather than the behaviour.
    expect(html).not.toMatch(/\.innerHTML\s*=/);
    expect(html).not.toMatch(/insertAdjacentHTML|outerHTML\s*=|document\.write/);
  });

  it('focuses the first EMPTY input, not merely the first one', () => {
    // The old selector's first alternative was dead (the second matched
    // everything), so it always focused field 1 — the email — rather than the
    // code box a multi-step login has just brought into play.
    const html = renderLoginPage({ ...base, preserveFieldsOnError: true } as never);
    expect(html).toContain('if (!inputs[i].value)');
    expect(html).not.toContain('[value=""]');
  });

  it('guards focus for a fields-less public service', () => {
    // fields: [] is a documented contract. Pairing it with this flag is odd but
    // legal, and an unguarded inputs[0].focus() would throw — silently, since
    // the chained .catch turns any throw into a full-page form.submit().
    const html = renderLoginPage({ ...base, fields: [], preserveFieldsOnError: true } as never);
    expect(html).toContain('if (inputs.length)');
    expect(html).not.toMatch(/\(target \|\| inputs\[0\]\)\.focus\(\);(?!\s*\n)/);
  });

  it('omits `required` on an optional field, and keeps it everywhere else', () => {
    // The bug this exists to prevent: every field was hardcoded `required`, so a
    // multi-step login whose first submit must leave the code box EMPTY was
    // silently unreachable — the browser refused to submit, no request was made,
    // no code was sent, and nothing said why. Every other layer's tests passed,
    // because they all ran BELOW native form validation.
    const html = renderLoginPage({
      ...base,
      fields: [
        { name: 'username', label: 'Email' },
        { name: 'password', label: 'Password', type: 'password' as const },
        { name: 'otp', label: 'Texted code', optional: true },
      ],
      preserveFieldsOnError: true,
    } as never);

    const inputFor = (name: string) =>
      html.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`))?.[0] ?? '';

    expect(inputFor('otp')).not.toContain('required');
    expect(inputFor('username')).toContain('required');
    expect(inputFor('password')).toContain('required');
  });

  it('renders a revealOnDemand field hidden AND disabled, with no `required`', () => {
    // All three matter together. `hidden` alone still submits and still
    // validates, so an empty required box would block the very submission meant
    // to reveal it — which is exactly how the code box made this flow
    // unreachable through the UI while every server-side test passed.
    const html = renderLoginPage({
      ...base,
      fields: [
        { name: 'username', label: 'Email' },
        { name: 'otp', label: 'Texted code', revealOnDemand: true },
      ],
    } as never);
    const otp = html.match(/<input[^>]*name="otp"[^>]*>/)?.[0] ?? '';

    expect(otp).toContain('disabled');
    expect(otp).not.toContain('required');
    expect(html).toContain('data-reveal="otp"');
    expect(html).toMatch(/<div class="field" hidden/);
    // The ordinary field is untouched.
    expect(html.match(/<input[^>]*name="username"[^>]*>/)?.[0]).toContain('required');
  });

  it('reveals the named field server-side, so no-JS can still finish', () => {
    const html = renderLoginPage(
      { ...base, fields: [{ name: 'otp', label: 'Texted code', revealOnDemand: true }] } as never,
      { error: 'we texted you a code', revealFields: ['otp'] },
    );
    const otp = html.match(/<input[^>]*name="otp"[^>]*>/)?.[0] ?? '';

    expect(otp).not.toContain('disabled');
    expect(html).not.toMatch(/<div class="field" hidden/);
    // The half that matters and was unasserted: once revealed the field is in
    // play, so it becomes mandatory. `required` is suppressed only while hidden.
    expect(otp).toContain('required');
  });

  it('keeps a revealed field optional when it was declared optional', () => {
    const html = renderLoginPage(
      { ...base, fields: [{ name: 'otp', label: 'Code', revealOnDemand: true, optional: true }] } as never,
      { revealFields: ['otp'] },
    );
    const otp = html.match(/<input[^>]*name="otp"[^>]*>/)?.[0] ?? '';
    expect(otp).not.toContain('required');
    expect(otp).toContain('data-optional');
  });

  it('makes the script mirror the server: reveal implies required', () => {
    // Otherwise the two paths disagree — with JS the second step could be
    // submitted blank, silently restarting the first and issuing a new code.
    const html = renderLoginPage(
      { ...base, fields: [{ name: 'otp', label: 'Code', revealOnDemand: true }], preserveFieldsOnError: true } as never,
    );
    expect(html).toContain('inp.required = true');
    expect(html).toContain("hasAttribute('data-optional')");
  });

  it('teaches the script to re-enable, not merely un-hide', () => {
    // Un-hiding a still-disabled input would silently drop whatever is typed
    // into it, since disabled inputs are not submitted.
    const html = renderLoginPage(
      { ...base, fields: [{ name: 'otp', label: 'Code', revealOnDemand: true }], preserveFieldsOnError: true } as never,
    );
    expect(html).toContain('inp.disabled = false');
    expect(html).toContain('wrap.hidden = false');
  });

  it('renders a field hint under its input, escaped', () => {
    const html = renderLoginPage(
      { ...base, fields: [{ name: 'otp', label: 'Texted code', revealOnDemand: true }] } as never,
      { revealFields: ['otp'], fieldHints: { otp: 'Sent to (***) ***-6609 <b>' } },
    );
    expect(html).toContain('data-hint="otp"');
    expect(html).toContain('(***) ***-6609');
    // Server-supplied, so it must be escaped rather than trusted as markup.
    expect(html).toContain('&lt;b&gt;');
    expect(html).not.toContain('-6609 <b>');
  });

  it('leaves the hint element present but hidden when there is no hint', () => {
    // Present so the script can fill it in later without rebuilding the DOM.
    const html = renderLoginPage(
      { ...base, fields: [{ name: 'otp', label: 'Code' }] } as never,
    );
    expect(html).toMatch(/<p class="hint" data-hint="otp" hidden>/);
  });

  it('suppresses the generic fallback for a flow-advancing rejection', () => {
    // A prompt with no text is just a reveal: the hint beside the field already
    // explains it, and a red "Sign-in failed" banner would report a problem
    // where none occurred. The fallback is reserved for a rejection that
    // explains nothing at all.
    const html = renderLoginPage({ ...base, preserveFieldsOnError: true } as never);
    expect(html).toContain("advancing ? '' : 'Sign-in failed. Please try again.'");
  });

  it('renders no banner at all for an empty server-side error', () => {
    const html = renderLoginPage(
      { ...base, fields: [{ name: 'otp', label: 'Code', revealOnDemand: true }] } as never,
      { error: '', revealFields: ['otp'], fieldHints: { otp: 'Sent to (***) ***-6609' } },
    );
    // No error block, but the hint that replaces it is present.
    expect(html).not.toContain('role="alert"');
    expect(html).toContain('(***) ***-6609');
  });

  it('still renders a server-side error when JS never runs', () => {
    const html = renderLoginPage({ ...base, preserveFieldsOnError: true } as never, { error: 'bad password' });
    expect(html).toContain('bad password');
  });
});
