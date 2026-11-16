#!/usr/bin/env bash
# Every command against the PRODUCTION Convex deployment goes through this wrapper (plan sections 12 to 15).
#
#   scripts/convex-prod.sh status                       print the target host and ping GET /version (read)
#   scripts/convex-prod.sh deploy                       push apps/web/src/convex (write)
#   scripts/convex-prod.sh env list                     variable NAMES only; values are never listed (read)
#   printf %s "$V" | scripts/convex-prod.sh env set NAME   value from stdin or typed, never an argument (write)
#   scripts/convex-prod.sh env set --force --from-file F   many at once, from a private file (write)
#   scripts/convex-prod.sh env remove NAME              (write)
#   scripts/convex-prod.sh run <function> ['<json>']    write, except the read-only functions listed in READS
#   scripts/convex-prod.sh import …                     convex import (write)
#   scripts/convex-prod.sh export --path F              convex export (read; the file holds traveler data)
#   scripts/convex-prod.sh logs | data …                (read)
#   scripts/convex-prod.sh migrate <cmd> …              @atr/migrate with --target prod (import is a write)
#
# Key: apps/web/.env.convex-prod (gitignored, mode 600) holding CONVEX_SELF_HOSTED_URL='https://api.<site>' and
# CONVEX_SELF_HOSTED_ADMIN_KEY='…' (from the owner's password manager). ATR_CONVEX_PROD_ENV points elsewhere.
# Before every write it prints the host and asks you to type it back. ATR_PROD_CONFIRM=<host> answers that
# prompt for one scripted command; it must equal the host exactly. Nothing prints the key or any env value:
# `env get` and `env list --include-values` are refused, and xtrace is never on.
set -euo pipefail
set +x
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB="$ROOT/apps/web"
KEY_FILE="${ATR_CONVEX_PROD_ENV:-$WEB/.env.convex-prod}"
CONVEX_BIN="$WEB/node_modules/convex/bin/main.js"

# Internal functions that only read. Everything else `run` calls is treated as a write.
READS=(ops:getWritesFrozen admin:accountCounts exporter:bundle members:roleOf)

die() { printf 'convex-prod: %s\n' "$*" >&2; exit 1; }
usage() { sed -n '2,21p' "$0"; exit 2; }

file_mode() { stat -c %a "$1" 2>/dev/null || stat -f %Lp "$1"; }
conf_get() { # file key: KEY=value or KEY='value', never sourced
	local line
	line="$(grep -E "^$2=" "$1" | tail -n 1 || true)"
	line="${line#*=}"
	line="${line#\'}"; line="${line%\'}"
	line="${line#\"}"; line="${line%\"}"
	printf '%s' "$line"
}

load_key() {
	[[ -f "$KEY_FILE" ]] || die "no ${KEY_FILE#"$ROOT/"}; create it (mode 600) from the password manager"
	local mode
	mode="$(file_mode "$KEY_FILE")"
	[[ "$mode" == 600 || "$mode" == 400 ]] || die "${KEY_FILE#"$ROOT/"} must be mode 600 (is $mode): chmod 600 it"
	if [[ "$KEY_FILE" == "$ROOT/"* ]] && ! git -C "$ROOT" check-ignore -q "$KEY_FILE"; then
		die "${KEY_FILE#"$ROOT/"} is not gitignored; refusing"
	fi
	CONVEX_SELF_HOSTED_URL="$(conf_get "$KEY_FILE" CONVEX_SELF_HOSTED_URL)"
	CONVEX_SELF_HOSTED_ADMIN_KEY="$(conf_get "$KEY_FILE" CONVEX_SELF_HOSTED_ADMIN_KEY)"
	[[ -n "$CONVEX_SELF_HOSTED_ADMIN_KEY" ]] || die "CONVEX_SELF_HOSTED_ADMIN_KEY is empty in ${KEY_FILE#"$ROOT/"}"
	case "$CONVEX_SELF_HOSTED_URL" in
		https://*) ;;
		*) die "CONVEX_SELF_HOSTED_URL must be the https production origin (local backends use scripts/convex-local.sh)" ;;
	esac
	HOST="${CONVEX_SELF_HOSTED_URL#https://}"
	HOST="${HOST%%/*}"
	export CONVEX_SELF_HOSTED_URL CONVEX_SELF_HOSTED_ADMIN_KEY
}

banner() { printf 'convex-prod: target %s (%s)\n' "$HOST" "$1" >&2; }

confirm_write() { # what
	banner "WRITE: $1"
	if [[ -n "${ATR_PROD_CONFIRM:-}" ]]; then
		[[ "$ATR_PROD_CONFIRM" == "$HOST" ]] || die "ATR_PROD_CONFIRM does not match $HOST; nothing done"
		return 0
	fi
	[[ -r /dev/tty ]] || die "no terminal to confirm on; set ATR_PROD_CONFIRM=$HOST for this one command"
	local answer
	printf 'Type the host (%s) to go ahead: ' "$HOST" >/dev/tty
	IFS= read -r answer </dev/tty
	[[ "$answer" == "$HOST" ]] || die "not confirmed; nothing done"
}

cli() { cd "$WEB" && node "$CONVEX_BIN" "$@"; }

is_read_fn() {
	local fn
	for fn in "${READS[@]}"; do [[ "$1" == "$fn" ]] && return 0; done
	return 1
}

cmd_env() {
	local sub="${1:-}"
	shift || true
	case "$sub" in
		list)
			for a in "$@"; do [[ "$a" == --include-values ]] && die "values are never listed; use the backup's convex-env object"; done
			banner "read: env list --names-only"
			cli env list --names-only ;;
		get) die "env get prints a value; refused (check presence with: env list)" ;;
		set)
			# A value given as an argument would sit in shell history and ps output.
			local positional=0 a
			for a in "$@"; do [[ "$a" != -* ]] && positional=$((positional + 1)); done
			if [[ " $* " != *" --from-file "* && $positional -gt 1 ]]; then
				die "pass the value on stdin or type it, never as an argument"
			fi
			confirm_write "env set ${1:-}"
			cli env set "$@" >/dev/null
			printf 'convex-prod: env set done\n' >&2 ;;
		remove | unset)
			confirm_write "env remove $*"
			cli env remove "$@" >/dev/null
			printf 'convex-prod: env remove done\n' >&2 ;;
		*) die "env list | set | remove" ;;
	esac
}

cmd_migrate() {
	local sub="${1:-}"
	case "$sub" in
		import | round-trip) confirm_write "migrate $sub" ;;
		export-v1 | verify | dry-run) banner "read: migrate $sub" ;;
		*) die "migrate import | export-v1 | verify | dry-run | round-trip" ;;
	esac
	cd "$ROOT/packages/migrate" && node src/bin.ts "$@" --target prod
}

main() {
	[[ $# -gt 0 ]] || usage
	local cmd="$1"
	shift
	case "$cmd" in
		-h | --help | help) usage ;;
	esac
	load_key
	case "$cmd" in
		status)
			banner "read: GET /version"
			curl -fsS --max-time 10 "$CONVEX_SELF_HOSTED_URL/version" >/dev/null && printf 'convex-prod: %s is up\n' "$HOST" ;;
		deploy)
			confirm_write "deploy apps/web/src/convex"
			cli deploy --yes --typecheck disable --codegen disable "$@" ;;
		env) cmd_env "$@" ;;
		run)
			local fn="${1:-}"
			[[ -n "$fn" ]] || die "run <function> ['<json args>']"
			if is_read_fn "$fn"; then banner "read: run $fn"; else confirm_write "run $fn"; fi
			cli run "$@" ;;
		import)
			confirm_write "import $*"
			cli import "$@" ;;
		export | logs | data | function-spec)
			banner "read: $cmd"
			cli "$cmd" "$@" ;;
		migrate) cmd_migrate "$@" ;;
		*) die "unknown command '$cmd' (see --help); other convex commands are not allowed against prod" ;;
	esac
}

main "$@"
