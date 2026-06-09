#!/usr/bin/env bash
set -euo pipefail

# Main dispatcher for lint-format skill
# Usage: lint-format.sh <operation> <path>
# Operations: check | fix | format

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPERATION="${1:-}"
TARGET_PATH="${2:-}"

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

# Check arguments
if [[ -z "$OPERATION" || -z "$TARGET_PATH" ]]; then
    output_json "false" "unknown" "unknown" "[]" "[]" "Usage: lint-format.sh <operation> <path>"
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

# Check if path exists
if [[ ! -e "$TARGET_PATH" ]]; then
    output_json "false" "unknown" "$OPERATION" "[]" "[]" "Path not found: $TARGET_PATH"
    exit 1
fi

# Detect file type
detect_language() {
    local path="$1"

    # If it's a directory, check for config files
    if [[ -d "$path" ]]; then
        if [[ -f "$path/pyproject.toml" || -f "$path/setup.py" || -f "$path/requirements.txt" ]]; then
            echo "python"
            return
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

LANGUAGE=$(detect_language "$TARGET_PATH")

# Handle based on language
case "$LANGUAGE" in
    python)
        # Call Python handler
        if [[ -x "$SCRIPT_DIR/handlers/python.sh" ]]; then
            "$SCRIPT_DIR/handlers/python.sh" "$OPERATION" "$TARGET_PATH"
        else
            output_json "false" "python" "$OPERATION" "[]" "[]" "Python handler not found or not executable"
            exit 1
        fi
        ;;
    *)
        # Try pre-commit fallback
        PROJECT_ROOT=""
        if command -v git &> /dev/null; then
            PROJECT_ROOT=$(git -C "$(dirname "$TARGET_PATH")" rev-parse --show-toplevel 2>/dev/null || true)
        fi

        if [[ -n "$PROJECT_ROOT" && -f "$PROJECT_ROOT/.pre-commit-config.yaml" ]]; then
            # Run pre-commit
            if command -v pre-commit &> /dev/null; then
                cd "$PROJECT_ROOT"
                if pre-commit run --files "$TARGET_PATH" 2>&1; then
                    output_json "true" "unknown" "$OPERATION" "[\"$TARGET_PATH\"]" "[]" "Ran pre-commit checks successfully"
                else
                    output_json "false" "unknown" "$OPERATION" "[\"$TARGET_PATH\"]" "[]" "Pre-commit found issues"
                fi
            else
                output_json "true" "unknown" "$OPERATION" "[\"$TARGET_PATH\"]" "[]" "No linter configured for this file type (pre-commit config exists but pre-commit not installed)"
            fi
        else
            output_json "true" "unknown" "$OPERATION" "[\"$TARGET_PATH\"]" "[]" "No linter configured for this file type"
        fi
        ;;
esac
