// Contract test 15: evaluate the real agent permission fence without editing files.
// Uses the documented session.permission.create API against a disposable session.

import { mkdir } from "node:fs/promises"
import { dirname, join } from "node:path"

const repository = process.cwd()
const expected = {
  policy: "deny",
  state: "deny",
  control: "deny",
  unrelated: "allow",
} as const

const resources = {
  policy: join(repository, ".opencode/workflow.jsonc"),
  state: join(repository, ".opencode/workflow-state/permission-probe.txt"),
  // Existing filename-anchored deny, independent of the workflow fence: proves
  // the evaluation endpoint can return deny rather than always allowing.
  control: join(repository, "docs/permission-probe/opencode.json"),
  unrelated: join(repository, "docs/permission-probe-unrelated.txt"),
}

function api(method: string, path: string, body?: unknown): any {
  const args = ["opencode", "api", method, path]
  if (body !== undefined) args.push("--data", JSON.stringify(body))
  const result = Bun.spawnSync(args, {
    cwd: repository,
    stdout: "pipe",
    stderr: "pipe",
  })
  if (result.exitCode !== 0) {
    throw new Error(`${method} ${path} failed: ${result.stderr.toString() || result.stdout.toString()}`)
  }
  const text = result.stdout.toString().trim()
  return text ? JSON.parse(text) : null
}

const created = api("post", "/api/session", {
  title: "workflow-permission-probe",
  agent: "build",
  location: { directory: repository },
})
const sessionID = created.data.id as string

let results: Record<keyof typeof expected, string>
try {
  results = Object.fromEntries(
    Object.entries(resources).map(([name, resource]) => {
      const response = api("post", `/api/session/${sessionID}/permission`, {
        action: "edit",
        resources: [resource],
        agent: "build",
      })
      return [name, response.data.effect]
    }),
  ) as Record<keyof typeof expected, string>
} finally {
  api("delete", `/api/session/${sessionID}`)
}

const ok = Object.entries(expected).every(([name, effect]) => results[name as keyof typeof expected] === effect)
const report = JSON.stringify({ sessionID, expected, results, ok }, null, 2)
const outputPath = process.argv[2]
if (outputPath) {
  await mkdir(dirname(outputPath), { recursive: true })
  await Bun.write(outputPath, `${report}\n`)
}
console.log(report)
process.exitCode = ok ? 0 : 1
