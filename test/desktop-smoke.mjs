// Runs against the real desktop container, with a fake Muse site hosted INSIDE that container.
// No production account, cookie, conversation or external Muse request is used.
import assert from "node:assert/strict"
import http from "node:http"
import { randomBytes } from "node:crypto"

const base = process.env.DESKTOP_TEST_URL || "http://127.0.0.1:6080"
const publicBase = process.env.MUSE_WEB_PUBLIC_URL || base
const key = process.env.MUSE_WEB_ENGINE_KEY
const user = process.env.DESKTOP_USER || "muse"
const password = process.env.DESKTOP_PASSWORD
assert.ok(key && password, "Set the private test credentials in the environment")
const bearer = { authorization: `Bearer ${key}` }
const basic = { authorization: `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}` }
const health = await fetch(`${base}/v1/health`)
assert.equal(health.status, 200)
assert.equal((await health.json()).engine, "muse-web")
assert.equal((await fetch(`${base}/desktop/vnc.html`)).status, 401)
assert.equal((await fetch(`${base}/desktop/websockify`)).status, 401)
assert.equal((await fetch(`${base}/desktop/vnc.html`, { headers: basic })).status, 200)
assert.equal((await fetch(`${base}/v1/login`, { method: "POST" })).status, 401)

// A real RFB greeting proves the authenticated WebSocket reaches x11vnc, not just a static page.
await new Promise((resolve, reject) => {
  const url = new URL("/desktop/websockify", base)
  const req = http.request(url, { headers: { ...basic, connection: "Upgrade", upgrade: "websocket", "sec-websocket-key": randomBytes(16).toString("base64"), "sec-websocket-version": "13", "sec-websocket-protocol": "binary" } })
  req.setTimeout(10000, () => req.destroy(new Error("VNC handshake timed out")))
  req.on("error", reject)
  req.on("response", res => reject(new Error(`Expected 101; got ${res.statusCode}`)))
  req.on("upgrade", (res, socket, head) => {
    let buf = head
    const timeout = setTimeout(() => { socket.destroy(); reject(new Error("No RFB greeting")) }, 10000)
    const read = chunk => {
      buf = Buffer.concat([buf, chunk])
      if (buf.length < 14) return
      clearTimeout(timeout)
      try {
        assert.equal(res.statusCode, 101)
        assert.equal(buf[0] & 15, 2)
        assert.match(buf.subarray(2, 14).toString(), /^RFB 003\.\d{3}\n$/)
        resolve()
      } catch (err) { reject(err) }
      socket.destroy()
    }
    socket.on("error", reject)
    socket.on("data", read)
    if (head.length) { buf = Buffer.alloc(0); read(head) }
  })
  req.end()
})

const login = await (await fetch(`${base}/v1/login`, { method: "POST", headers: bearer })).json()
assert.equal(login.url, `${publicBase}/login/${login.id}`)
const statusPage = `${base}/login/${login.id}`
assert.equal((await fetch(statusPage)).status, 401)
const page = await (await fetch(statusPage, { headers: basic })).text()
assert.match(page, /打开远程登录桌面/)
let state
for (let i = 0; i < 120; i++) {
  state = await (await fetch(`${base}/v1/login/${login.id}`, { headers: bearer })).json()
  if (["done", "failed"].includes(state.status)) break
  await new Promise(resolve => setTimeout(resolve, 1000))
}
assert.equal(state.status, "done", state.error || state.step)
const reply = await fetch(`${base}/v1/chat/completions`, {
  method: "POST", headers: { ...bearer, "x-muse-account": state.handle, "content-type": "application/json" },
  body: JSON.stringify({ model: "muse-spark", stream: false, messages: [{ role: "user", content: "REPLY:desktop-ok" }] }),
})
assert.equal(reply.status, 200)
assert.equal((await reply.json()).choices[0].message.content, "desktop-ok")
console.log("PASS: desktop HTTP auth, WebSocket auth + RFB greeting, remote login URL, headful Chromium login, session persistence and Chat Completions")
