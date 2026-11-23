import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import {
  ancestorConfigs,
  describeResult,
  existingProjectConfig,
  initProjectConfig,
  PROJECT_CONFIG_FILES,
  STUB_CONFIG,
  TARGET_FILE,
  type InitIo,
} from "./init.ts"

/** In-memory filesystem: `exists` is membership, `write` is create-only. */
function fakeIo(files: readonly string[] = []) {
  const contents = new Map<string, string>(files.map((file) => [file, ""]))
  const io: InitIo = {
    exists: (path) => contents.has(path),
    write: (path, content) => {
      if (contents.has(path)) throw Object.assign(new Error("EEXIST"), { code: "EEXIST" })
      contents.set(path, content)
    },
  }
  return { io, contents }
}

const project = "/work/app"
const target = join(project, TARGET_FILE)

describe("existingProjectConfig", () => {
  for (const file of PROJECT_CONFIG_FILES) {
    test(`detects ${file}`, () => {
      const { io } = fakeIo([join(project, file)])
      expect(existingProjectConfig(project, io)).toBe(join(project, file))
    })
  }

  test("reports undefined for a bare project", () => {
    const { io } = fakeIo()
    expect(existingProjectConfig(project, io)).toBeUndefined()
  })
})

describe("initProjectConfig", () => {
  test("creates the target when the project has no config", () => {
    const { io, contents } = fakeIo()
    const result = initProjectConfig(project, io)
    expect(result.status).toBe("created")
    expect(result.path).toBe(target)
    expect(result.ancestors).toEqual([])
    expect(contents.get(target)).toBe(STUB_CONFIG)
  })

  for (const file of PROJECT_CONFIG_FILES) {
    test(`skips when ${file} exists`, () => {
      const existing = join(project, file)
      const { io, contents } = fakeIo([existing])
      const result = initProjectConfig(project, io)
      expect(result.status).toBe("exists")
      if (result.status !== "exists") return
      expect(result.existing).toBe(existing)
      expect(contents.get(target)).not.toBe(STUB_CONFIG)
    })
  }

  test("is idempotent: the second run skips its own output", () => {
    const { io } = fakeIo()
    expect(initProjectConfig(project, io).status).toBe("created")
    const second = initProjectConfig(project, io)
    expect(second.status).toBe("exists")
    if (second.status !== "exists") return
    expect(second.existing).toBe(target)
  })

  test("reports ancestor configs without blocking creation", () => {
    const ancestor = "/work/opencode.jsonc"
    const { io } = fakeIo([ancestor])
    const result = initProjectConfig(project, io)
    expect(result.status).toBe("created")
    expect(result.ancestors).toEqual([ancestor])
  })

  test("never clobbers a file that appears after the existence check", () => {
    const { io, contents } = fakeIo()
    io.write(target, "raced")
    const result = initProjectConfig(project, io)
    expect(result.status).toBe("exists")
    expect(contents.get(target)).toBe("raced")
  })

  test("surfaces unexpected write failures", () => {
    const io: InitIo = {
      exists: () => false,
      write: () => {
        throw Object.assign(new Error("read-only fs"), { code: "EROFS" })
      },
    }
    const result = initProjectConfig(project, io)
    expect(result.status).toBe("failed")
    if (result.status !== "failed") return
    expect(result.error).toBe("read-only fs")
  })
})

describe("ancestorConfigs", () => {
  test("walks every parent and skips the project itself", () => {
    const { io } = fakeIo([join(project, "opencode.json"), "/work/opencode.json"])
    expect(ancestorConfigs(project, io)).toEqual(["/work/opencode.json"])
  })

  test("returns nothing when only the project is configured", () => {
    const { io } = fakeIo([join(project, "opencode.json")])
    expect(ancestorConfigs(project, io)).toEqual([])
  })
})

describe("describeResult", () => {
  test("names the blocking file on a skip", () => {
    const line = describeResult({
      status: "exists",
      path: target,
      existing: join(project, "opencode.json"),
      ancestors: [],
    })
    expect(line).toBe(`skipped: ${join(project, "opencode.json")} already exists (nothing written)`)
  })

  test("appends ancestor notes", () => {
    const text = describeResult({ status: "created", path: target, ancestors: ["/work/opencode.json"] })
    expect(text.split("\n")).toEqual([
      `created: ${target}`,
      "info: ancestor config /work/opencode.json also merges into this project",
    ])
  })
})

describe("stub", () => {
  test("is valid JSONC", () => {
    // JSONC = line comments plus trailing commas; strip both, then require
    // plain JSON so editors and OpenCode's parser see the same document.
    const stripped = STUB_CONFIG.replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1")
    expect(() => JSON.parse(stripped)).not.toThrow()
  })

  test("has no absolute paths and no populated settings", () => {
    expect(STUB_CONFIG).toContain('"$schema": "https://opencode.ai/config.json"')
    expect(STUB_CONFIG).toContain('"permissions": []')
    expect(STUB_CONFIG).toContain('"plugins": []')
    expect(STUB_CONFIG).toContain('"agents": {}')
  })
})
