// Contract test 15: evaluate the real agent permission fence without editing files.
// Uses the documented session.permission.create API against a disposable session.

import { mkdir } from "node:fs/promises"
import { dirname, join } from "node:path"

const repository = process.cwd()

// A10 (2026-11-22) adds the read probes: supervisor records are about the
// builder, not for it, so build reads on workflow state must deny while an
// unrelated file stays readable.
const probes = [
  { name: "policy", action: "edit", resource: join(repository, ".opencode/workflow.jsonc"), expected: "deny" },
  { name: "state", action: "edit", resource: join(repository, ".opencode/workflow-state/permission-probe.txt"), expected: "deny" },
  // Existing filename-anchored deny, independent of the workflow fence: proves
  // the evaluation endpoint can return deny rather than always allowing.
  { name: "control", action: "edit", resource: join(repository, "docs/permission-probe/opencode.json"), expected: "deny" },
  { name: "unrelated", action: "edit", resource: join(repository, "docs/permission-probe-unrelated.txt"), expected: "allow" },
  { name: "stateRead", action: "read", resource: join(repository, ".opencode/workflow-state/permission-probe.txt"), expected: "deny" },
  { name: "unrelatedRead", action: "read", resource: join(repository, "docs/permission-probe-unrelated.txt"), expected: "allow" },
] as const

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

let results: Record<string, string>
try {
  results = Object.fromEntries(
    probes.map((probe) => {
      const response = api("post", `/api/session/${sessionID}/permission`, {
        action: probe.action,
        resources: [probe.resource],
        agent: "build",
      })
      return [probe.name, response.data.effect]
    }),
  )
} finally {
  api("delete", `/api/session/${sessionID}`)
}

const ok = probes.every((probe) => results[probe.name] === probe.expected)
const expected = Object.fromEntries(probes.map((probe) => [probe.name, probe.expected]))
const report = JSON.stringify({ sessionID, expected, results, ok }, null, 2)
const outputPath = process.argv[2]
if (outputPath) {
  await mkdir(dirname(outputPath), { recursive: true })
  await Bun.write(outputPath, `${report}\n`)
}
console.log(report)
process.exitCode = ok ? 0 : 1
