// Desktop URLs are explicit configuration, never inferred from an untrusted Host header.
export function webURL(value, name, { query = false } = {}) {
  if (!value) return ""
  let url
  try { url = new URL(value) } catch { throw new Error(`${name} must be an absolute HTTP(S) URL`) }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash || (!query && url.search)) {
    throw new Error(`${name} must be an HTTP(S) URL without credentials, fragments${query ? "" : " or query parameters"}`)
  }
  return url.href
}

export function remoteSettings(env = process.env) {
  const publicURL = webURL(env.MUSE_WEB_PUBLIC_URL, "MUSE_WEB_PUBLIC_URL").replace(/\/+$/, "")
  const desktopURL = webURL(env.MUSE_WEB_DESKTOP_URL, "MUSE_WEB_DESKTOP_URL", { query: true })
  const host = env.MUSE_WEB_ENGINE_HOST?.trim() || "127.0.0.1"
  // Hosts only; protocols, paths and embedded credentials belong in PUBLIC_URL instead.
  if (!/^[\w.:[\]-]+$/.test(host)) throw new Error("MUSE_WEB_ENGINE_HOST must be a bind address, not a URL")
  return { publicURL, desktopURL, host }
}

export function loginStatusURL(id, port, publicURL = "") {
  return `${publicURL || `http://127.0.0.1:${port}`}/login/${encodeURIComponent(id)}`
}
