#!/usr/bin/env bash
set -euo pipefail

# Main dispatcher for lint-format skill
# Usage: lint-format.sh <operation> <path> [<path>...]
# Operations: check | fix | format

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPERATION="${1:-}"
if [[ $# -gt 0 ]]; then shift; fi
PATHS=("$@")

# JSON escape helper
json_escape() {
    printf '%s' "$1" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()), end="")'
}

# Output JSON result
output_json() {
    local success="$1"
    local language="$2"
    local operation="$3"
    local files="$4"
    local issues="$5"
    local message="$6"

    cat <<EOF
{
  "success": $success,
  "language": "$language",
  "operation": "$operation",
  "files": $files,
  "issues": $issues,
  "message": $(json_escape "$message")
}
EOF
}

# Build a JSON array string from a list of file paths
build_files_json() {
    local out="["; local first=1
    for f in "$@"; do
        if [[ $first -eq 1 ]]; then first=0; else out+=", "; fi
        out+="\"$f\""
    done
    out+="]"
    printf '%s' "$out"
}

# Check arguments
if [[ -z "$OPERATION" || ${#PATHS[@]} -eq 0 ]]; then
    output_json "false" "unknown" "unknown" "[]" "[]" "Usage: lint-format.sh <operation> <path> [<path>...]"
    exit 1
fi

# Validate operation
case "$OPERATION" in
    check|fix|format)
        ;;
    *)
        output_json "false" "unknown" "$OPERATION" "[]" "[]" "Invalid operation: $OPERATION. Use check, fix, or format."
        exit 1
        ;;
esac

# Check that every path exists
for p in "${PATHS[@]}"; do
    if [[ ! -e "$p" ]]; then
        output_json "false" "unknown" "$OPERATION" "[]" "[]" "Path not found: $p"
        exit 1
    fi
done

# Detect file type
detect_language() {
    local path="$1"

    # If it's a directory, check for config files or any Python files inside
    if [[ -d "$path" ]]; then
        if [[ -f "$path/pyproject.toml" || -f "$path/setup.py" || -f "$path/requirements.txt" ]]; then
            echo "python"
            return
        fi
        if [[ -n "$(find "$path" -name "*.py" -type f 2>/dev/null | head -n1)" ]]; then
            echo "python"; return
        fi
        echo "unknown"
        return
    fi

    # Check by extension
    local ext="${path##*.}"
    case "$ext" in
        py)
            echo "python"
            ;;
        *)
            echo "unknown"
            ;;
    esac
}

# Partition paths by detected language
PYTHON_PATHS=()
OTHER_PATHS=()
if [[ ${#PATHS[@]} -gt 0 ]]; then
    for p in "${PATHS[@]}"; do
        LANGUAGE=$(detect_language "$p")
        case "$LANGUAGE" in
            python)
                PYTHON_PATHS+=("$p")
                ;;
            *)
                OTHER_PATHS+=("$p")
                ;;
        esac
    done
fi

# Mixed languages are not supported in one invocation
if [[ ${#PYTHON_PATHS[@]} -gt 0 && ${#OTHER_PATHS[@]} -gt 0 ]]; then
    output_json "false" "mixed" "$OPERATION" "[]" "[]" "Mixed file types in one invocation are not supported. Pass Python paths together or non-Python paths together."
    exit 1
fi

# Handle Python paths
if [[ ${#PYTHON_PATHS[@]} -gt 0 ]]; then
    # Call Python handler with all Python paths
    if [[ -x "$SCRIPT_DIR/handlers/python.sh" ]]; then
        "$SCRIPT_DIR/handlers/python.sh" "$OPERATION" "${PYTHON_PATHS[@]}"
        exit $?
    else
        output_json "false" "python" "$OPERATION" "[]" "[]" "Python handler not found or not executable"
        exit 1
    fi
fi

# Handle non-Python paths via pre-commit fallback
if [[ ${#OTHER_PATHS[@]} -gt 0 ]]; then
    # Determine the git project root from the first path
    PROJECT_ROOT=""
    if command -v git &> /dev/null; then
        first="${OTHER_PATHS[0]}"
        if [[ -f "$first" ]]; then
            start_dir="$(dirname "$first")"
        else
            start_dir="$first"
        fi
        PROJECT_ROOT=$(git -C "$start_dir" rev-parse --show-toplevel 2>/dev/null || true)
    fi

    OTHER_FILES_JSON="$(build_files_json "${OTHER_PATHS[@]}")"

    if [[ -z "$PROJECT_ROOT" || ! -f "$PROJECT_ROOT/.pre-commit-config.yaml" ]]; then
        output_json "true" "unknown" "$OPERATION" "$OTHER_FILES_JSON" "[]" "No linter configured for this file type"
        exit 0
    fi

    if ! command -v pre-commit &> /dev/null; then
        output_json "true" "unknown" "$OPERATION" "$OTHER_FILES_JSON" "[]" "No linter configured for this file type (pre-commit config exists but pre-commit not installed)"
        exit 0
    fi

    # Expand all paths into a flat file list
    EXPANDED=()
    for p in "${OTHER_PATHS[@]}"; do
        if [[ -f "$p" ]]; then
            EXPANDED+=("$p")
        elif [[ -d "$p" ]]; then
            while IFS= read -r -d '' f; do
                EXPANDED+=("$f")
            done < <(find "$p" -type f -not -path '*/.git/*' -print0 2>/dev/null)
        else
            EXPANDED+=("$p")
        fi
    done

    if [[ ${#EXPANDED[@]} -eq 0 ]]; then
        output_json "true" "unknown" "$OPERATION" "[]" "[]" "No files to check"
        exit 0
    fi

    EXPANDED_FILES_JSON="$(build_files_json "${EXPANDED[@]}")"

    cd "$PROJECT_ROOT"
    set +e
    PRECOMMIT_OUTPUT=$(pre-commit run --files "${EXPANDED[@]}" 2>&1)
    PRECOMMIT_EXIT=$?
    set -e

    if [[ $PRECOMMIT_EXIT -eq 0 ]]; then
        output_json "true" "unknown" "$OPERATION" "$EXPANDED_FILES_JSON" "[]" "Ran pre-commit checks successfully"
        exit 0
    elif [[ $PRECOMMIT_EXIT -eq 1 ]]; then
        output_json "true" "unknown" "$OPERATION" "$EXPANDED_FILES_JSON" "[]" "Pre-commit found issues"
        exit 0
    else
        output_json "false" "unknown" "$OPERATION" "$EXPANDED_FILES_JSON" "[]" "pre-commit failed: $PRECOMMIT_OUTPUT"
        exit 1
    fi
fi

# Defensive guard: no paths in either group (unreachable after validation)
output_json "true" "unknown" "$OPERATION" "[]" "[]" "No files found"
exit 0
