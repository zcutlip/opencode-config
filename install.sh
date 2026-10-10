#!/usr/bin/env sh
set -eu

# install.sh — bootstrap the opencode-config repo as OpenCode's live config.
# OpenCode reads ~/.config/opencode; we symlink that to this repo's src/.

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"
SRC_DIR="$REPO_ROOT/src"

# 1. Pull the humanizer skill (and any future) submodule.
git -C "$REPO_ROOT" submodule update --init --recursive

# 2. Symlink into place, handling an existing target safely.
if [ -L "$CONFIG_DIR" ]; then
	LINK_TARGET="$(readlink "$CONFIG_DIR")"
	if [ "$LINK_TARGET" = "$REPO_ROOT" ]; then
		ln -sfn "$SRC_DIR" "$CONFIG_DIR"
		echo "Migrated symlink $CONFIG_DIR -> $SRC_DIR (was $REPO_ROOT)"
	elif [ "$LINK_TARGET" = "$SRC_DIR" ]; then
		echo "Already symlinked correctly: $CONFIG_DIR -> $SRC_DIR"
	else
		echo "Already symlinked elsewhere: $CONFIG_DIR -> $LINK_TARGET"
	fi
elif [ -e "$CONFIG_DIR" ]; then
	BACKUP="$CONFIG_DIR.bak.$(date +%s)"
	echo "Backing up existing $CONFIG_DIR to $BACKUP"
	mv "$CONFIG_DIR" "$BACKUP"
	ln -s "$SRC_DIR" "$CONFIG_DIR"
	echo "Symlinked $CONFIG_DIR -> $SRC_DIR"
else
	ln -s "$SRC_DIR" "$CONFIG_DIR"
	echo "Symlinked $CONFIG_DIR -> $SRC_DIR"
fi

# 3. Make the oc-permissions CLI available on PATH (if ~/.local/bin exists).
TOOL_SRC="$REPO_ROOT/src/scripts/oc-permissions.py"
BIN_DIR="$HOME/.local/bin"
if [ -x "$TOOL_SRC" ] && [ -d "$BIN_DIR" ]; then
	ln -sfn "$TOOL_SRC" "$BIN_DIR/oc-permissions"
	echo "Symlinked $BIN_DIR/oc-permissions -> $TOOL_SRC"
fi

# 4. Optional Node deps (only needed to edit the TypeScript plugin).
if [ "${1:-}" = "--with-deps" ]; then
	(cd "$REPO_ROOT" && npm install)
fi

echo "Done. Restart OpenCode (or start a new session) to load the config."
