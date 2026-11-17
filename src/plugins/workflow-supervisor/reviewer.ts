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

function envelope(input: {
  evidencePath: string
  eventsPath: string
  provenance: Record<string, any>
  explicit?: boolean
}): string {
  const request = input.explicit
    ? "User request: explicit checkpoint requested by the calling session; no automatic trigger."
    : "User request: none — automatic execution-completion checkpoint; no transition requested."
  return [
    request,
    "",
    "Mode: checkpoint",
    "",
    `Evidence: ${input.evidencePath}`,
    `Chronological events: ${input.eventsPath}`,
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
}): Promise<{ sessionID: string; report: string; usage: any }> {
  const session = await input.client.session.create({
    agent: "workflow-reviewer",
    location: { directory: input.location },
  })
  const sessionID = session.id

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
}
