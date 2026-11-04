const PRODUCTION_APP_ORIGIN = "https://fetha-trilingual-atelier-2.onrender.com";

/**
 * Keep authentication emails pointed at the deployed app in production builds.
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
