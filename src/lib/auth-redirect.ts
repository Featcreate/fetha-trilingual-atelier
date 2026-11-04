const PRODUCTION_APP_ORIGIN = "https://algorea-bazaar.onrender.com";

/**
 * Keep authentication emails pointed at the active Algorea Bazaar deployment.
 * Local development remains local so developers can test the full auth flow.
 */
export function authRedirectUrl(path: string): string {
  const configuredOrigin = import.meta.env["VITE_APP_URL"]?.trim();
  const origin = configuredOrigin
    ? new URL(configuredOrigin).origin
    : import.meta.env.PROD
      ? PRODUCTION_APP_ORIGIN
      : window.location.origin;

  return new URL(path, origin).toString();
}
