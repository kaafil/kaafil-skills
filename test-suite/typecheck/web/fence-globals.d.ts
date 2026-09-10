/**
 * Ambient values that documentation examples are allowed to reference
 * without declaring.
 *
 * A fence is a snippet, not an app. `<KaafilUIKitProvider accessToken={accessToken}>`
 * is the clearest possible way to show the prop, and forcing every fence to
 * first invent a `const accessToken = '...'` would make the docs worse to
 * read while proving nothing.
 *
 * This list is deliberately SHORT and deliberately typed. Everything here is
 * something the reader unambiguously supplies from their own app. It is not
 * an escape hatch: nothing from `kaafil-js` or `kaafil-react-uikit` may be
 * declared here, so a hallucinated Kaafil symbol still fails the build.
 */

// ── credentials the host mints and passes in ────────────────────────────────
declare const accessToken: string;
declare const refreshToken: string;
declare const agencyRef: string;
declare const shareToken: string;
declare const token: string;

// ── identifiers that come from the host's own data ──────────────────────────
declare const tripRef: string;
declare const travellerRef: string;
declare const managerRef: string;
declare const agencyAdminRef: string;

// ── the host's own plumbing, whatever it happens to be ──────────────────────
declare const router: { push: (href: string) => void; replace: (href: string) => void };
declare const analytics: { track: (event: string, payload?: Record<string, unknown>) => void };
/** Stands in for "whatever Kaafil call this example is about". */
declare function doSomething(): Promise<unknown>;
declare function mintTokens(): Promise<{
  accessToken: string;
  refreshToken: string;
  agencyRef: string;
}>;
