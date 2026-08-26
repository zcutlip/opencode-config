## Developer Setup

- **Requires [Bun](https://bun.sh)** — install it if you haven't.
- `bun install` — install dependencies
- `bun run lint` — run ESLint (flat config)
- `bun run typecheck` — type-check with `tsc --noEmit`
- `bun test` — run the test suite

No build step is needed; OpenCode loads the plugin `.ts` files directly.
