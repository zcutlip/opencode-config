#!/usr/bin/env sh
set -eu

# refresh-models.sh — run `opencode models --refresh` and filter the output.
#
# Usage: refresh-models.sh [-p|--provider SUBSTRING] [-m|--model SUBSTRING] [-h|--help]
#
# Both filters are optional and case-insensitive. `-p` matches against the
# provider portion (before the first `/`); `-m` matches as a substring anywhere
# in the `provider/model` line. stdout/stderr and the exit status of
# `opencode models --refresh` are preserved.

usage() {
	cat <<'EOF'
Usage: refresh-models.sh [-p|--provider SUBSTRING] [-m|--model SUBSTRING] [-h|--help]

Run `opencode models --refresh` and filter the model list (case-insensitive).

Options:
  -p, --provider SUBSTRING   Filter by provider (matches before the first `/`)
  -m, --model    SUBSTRING   Filter by substring anywhere in `provider/model`
  -h, --help                 Show this help and exit

Either, both, or neither filter may be supplied.
EOF
}

provider_filter=""
model_filter=""

while [ $# -gt 0 ]; do
	case "$1" in
	-p)
		[ $# -ge 2 ] || { echo "Error: -p/--provider requires a value" >&2; usage >&2; exit 2; }
		provider_filter="$2"
		shift 2
		;;
	--provider)
		[ $# -ge 2 ] || { echo "Error: --provider requires a value" >&2; usage >&2; exit 2; }
		provider_filter="$2"
		shift 2
		;;
	--provider=*)
		provider_filter="${1#--provider=}"
		[ -n "$provider_filter" ] || { echo "Error: --provider requires a value" >&2; usage >&2; exit 2; }
		shift
		;;
	-m)
		[ $# -ge 2 ] || { echo "Error: -m/--model requires a value" >&2; usage >&2; exit 2; }
		model_filter="$2"
		shift 2
		;;
	--model)
		[ $# -ge 2 ] || { echo "Error: --model requires a value" >&2; usage >&2; exit 2; }
		model_filter="$2"
		shift 2
		;;
	--model=*)
		model_filter="${1#--model=}"
		[ -n "$model_filter" ] || { echo "Error: --model requires a value" >&2; usage >&2; exit 2; }
		shift
		;;
	-h | --help)
		usage
		exit 0
		;;
	--)
		shift
		break
		;;
	-*)
		echo "Error: unknown option: $1" >&2
		usage >&2
		exit 2
		;;
	*)
		echo "Error: unexpected positional argument: $1" >&2
		usage >&2
		exit 2
		;;
	esac
done

# Capture stdout (the model list) and stderr separately so we can:
#   - preserve the refresh notice on stderr untouched
#   - exit with opencode's status even if the model list is empty
tmp_list="$(mktemp)"
trap 'rm -f "$tmp_list"' EXIT HUP INT TERM

# shellcheck disable=SC2086
opencode models --refresh >"$tmp_list"
opencode_status=$?

if [ "$opencode_status" -ne 0 ]; then
	exit "$opencode_status"
fi

# Lowercase the filters once for case-insensitive matching.
provider_lc=""
model_lc=""
if [ -n "$provider_filter" ]; then
	provider_lc="$(printf '%s' "$provider_filter" | tr '[:upper:]' '[:lower:]')"
fi
if [ -n "$model_filter" ]; then
	model_lc="$(printf '%s' "$model_filter" | tr '[:upper:]' '[:lower:]')"
fi

# Filter the list. Each line is `provider/model`.
while IFS= read -r line || [ -n "$line" ]; do
	[ -n "$line" ] || continue
	line_lc="$(printf '%s' "$line" | tr '[:upper:]' '[:lower:]')"

	if [ -n "$provider_lc" ]; then
		case "$line" in
		*/*)
			prov="${line%%/*}"
			;;
		*)
			prov="$line"
			;;
		esac
		prov_lc="$(printf '%s' "$prov" | tr '[:upper:]' '[:lower:]')"
		case "$prov_lc" in
		*"$provider_lc"*) ;;
		*) continue ;;
		esac
	fi

	if [ -n "$model_lc" ]; then
		case "$line_lc" in
		*"$model_lc"*) ;;
		*) continue ;;
		esac
	fi

	printf '%s\n' "$line"
done <"$tmp_list"
