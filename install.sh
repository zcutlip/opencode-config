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

# 3. Optional Node deps (only needed to edit the TypeScript plugin).
if [ "${1:-}" = "--with-deps" ]; then
	(cd "$REPO_ROOT" && npm install)
fi

echo "Done. Restart OpenCode (or start a new session) to load the config."
