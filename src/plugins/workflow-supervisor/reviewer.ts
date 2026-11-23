import { isFollowUpRequest } from "./steering.ts"

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
  changedFiles?: string[]
  steeringHistory?: { count: number; latest?: string }
}): string {
  const request = input.explicit
    ? "User request: explicit checkpoint requested by the calling session; no automatic trigger."
    : typeof input.latestUserRequest === "string" && input.latestUserRequest.trim() !== ""
      ? `User request: ${input.latestUserRequest.trim()}`
      : "User request: none — automatic execution-completion checkpoint; no transition requested."
  // A13 — the request under review is the supervisor's own delivered
  // findings: this is a follow-up review, scoped to resolution and the
  // response's own changes, never a fresh audit of the stage.
  const followUp = !input.explicit && isFollowUpRequest(input.latestUserRequest)
  const assignment = followUp
    ? "Assignment: follow-up review. Verify each previously delivered finding against the current tree — resolved, unresolved, or worsened — and check the response's own changes for new defects. Do not re-audit unchanged ground; new findings beyond the response's changes belong to the next stage checkpoint, not this one."
    : undefined
  const changedFiles = Array.isArray(input.changedFiles) && input.changedFiles.length > 0
    ? `Changed files: ${Array.from(new Set(input.changedFiles.filter((file) => typeof file === "string"))).join(", ")}`
    : undefined
  const history = (input.steeringHistory?.count ?? 0) > 0
    ? `Previously delivered steering: ${input.steeringHistory?.count} message(s), latest ${input.steeringHistory?.latest}. Findings repeating them are reported as "previously steered, still unresolved" — never as new.`
    : "Previously delivered steering: none in the evidence."
  return [
    request,
    ...(changedFiles === undefined ? [] : ["", changedFiles]),
    "",
    "Mode: checkpoint",
    ...(assignment === undefined ? [] : ["", assignment]),
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
  changedFiles?: string[]
  steeringHistory?: { count: number; latest?: string }
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
    await input.client.session.update({
      sessionID,
      time: { archived: Date.now() },
    }).catch(() => {})
  }
}
