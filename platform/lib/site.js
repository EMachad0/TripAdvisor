// Where the hosted trip site lives (docs/DEPLOY.md). The one place the publish command reads it from.
export const SITE = {
  url: 'https://trip.187.53.115.237.sslip.io',
  /** SSH login on the VPS; used read-only to follow a deploy (never to start one). */
  ssh: 'root@187.53.115.237',
  /** Coolify application id of the trip site. */
  coolifyApp: 'zoom1ixd7gj2y4snw6oculrb',
  /** The branch Coolify deploys. */
  branch: 'main',
};

/** Link to one answer card on the Answers page. */
export const answerLink = (id) => `${SITE.url}/#/answers/${encodeURIComponent(id)}`;
/** Link to the answer on its place or area page, or null for a country or whole-trip answer. */
export const answerPageLink = (target, id) => (target && (target.kind === 'place' || target.kind === 'area') ? `${SITE.url}/${target.kind}/${encodeURIComponent(target.id)}#answer-${encodeURIComponent(id)}` : null);
