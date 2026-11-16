// Where the hosted trip site lives (docs/DEPLOY.md). The one place the publish and pull commands read it from.
//
// The site is the SvelteKit app (`trip-web`) with its self-hosted Convex backend. Its /healthz answers {ok, sha}, so
// a publish waits until the site serves the merged commit; the curator export (GET /ops/export) is on the Convex site.
// The old app (`trip-site`) was retired after the cutover of 2026-11-16.
export const SITE = {
  url: 'https://trip.187.53.115.237.sslip.io',
  /** The branch Coolify deploys (`trip-web`, app xbgdnounik78nabmkmecl45d). */
  branch: 'main',
  /** Path of one answer card on the Answers page. */
  answerPath: (id) => `/places/answers/${encodeURIComponent(id)}`,
  /** The Convex site origin (HTTP actions) that serves GET /ops/export: cvx.<site> (plan section 12). */
  exportUrl: 'https://cvx.trip.187.53.115.237.sslip.io',
};

/** Link to one answer card on the Answers page. */
export const answerLink = (id, site = SITE) => `${site.url}${site.answerPath(id)}`;
/** Link to the answer on its place or area page, or null for a country or whole-trip answer. */
export const answerPageLink = (target, id, site = SITE) => (target && (target.kind === 'place' || target.kind === 'area') ? `${site.url}/${target.kind}/${encodeURIComponent(target.id)}#answer-${encodeURIComponent(id)}` : null);
