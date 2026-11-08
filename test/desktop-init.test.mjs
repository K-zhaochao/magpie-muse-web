import assert from "node:assert/strict"
import { test } from "node:test"
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, rmSync, existsSync, statSync } from "node:fs"
import { spawnSync } from "node:child_process"
import os from "node:os"
import path from "node:path"

function fixture() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "mw-init-"))
  mkdirSync(path.join(dir, "deploy/desktop"), { recursive: true })
  mkdirSync(path.join(dir, "engine"))
  copyFileSync(new URL("../deploy/desktop/init.mjs", import.meta.url), path.join(dir, "deploy/desktop/init.mjs"))
  copyFileSync(new URL("../engine/remote.mjs", import.meta.url), path.join(dir, "engine/remote.mjs"))
  return { dir, script: path.join(dir, "deploy/desktop/init.mjs"), env: path.join(dir, "deploy/desktop/.env") }
}

test("desktop initializer generates private secrets once without printing them", () => {
  const fx = fixture()
  try {
    const first = spawnSync(process.execPath, [fx.script, "https://muse-login.example.com/"], { encoding: "utf8" })
    assert.equal(first.status, 0, first.stderr)
    const content = readFileSync(fx.env, "utf8")
    const secret = content.match(/^MUSE_WEB_ENGINE_KEY=([0-9a-f]{64})$/m)[1]
    const password = content.match(/^DESKTOP_PASSWORD=([0-9a-f]{48})$/m)[1]
    assert.doesNotMatch(first.stdout + first.stderr, new RegExp(`${secret}|${password}`))
    assert.match(content, /MUSE_WEB_PUBLIC_URL=https:\/\/muse-login\.example\.com\n/)
    assert.match(content, /MUSE_WEB_VERIFY_LOGIN=1/)
    if (process.platform !== "win32") assert.equal(statSync(fx.env).mode & 0o777, 0o600)
    const again = spawnSync(process.execPath, [fx.script], { encoding: "utf8" })
    assert.equal(again.status, 0)
    assert.equal(readFileSync(fx.env, "utf8"), content)
  } finally { rmSync(fx.dir, { recursive: true, force: true }) }
})

test("desktop initializer rejects embedded credentials and unsupported path-prefix deployments", () => {
  const fx = fixture()
  try {
    for (const url of ["https://u:p@example.com/", "javascript:alert(1)", "https://example.com/muse"]) {
      const res = spawnSync(process.execPath, [fx.script, url], { encoding: "utf8" })
      assert.notEqual(res.status, 0)
      assert.equal(existsSync(fx.env), false)
    }
  } finally { rmSync(fx.dir, { recursive: true, force: true }) }
})
