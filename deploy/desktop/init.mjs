#!/usr/bin/env node
// Generate deployment secrets locally, never print or commit them. Existing files are preserved.
import { randomBytes } from "node:crypto"
import { writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { webURL } from "../../engine/remote.mjs"

const arg = process.argv[2] || "http://127.0.0.1:6080"
const publicURL = webURL(arg, "public URL").replace(/\/+$/, "")
// This nginx bundle is served at a domain root. Prefix reverse proxies need an explicit rewrite.
if (new URL(publicURL).pathname !== "/") throw new Error("Use a dedicated domain or http://127.0.0.1:6080, without a path prefix")
const file = fileURLToPath(new URL(".env", import.meta.url))
const content = [
  "# Private deployment credentials. Do not commit this file.",
  "DESKTOP_PORT=6080",
  "DESKTOP_USER=muse",
  `DESKTOP_PASSWORD=${randomBytes(24).toString("hex")}`,
  `MUSE_WEB_ENGINE_KEY=${randomBytes(32).toString("hex")}`,
  `MUSE_WEB_PUBLIC_URL=${publicURL}`,
  `MUSE_WEB_DESKTOP_URL=${publicURL}/desktop/vnc.html?autoconnect=1&resize=scale&path=desktop/websockify`,
  "MUSE_WEB_PREWARM=1",
  "MUSE_WEB_VERIFY_LOGIN=1",
  "",
].join("\n")
try {
  writeFileSync(file, content, { mode: 0o600, flag: "wx" })
  console.log(`Created ${file}. Read it locally for the desktop password and engine key; do not paste its contents into logs.`)
} catch (err) {
  if (err.code === "EEXIST") console.log("Existing .env preserved; no secrets were changed.")
  else throw err
}
