import assert from "node:assert/strict"
import { test } from "node:test"
import { once } from "node:events"
import { mkdtempSync, existsSync, readFileSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { remoteSettings, loginStatusURL, webURL } from "../engine/remote.mjs"
import { engineKey } from "../engine/paths.mjs"
import { createServer } from "../engine/server.mjs"

test("remote settings keep loopback defaults and validate public URLs", () => {
  assert.deepEqual(remoteSettings({}), { host: "127.0.0.1", publicURL: "", desktopURL: "" })
  assert.equal(remoteSettings({ MUSE_WEB_ENGINE_HOST: "0.0.0.0" }).host, "0.0.0.0")
  assert.equal(remoteSettings({ MUSE_WEB_PUBLIC_URL: "https://muse.example.com/" }).publicURL, "https://muse.example.com")
  assert.equal(loginStatusURL("abc", 18611), "http://127.0.0.1:18611/login/abc")
  assert.equal(loginStatusURL("a/b", 18611, "https://muse.example.com"), "https://muse.example.com/login/a%2Fb")
  for (const value of ["javascript:alert(1)", "file:///etc/passwd", "https://u:p@example.com", "https://example.com/#secret", "https://example.com/?token=secret", "/relative"]) {
    assert.throws(() => webURL(value, "url"))
  }
  assert.throws(() => remoteSettings({ MUSE_WEB_ENGINE_HOST: "http://example.com" }))
  assert.match(webURL("https://example.com/desktop/vnc.html?autoconnect=1&resize=scale", "desktop", { query: true }), /autoconnect=1/)
})

test("an explicit engine key is used without changing a stored key", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "mw-key-"))
  try {
    assert.equal(engineKey(dir, { MUSE_WEB_ENGINE_KEY: " explicit-test-key " }), "explicit-test-key")
    assert.equal(existsSync(path.join(dir, "engine.key")), false)
    const saved = engineKey(dir, {})
    assert.equal(engineKey(dir, { MUSE_WEB_ENGINE_KEY: "override" }), "override")
    assert.equal(readFileSync(path.join(dir, "engine.key"), "utf8").trim(), saved)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test("remote login URLs, escaped desktop link, auth and state lifecycle", async () => {
  const states = new Map()
  const logins = {
    async start() { states.set("login-123", { status: "pending", step: "等待登录" }); return "login-123" },
    status(id) { return states.get(id) },
  }
  const server = createServer({
    muse: {}, logins, store: { count: () => 0 }, key: "test-key",
    publicURL: "https://login.example.com/",
    desktopURL: 'https://login.example.com/desktop/vnc.html?autoconnect=1&x="quoted"',
  })
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const base = `http://127.0.0.1:${server.address().port}`
  const headers = { authorization: "Bearer test-key", host: "untrusted.example.com" }
  try {
    assert.equal((await fetch(`${base}/v1/login`, { method: "POST" })).status, 401)
    const started = await (await fetch(`${base}/v1/login`, { method: "POST", headers })).json()
    assert.equal(started.url, "https://login.example.com/login/login-123")
    assert.equal((await fetch(`${base}/v1/login/login-123`)).status, 401)
    const status = await (await fetch(`${base}/v1/login/login-123`, { headers })).json()
    assert.equal(status.status, "pending")
    let res = await fetch(`${base}/login/login-123`)
    let html = await res.text()
    assert.equal(res.headers.get("referrer-policy"), "no-referrer")
    assert.match(html, /打开远程登录桌面/)
    assert.match(html, /autoconnect=1&amp;x=%22quoted%22/)
    assert.doesNotMatch(html, /test-key|untrusted\.example\.com/)
    assert.match(html, /http-equiv="refresh"/)
    states.set("login-123", { status: "done" })
    html = await (await fetch(`${base}/login/login-123`)).text()
    assert.match(html, /登录完成/)
    assert.doesNotMatch(html, /打开远程登录桌面|http-equiv="refresh"/)
    states.set("login-123", { status: "failed", error: '<img src=x onerror="alert(1)">' })
    html = await (await fetch(`${base}/login/login-123`)).text()
    assert.match(html, /&lt;img/)
    assert.doesNotMatch(html, /<img|http-equiv="refresh"/)
    assert.equal((await fetch(`${base}/v1/login/missing`, { headers })).status, 404)
  } finally {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
})

test("local login page keeps its original workflow without a desktop link", async () => {
  const server = createServer({ muse: {}, logins: { status: () => ({ status: "pending" }) }, store: { count: () => 0 }, key: "test-key" })
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  try {
    const html = await (await fetch(`http://127.0.0.1:${server.address().port}/login/local`)).text()
    assert.match(html, /弹出的浏览器窗口/)
    assert.doesNotMatch(html, /打开远程登录桌面/)
  } finally {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
})
