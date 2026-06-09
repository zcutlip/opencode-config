#!/usr/bin/env bash
set -euo pipefail

# Python linting handler using Ruff
# Usage: python.sh <operation> <path>
# Operations: check | fix | format

OPERATION="${1:-}"
TARGET_PATH="${2:-}"

# JSON escape helper
json_escape() {
    printf '%s' "$1" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()), end="")'
}

# Output JSON result
output_json() {
    local success="$1"
    local operation="$2"
    local files="$3"
    local issues="$4"
    local message="$5"

    cat <<EOF
{
  "success": $success,
  "language": "python",
  "operation": "$operation",
  "files": $files,
  "issues": $issues,
  "message": $(json_escape "$message")
}
EOF
}

# Check if ruff is available
if ! command -v ruff &> /dev/null; then
    output_json "false" "$OPERATION" "[]" "[]" "ruff not found in PATH"
    exit 1
fi

# Collect files to process
FILES=()
if [[ -f "$TARGET_PATH" ]]; then
    FILES+=("$TARGET_PATH")
elif [[ -d "$TARGET_PATH" ]]; then
    while IFS= read -r -d '' file; do
        FILES+=("$file")
    done < <(find "$TARGET_PATH" -name "*.py" -type f -print0 2>/dev/null || true)
fi

if [[ ${#FILES[@]} -eq 0 ]]; then
    output_json "true" "$OPERATION" "[]" "[]" "No Python files found"
    exit 0
fi

# Build files JSON array
FILES_JSON="["
for i in "${!FILES[@]}"; do
    if [[ $i -gt 0 ]]; then
        FILES_JSON+=", "
    fi
    FILES_JSON+="\"${FILES[$i]}\""
done
FILES_JSON+="]"

# Execute based on operation
case "$OPERATION" in
    check)
        # Run ruff check with JSON output
        if OUTPUT=$(ruff check --output-format=json "${FILES[@]}" 2>&1); then
            # No violations found
            output_json "true" "check" "$FILES_JSON" "[]" "No issues found"
        else
            EXIT_CODE=$?
            if [[ $EXIT_CODE -eq 1 ]]; then
                # Violations found - parse them
                if echo "$OUTPUT" | python3 -c "import json,sys; json.load(sys.stdin)" 2>/dev/null; then
                    # Valid JSON output
                    output_json "true" "check" "$FILES_JSON" "$OUTPUT" "Found issues"
                else
                    # Non-JSON output (shouldn't happen with --output-format=json)
                    output_json "true" "check" "$FILES_JSON" "[]" "$OUTPUT"
                fi
            else
                # Actual error
                output_json "false" "check" "$FILES_JSON" "[]" "ruff check failed: $OUTPUT"
            fi
        fi
        ;;

    check-fix)
        # Run ruff check with auto-fix
        if OUTPUT=$(ruff check --fix --show-fixes "${FILES[@]}" 2>&1); then
            output_json "true" "check-fix" "$FILES_JSON" "[]" "No issues found"
        else
            EXIT_CODE=$?
            if [[ $EXIT_CODE -eq 1 ]]; then
                output_json "true" "check-fix" "$FILES_JSON" "[]" "$OUTPUT"
            else
                output_json "false" "check-fix" "$FILES_JSON" "[]" "ruff check --fix failed: $OUTPUT"
            fi
        fi
        ;;

    format)
        # Full format pipeline: isort-style imports then format
        MESSAGES=()

        # Step 1: Organize imports
        if ruff check --select I --fix "${FILES[@]}" 2>&1; then
            MESSAGES+=("✓ Organized imports")
        fi

        # Step 2: Format
        if OUTPUT=$(ruff format "${FILES[@]}" 2>&1); then
            MESSAGES+=("✓ Formatted code")
            output_json "true" "format" "$FILES_JSON" "[]" "${MESSAGES[*]}"
        else
            output_json "false" "format" "$FILES_JSON" "[]" "ruff format failed: $OUTPUT"
        fi
        ;;

    fix)
        # Combined workflow: fix lints then format
        MESSAGES=()

        # Step 1: Fix lint issues
        if OUTPUT=$(ruff check --fix --show-fixes "${FILES[@]}" 2>&1); then
            MESSAGES+=("✓ No lint issues")
        else
            MESSAGES+=("✓ Fixed lint issues")
        fi

        # Step 2: Organize imports
        if ruff check --select I --fix "${FILES[@]}" 2>&1; then
            MESSAGES+=("✓ Imports organized")
        fi

        # Step 3: Format
        if ruff format "${FILES[@]}" 2>&1; then
            MESSAGES+=("✓ Code formatted")
        fi

        output_json "true" "fix" "$FILES_JSON" "[]" "${MESSAGES[*]}"
        ;;

    *)
        output_json "false" "$OPERATION" "$FILES_JSON" "[]" "Invalid operation: $OPERATION"
        exit 1
        ;;
esac
