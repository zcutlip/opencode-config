import { isFollowUpRequest } from "./steering.ts"
import { IncidentLog } from "./incidents.ts"

export class ReviewerTimeoutError extends Error {
  constructor(message = "Reviewer timed out") {
    super(message)
    this.name = "ReviewerTimeoutError"
  }
}

export class ReviewerFailedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ReviewerFailedError"
  }
}

function reportFrom(messages: any[]): string {
  const parts: string[] = []
  for (const message of messages) {
    if (message?.type !== "assistant") continue
    for (const part of message.content ?? []) {
      if (part?.type === "text" && typeof part.text === "string") parts.push(part.text)
    }
  }
  return parts.join("\n").trim()
}

export function envelope(input: {
  evidencePath: string
  eventsPath: string
  provenance: Record<string, any>
  explicit?: boolean
  latestUserRequest?: string
  latestAssistantText?: string
  turnNoop?: boolean
  changedFiles?: string[]
  turnFiles?: string[]
  steeringHistory?: { count: number; latest?: string }
  question?: string
}): string {
  // /ws-review <question> — the typed question is the assignment: it
  // replaces the generic explicit-trigger request line, and the review
  // answers it directly. It takes precedence over the follow-up and
  // no-op markers, which describe automatic turns.
  const question =
    typeof input.question === "string" && input.question.trim() !== ""
      ? input.question.trim()
      : undefined
  const request = question !== undefined
    ? `User request (typed by the user at the review trigger): ${question}`
    : input.explicit
      ? "User request: explicit checkpoint requested by the calling session; no automatic trigger."
      : typeof input.latestUserRequest === "string" && input.latestUserRequest.trim() !== ""
        ? `User request: ${input.latestUserRequest.trim()}`
        : "User request: none — automatic execution-completion checkpoint; no transition requested."
  const questionAssignment = question !== undefined
    ? "Assignment: answer the user's question directly. Judge the work as it stands against the contract; the verdict states the answer — SUPPORTS_TRANSITION if the question asks about proceeding and the evidence supports it, otherwise CONCERNS or INSUFFICIENT_EVIDENCE with the findings that block it. This is a report-only review: nothing from it is delivered to the builder; the user reads the verdict on the badge and in the report."
    : undefined
  // A13 — the request under review is the supervisor's own delivered
  // findings: this is a follow-up review, scoped to resolution and the
  // response's own changes, never a fresh audit of the stage.
  const followUp = question === undefined && !input.explicit && isFollowUpRequest(input.latestUserRequest)
  const assignment = followUp
    ? "Assignment: follow-up review. Verify each previously delivered finding against the current tree — resolved, unresolved, or worsened — and check the response's own changes for new defects. Do not re-audit unchanged ground; new findings beyond the response's changes belong to the next stage checkpoint, not this one."
    : undefined
  // A15 — a turn that positively changed no files is marked here, with its
  // claims inlined, so the review is judged on the claims without
  // re-reading the whole evidence. A follow-up marker takes precedence
  // when both apply.
  const noop = input.turnNoop === true && !followUp && question === undefined
  const noopAssignment = noop
    ? "Assignment: no-op turn — the turn's captured steps changed no files. Judge only the claims made in the turn's messages, inlined below; spot-check specific claims against the tree as needed. Do not re-audit unchanged ground and raise no findings beyond the turn's claims."
    : undefined
  const claims =
    noop && typeof input.latestAssistantText === "string" && input.latestAssistantText.trim() !== ""
      ? input.latestAssistantText.trim()
      : undefined
  // A16 — attribution. The observed turn's own file changes are stated
  // separately from the shared working tree, which includes other sessions'
  // uncommitted work in the same folder; a no-file turn is stated, not blank.
  const treeFiles = Array.isArray(input.changedFiles)
    ? Array.from(new Set(input.changedFiles.filter((file) => typeof file === "string")))
    : []
  const turnFiles = Array.isArray(input.turnFiles)
    ? Array.from(new Set(input.turnFiles.filter((file) => typeof file === "string")))
    : undefined
  const attribution =
    turnFiles === undefined
      ? treeFiles.length > 0
        ? [`Changed files: ${treeFiles.join(", ")}`]
        : []
      : [
          `Turn changes: ${turnFiles.length > 0 ? turnFiles.join(", ") : "none"}`,
          ...(treeFiles.length > 0 ? [`Working tree, all sessions: ${treeFiles.join(", ")}`] : []),
        ]
  // A16 — a capture forced before its evidence settled says why: the
  // reviewer records an unwitnessed gate instead of judging a hollow one.
  const defer = input.provenance?.defer
  const deferNote =
    defer !== undefined && defer !== null
      ? `Defer note: checkpoint was held ${Number(defer.heldMs ?? 0)}ms with ${Number(defer.childrenInFlight ?? 0)} helper(s) in flight${defer.blockedOnPermission === true ? "; the gate evidence was blocked on a pending permission decision" : ""}.`
      : undefined
  const history = (input.steeringHistory?.count ?? 0) > 0
    ? `Previously delivered steering: ${input.steeringHistory?.count} message(s), latest ${input.steeringHistory?.latest}. Findings repeating them are reported as "previously steered, still unresolved" — never as new.`
    : "Previously delivered steering: none in the evidence."
  return [
    request,
    ...(attribution.length === 0 ? [] : ["", ...attribution]),
    ...(deferNote === undefined ? [] : ["", deferNote]),
    "",
    "Mode: checkpoint",
    ...(questionAssignment !== undefined
      ? ["", questionAssignment]
      : [
          ...(assignment === undefined ? [] : ["", assignment]),
          ...(noopAssignment === undefined
            ? []
            : [
                "",
                noopAssignment,
                ...(claims === undefined ? [] : ["", "Turn claims (assistant, verbatim):", claims]),
              ]),
        ]),
    "",
    `Evidence: ${input.evidencePath}`,
    `Chronological events: ${input.eventsPath}`,
    "",
    history,
    "",
    `Provenance: ${JSON.stringify(input.provenance)}`,
  ].join("\n")
}

export async function runReviewer(input: {
  client: any
  location: string
  contractPath: string
  evidencePath: string
  eventsPath: string
  provenance: Record<string, any>
  timeoutMs: number
  explicit?: boolean
  latestUserRequest?: string
  latestAssistantText?: string
  turnNoop?: boolean
  changedFiles?: string[]
  turnFiles?: string[]
  steeringHistory?: { count: number; latest?: string }
  question?: string
}): Promise<{ sessionID: string; report: string; usage: any }> {
  const session = await input.client.session.create({
    agent: "workflow-reviewer",
    location: { directory: input.location },
  })
  const sessionID = session.id

  try {
    await input.client.session.prompt({
      sessionID,
      text: envelope(input),
    })

    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new ReviewerTimeoutError()), input.timeoutMs)
    })

    try {
      await Promise.race([input.client.session.wait({ sessionID }), timeout])
    } catch (error) {
      if (error instanceof ReviewerTimeoutError) {
        await input.client.session.interrupt({ sessionID, resume: false })
        throw error
      }
      throw error
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }

    const record = await input.client.session.get({ sessionID })
    if (record?.outcome !== "succeeded") {
      throw new ReviewerFailedError(`Reviewer outcome was ${record?.outcome ?? "unknown"}`)
    }

    const report = reportFrom(await input.client.session.context({ sessionID }))
    if (report === "") throw new ReviewerFailedError("Reviewer returned an empty report")

    return {
      sessionID,
      report,
      usage: {
        tokens: record.tokens,
        cost: record.cost,
        elapsedMs: (record.time?.updated ?? 0) - (record.time?.created ?? 0),
      },
    }
  } finally {
    await archiveReviewerSession(input.client, sessionID, input.location)
  }
}

/**
 * A14 hygiene — archive the reviewer session, verified against the host's
 * observable state. Both known call forms have dead-lettered through the
 * plugin's session wrapper: the typed `time.archived` body no-ops
 * server-side, and a flat `archived` key never survives the wrapper. The
 * raw SDK client, when the context exposes one (`ctx.client`), sends bodies
 * verbatim — try that channel first, fall back to the typed form, then GET
 * the record and log whether the host actually archived. A silently
 * no-opping cleanup is how /sessions got polluted; an unverified archive is
 * recorded as an incident so sweeps catch it from the log, not from the
 * user's session list.
 */
async function archiveReviewerSession(client: any, sessionID: string, location: string): Promise<void> {
  const channel = typeof client?.client?.session?.update === "function" ? "sdk" : "wrapper"
  try {
    if (channel === "sdk") {
      await client.client.session.update({ path: { sessionID }, body: { archived: true } })
    } else {
      await client.session.update({ sessionID, time: { archived: Date.now() } })
    }
    const record = await client.session.get({ sessionID }).catch(() => null)
    const archived = record != null && (record.archived === true || record?.time?.archived != null)
    console.log(`[workflow-supervisor] reviewer session ${sessionID} archive via ${channel}: ${archived ? "verified" : "NOT archived"}`)
    if (!archived) {
      void new IncidentLog(location)
        .record({ kind: "archive_unverified", sessionID, detail: channel })
        .catch(() => {})
    }
  } catch (error) {
    console.warn("[workflow-supervisor] reviewer session archive failed", {
      sessionID,
      channel,
      error: String(error),
    })
    void new IncidentLog(location)
      .record({ kind: "archive_failed", sessionID, detail: channel })
      .catch(() => {})
  }
}
