// Where the hosted trip site lives (docs/DEPLOY.md). The one place the publish and pull commands read it from.
//
// Two apps, one switch (docs/MIGRATION-PLAN.md section 7):
// - `old`: game/server.js on Coolify (`trip-site`). Its /healthz answers {"ok":true}, with no commit sha.
// - `new`: the SvelteKit app (`trip-web`) with its Convex backend. Its /healthz answers {ok, sha}, so a publish
//   waits until the site serves the merged commit; the curator export (GET /ops/export) is on the Convex site.
// ACTIVE_SITE stays 'old' until the cutover PR flips it to 'new'. ATR_SITE=old|new overrides it for one command
// (a dry run or a test); it changes which links are printed and what a publish waits for, nothing else.
export const SITES = {
  old: {
    name: 'old',
    url: 'https://trip.187.53.115.237.sslip.io',
    /** SSH login on the VPS; used read-only to follow a deploy (never to start one). */
    ssh: 'root@187.53.115.237',
    /** Coolify application id of the trip site. */
    coolifyApp: 'zoom1ixd7gj2y4snw6oculrb',
    /** The branch Coolify deploys. */
    branch: 'main',
    /** /healthz reports the deployed commit sha. */
    healthSha: false,
    /** Path of one answer card on the Answers page. */
    answerPath: (id) => `/#/answers/${encodeURIComponent(id)}`,
  },
  new: {
    name: 'new',
    // After the cutover the new app takes over the same host (runbook step 8d); new.<site> is the shadow before it.
    url: 'https://trip.187.53.115.237.sslip.io',
    ssh: 'root@187.53.115.237',
    // Coolify id of `trip-web`: filled in when task 8 creates the app. Until then a publish follows /healthz only.
    coolifyApp: null,
    branch: 'main',
    healthSha: true,
    answerPath: (id) => `/places/answers/${encodeURIComponent(id)}`,
    /** The Convex site origin (HTTP actions) that serves GET /ops/export: cvx.<site> (plan section 12). */
    exportUrl: 'https://cvx.trip.187.53.115.237.sslip.io',
  },
};

/** The app the CLI talks to. The cutover PR changes this one word to 'new' (and the rollback PR changes it back). */
export const ACTIVE_SITE = 'old';

/** The active app's name: ATR_SITE when it names an app, else ACTIVE_SITE. */
export function activeSiteName(env = process.env) {
  const asked = env.ATR_SITE;
  return asked && Object.hasOwn(SITES, asked) ? asked : ACTIVE_SITE;
}

/** The settings of the active app (see SITES). */
export const siteSettings = (env = process.env) => SITES[activeSiteName(env)];

/** The active app's settings, read once at load. */
export const SITE = siteSettings();

/** Link to one answer card on the Answers page. */
export const answerLink = (id, site = SITE) => `${site.url}${site.answerPath(id)}`;
/** Link to the answer on its place or area page, or null for a country or whole-trip answer. */
export const answerPageLink = (target, id, site = SITE) => (target && (target.kind === 'place' || target.kind === 'area') ? `${site.url}/${target.kind}/${encodeURIComponent(target.id)}#answer-${encodeURIComponent(id)}` : null);
