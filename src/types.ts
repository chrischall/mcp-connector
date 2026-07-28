export interface LoginField {
  name: string;
  label: string;
  type?: 'text' | 'password';
  /**
   * Render WITHOUT the `required` attribute. Every field is required by
   * default, which is right for a one-shot form and wrong for a multi-step one.
   *
   * A challenge-based login (see {@link ConnectorAuth.preserveFieldsOnError})
   * needs a box the user must leave EMPTY on the first submission — that empty
   * submit is what asks the service to send a code. Marked required, the
   * browser silently refuses to submit and the flow is unreachable: no request
   * is made, no code is sent, and nothing explains why.
   *
   * `login()` still receives the field as `''`, so a connector that wants it
   * present must validate it itself.
   */
  optional?: boolean;
  /**
   * Render this field hidden AND disabled until the service asks for it.
   *
   * For a challenge-based login, the second input (a texted code) is
   * meaningless until the first submission has requested one — and showing it
   * up front actively misleads: a label describing a code reads, on a freshly
   * loaded page, like the page announcing that a code was already sent.
   *
   * `disabled` is what makes this safe rather than merely cosmetic. A disabled
   * input is excluded from native validation AND from submission, so the first
   * submit cannot be blocked by an empty box the user was never meant to fill.
   *
   * To reveal it, `login()` throws an error carrying `revealFields`:
   *
   * ```ts
   * const err = new Error('We texted you a code. Enter it below.');
   * (err as { revealFields?: string[] }).revealFields = ['otp'];
   * throw err;
   * ```
   *
   * Both paths honour it: the inline script un-hides the named fields, and a
   * no-JS re-render marks them revealed server-side — so the flow still
   * completes with JavaScript disabled.
   */
  revealOnDemand?: boolean;
}

export interface ConnectorAuth<Props> {
  /** Login-page branding, e.g. "Untappd". */
  service: string;
  /**
   * Credential inputs to collect. Pass an empty array for a public service that
   * needs no credentials at all — the login page then renders a bare authorize
   * button and `login` receives an empty object.
   */
  fields: LoginField[];
  /**
   * OAuth user id to record for the grant. Defaults to the first field's
   * submitted value, or `'public'` when `fields` is empty (there is no
   * per-user identity to key a public service on).
   */
  userId?: string;
  /** Verifies credentials and returns the OAuth props to store. Throws on bad creds. */
  login(fields: Record<string, string>, env: any): Promise<Props>;
  /** One-line note shown under the form. */
  privacyNote?: string;
  /**
   * Submit the form with `fetch` so a rejected attempt renders its error inline
   * INSTEAD of reloading the page — which means everything already typed stays
   * on screen.
   *
   * Off by default: it changes how every error on the login page behaves, and a
   * plain full-page POST is the safer default for a connector that does not
   * need this.
   *
   * Turn it on for a **multi-step login**, where the first submission is not
   * really a failure. A service that challenges with an emailed or texted code
   * must reject submission 1 in order to ask for the code, and a full-page
   * reload there wipes the email and password the user has to send again
   * alongside it. With this on they type only the code.
   *
   * Progressive enhancement, not a dependency: the script is inline (no external
   * assets, so no CSP relaxation) and the form keeps its `method="post"`, so
   * with JavaScript disabled the original full-page flow still works unchanged.
   */
  preserveFieldsOnError?: boolean;
  /** Brand accent as a hex color (e.g. "#FFC000") for the login page's button, focus ring, and tint. Optional — a neutral is used if absent. */
  accent?: string;
}

export interface ConnectorOptions<Props extends Record<string, unknown>, Client> {
  name: string;
  version: string;
  auth: ConnectorAuth<Props>;
  buildClient(props: Props, env: any): Client;
  tools: Array<(server: any, client: Client) => void>;
}
