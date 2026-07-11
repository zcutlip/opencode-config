#!/usr/bin/env sh
set -eu

# install.sh — bootstrap the opencode-config repo as OpenCode's live config.
# OpenCode reads ~/.config/opencode; we symlink that to this repo.

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"

# 1. Pull the humanizer skill (and any future) submodule.
git -C "$REPO_ROOT" submodule update --init --recursive

# 2. Symlink into place, handling an existing target safely.
if [ -L "$CONFIG_DIR" ]; then
	echo "Already symlinked: $CONFIG_DIR -> $(readlink "$CONFIG_DIR")"
elif [ -e "$CONFIG_DIR" ]; then
	BACKUP="$CONFIG_DIR.bak.$(date +%s)"
	echo "Backing up existing $CONFIG_DIR to $BACKUP"
	mv "$CONFIG_DIR" "$BACKUP"
	ln -s "$REPO_ROOT" "$CONFIG_DIR"
	echo "Symlinked $CONFIG_DIR -> $REPO_ROOT"
else
	ln -s "$REPO_ROOT" "$CONFIG_DIR"
	echo "Symlinked $CONFIG_DIR -> $REPO_ROOT"
fi

# 3. Optional Node deps (only needed to edit the TypeScript plugin).
if [ "${1:-}" = "--with-deps" ]; then
	(cd "$REPO_ROOT" && npm install)
fi

echo "Done. Restart OpenCode (or start a new session) to load the config."
