---
description: Independently review current work against the agreed design and workflow
---

Prepare an independent workflow review. Normally the argument is only a design or contract path. The user may explicitly request `full`; otherwise the mode is `checkpoint`. Do not infer `full` from a clean tree, a contract's status, or an approaching finish gate.

User's actual request:
$ARGUMENTS

Working-tree status captured when this command expanded:
!`git status --short`

Tracked changes against HEAD captured when this command expanded:
!`git diff HEAD -- .`

Orchestrate logistics only:

1. For `checkpoint`, supply only the captured working-tree status and diff (including untracked paths), files attached to this invocation, and evidence explicitly named in the user's request. A file's presence in the worktree does not make it an attachment. Do not proactively read or forward previous review diffs, test logs, or session exports, and never reuse historical test output as current evidence; if fresh evidence is material and absent, mark it missing. Leave raw status unchanged so prior artifacts remain visible for scope and clean-tree gates. Do not automatically collect branch history or run the full suite. If there are no current changes or supplied evidence, do not launch a review; tell the user that `full` is available for branch-wide review.
2. For `full`, determine the comparison base from the user's request or the repository's documented branch workflow. Ask the user if it is ambiguous. Collect the complete base-to-HEAD diff and chronological commit list without summarizing or truncating them. Save the raw diff as `.opencode/workflow-review/base-to-head.diff` in the target project. Unless fresh applicable test output is already supplied, delegate the project's documented test command to the test subagent in plain form from the project root; do not run tests yourself. Save its raw output as `.opencode/workflow-review/test-output.log` and record the exit status. Record when no applicable suite exists. Use the write tool or copy automatically captured raw shell output; do not use shell redirects. Keep every evidence artifact inside the target project, never in an external cache or temporary directory.
3. Launch the `workflow-reviewer` subagent with exactly this delegation envelope:

   User request: the user's actual request above
   Mode: checkpoint | full
   Evidence: the raw captured output, attachments to this invocation, and project-local evidence paths
   Provenance: the exact commands, comparison base, paths, and test exit status

4. Do not add anything else to the delegation. Do not prescribe contract sections, review questions, tools, skills, output format, severity criteria, or findings. Do not summarize, elide, reorder, correct, or relabel raw evidence. Every referenced artifact must be inside the target project and readable by the reviewer. The reviewer owns contract interpretation, review method, stopping decisions, and the report.
5. When the review arrives, present its mode, verdict, findings, and missing evidence without performing a second review or appending your own findings. Do not implement corrections or advance a phase.

Create only the project-local review artifacts named above; do not edit the work under review. Leave the artifacts in place for the user to inspect, retain, or clean up. The user retains transition authority.
