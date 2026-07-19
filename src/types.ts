export interface LoginField {
  name: string;
  label: string;
  type?: 'text' | 'password';
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
