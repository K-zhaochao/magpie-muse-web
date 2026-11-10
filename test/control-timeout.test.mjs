import assert from "node:assert/strict"
import { createServer } from "node:http"
import { once } from "node:events"
import test from "node:test"
import { MuseWebPlugin } from "../index.mjs"

test("browser login survives a slow engine response beyond the former ten-second deadline", { timeout: 30_000 }, async () => {
  const server = createServer((req, res) => {
    assert.equal(req.method, "POST")
    assert.equal(req.url, "/v1/login")
    assert.equal(req.headers.authorization, "Bearer slow-engine-test-key")
    setTimeout(() => {
      res.writeHead(200, { "content-type": "application/json" })
      res.end(JSON.stringify({ id: "slow-start", url: "https://desktop.example/login/slow-start" }))
    }, 11_000)
  })
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  try {
    const hooks = await MuseWebPlugin({}, { engine: `http://127.0.0.1:${server.address().port}`, key: "slow-engine-test-key" })
    const started = Date.now()
    const login = await hooks.auth.methods[0].authorize()
    assert.equal(login.url, "https://desktop.example/login/slow-start")
    assert.equal(login.method, "auto")
    assert.ok(Date.now() - started >= 10_500, "the fixture must exercise the old timeout boundary")
  } finally {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  }
})
