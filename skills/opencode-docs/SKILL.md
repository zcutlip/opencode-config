---
name: opencode-docs
description: OpenCode Docs helper. Looks up official documentation on OpenCode features plus unofficial gap documentation.
---
Execute the OpenCode Docs helper script at ~/.opencode-docs/opencode-docs-helper.sh

Examples of expected output:

When reading a doc:
📚 COMMUNITY MIRROR: https://codeberg.org/zcutlip/opencode-docs
📖 OFFICIAL DOCS: https://opencode.ai/docs

[Doc content here...]

📖 Official page: https://opencode.ai/docs/hooks

When showing what's new:
📚 Recent documentation updates:

• 5 hours ago:
  📎 https://codeberg.org/zcutlip/opencode-docs/commit/eacd8e1
  📄 data-usage: https://opencode.ai/docs/data-usage
     ➕ Added: Privacy safeguards
  📄 security: https://opencode.ai/docs/security
     ✨ Data flow and dependencies section moved here

📎 Full changelog: https://codeberg.org/zcutlip/opencode-docs/commits/branch/main/docs
📚 COMMUNITY MIRROR - NOT AFFILIATED WITH OPENCODE

Every request checks for the latest documentation from GitHub (takes ~0.4s).
The helper script handles all functionality including on-demand updates.

Execute: ~/.opencode-docs/opencode-docs-helper.sh $ARGUMENTS
