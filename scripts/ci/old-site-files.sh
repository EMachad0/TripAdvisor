#!/usr/bin/env bash
# Compare the old image's file list with one built at the merge base. Any difference must be a path this PR
# changed (or content: places/ areas/ answers/ config/), so tooling for the new stack cannot leak into it.
set -euo pipefail
image="$1"
base_ref="${GITHUB_BASE_REF:-main}"
git fetch --no-tags --quiet origin "$base_ref"
base="$(git merge-base "origin/$base_ref" HEAD)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
git archive "$base" | tar -x -C "$work"
docker build -q -f "$work/Dockerfile" -t old:base "$work" >/dev/null
list() { docker run --rm --entrypoint find "$1" /app -type f -not -path '/app/node_modules/*' | sort; }
diff <(list old:base) <(list "$image") | grep -E '^[<>] ' | cut -c3- | sort -u >"$work/changed" || true
# Files this change touches: committed or not (CI has a clean tree; locally this also covers untracked files).
{ git diff --name-only "$base"; git ls-files --others --exclude-standard; } | sed 's#^#/app/#' | sort -u >"$work/allowed"
unexpected="$(grep -vE '^/app/(places|areas|answers|config)/' "$work/changed" | comm -23 - "$work/allowed" || true)"
echo "files that differ: $(wc -l <"$work/changed" | tr -d ' ')"
if [[ -n "$unexpected" ]]; then
	echo "unexpected changes in the old image:"
	echo "$unexpected"
	exit 1
fi
