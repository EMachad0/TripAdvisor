# Asia Trip Ranker

A Node trip-planner site and curator platform for a solo backpacking trip through China, Korea, Japan, Hong Kong and Thailand (Dec 2026 to Feb 2027). Start with `README.md` and the `docs/` folder.

When the user asks a question about the trip, answer it here, then publish the answer as a card on the site with the `trip-answers` skill (`.claude/skills/trip-answers/SKILL.md`).

When the user asks for a new card (a place, stay or area page under `places/` or `areas/`), ship it without asking: once the curator's page passes `./atr validate`, put it on a branch from `origin/main` (a worktree, only that card's files plus its `reviews/<id>.yaml`), open a pull request, merge it, and check `/healthz` reports the merge commit. The user never reviews cards locally, so a card is not done until it is live. Never push to `main` directly.

Before changing anything a person sees in `apps/web`, read `docs/DESIGN.md`: the four target screens (Galaxy Z Fold 8 Ultra inner and cover, MacBook Pro 14, 27 inch 1440p monitor), the breakpoints and the visual language. Never add tests that pin design or one device's layout.

Never wait for the user's approval on a pull request, and deploy without asking. Once a PR's checks are green and you have verified the change yourself, merge it, let the deploy run, and check `/healthz` reports the merge commit. The user does not review PRs. This standing go-ahead covers merging and the deploy that follows; destructive actions (deleting data, dropping tables, revoking access) still need a yes each time. Never push to `main` directly.
