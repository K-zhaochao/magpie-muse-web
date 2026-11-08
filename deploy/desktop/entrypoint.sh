#!/bin/bash
set -euo pipefail
umask 077

: "${DESKTOP_USER:=muse}"
: "${DESKTOP_PASSWORD:?Run node deploy/desktop/init.mjs first}"
: "${MUSE_WEB_ENGINE_KEY:?Run node deploy/desktop/init.mjs first}"
: "${MUSE_WEB_PUBLIC_URL:=http://127.0.0.1:6080}"
: "${MUSE_WEB_DESKTOP_URL:=${MUSE_WEB_PUBLIC_URL%/}/desktop/vnc.html?autoconnect=1&resize=scale&path=desktop/websockify}"
if [[ ! "$DESKTOP_USER" =~ ^[a-zA-Z0-9_-]+$ ]] || (( ${#DESKTOP_PASSWORD} < 12 || ${#MUSE_WEB_ENGINE_KEY} < 32 )); then
  echo 'Desktop username must be alphanumeric; desktop password >=12 and engine key >=32 characters.' >&2
  exit 1
fi

# Internal services remain loopback-only. Nginx authenticates the desktop HTTP and WebSocket;
# the existing engine authenticates every account/control/chat request with its own key.
export DISPLAY=:99 MUSE_WEB_HOME=/data MUSE_WEB_ENGINE_HOST=127.0.0.1 MUSE_WEB_ENGINE_PORT=18611
export MUSE_WEB_PUBLIC_URL MUSE_WEB_DESKTOP_URL MUSE_WEB_LOGIN_HEADLESS=0
unset MUSE_WEB_PARENT_PID
mkdir -p /data /run/muse-desktop /var/log/nginx
chmod 700 /data /run/muse-desktop
printf '%s\n' "$DESKTOP_PASSWORD" | htpasswd -ciB /run/muse-desktop/htpasswd "$DESKTOP_USER" >/dev/null
# The nginx worker must be able to read the hashed password file, not the plaintext secret.
chown root:www-data /run/muse-desktop /run/muse-desktop/htpasswd
chmod 750 /run/muse-desktop
chmod 640 /run/muse-desktop/htpasswd
unset DESKTOP_PASSWORD

pids=()
cleanup() {
  trap - EXIT INT TERM
  if (( ${#pids[@]} )); then
    kill "${pids[@]}" 2>/dev/null || true
    wait "${pids[@]}" 2>/dev/null || true
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Fixed, container-private display paths; recover after Docker killed the previous X server.
rm -f /tmp/.X99-lock /tmp/.X11-unix/X99
Xvfb "$DISPLAY" -screen 0 1440x1000x24 -nolisten tcp -ac &
pids+=("$!")
ready=0
for _ in {1..100}; do
  if xdpyinfo -display "$DISPLAY" >/dev/null 2>&1; then ready=1; break; fi
  sleep .1
done
if (( ! ready )); then echo 'Xvfb did not become ready' >&2; exit 1; fi
fluxbox -display "$DISPLAY" >/run/muse-desktop/fluxbox.log 2>&1 &
pids+=("$!")
x11vnc -display "$DISPLAY" -localhost -rfbport 5900 -forever -shared -nopw \
  -noxdamage >/run/muse-desktop/vnc.log 2>&1 &
pids+=("$!")
websockify 127.0.0.1:6081 127.0.0.1:5900 >/run/muse-desktop/websockify.log 2>&1 &
pids+=("$!")
node /app/engine/main.mjs &
pids+=("$!")
nginx -t
nginx -g 'daemon off;' &
pids+=("$!")

echo 'Muse desktop started. Open the configured public URL; credentials are in the private .env file.'
# If any essential service exits, stop its siblings and let Docker's restart policy recover.
set +e
wait -n "${pids[@]}"
code=$?
set -e
(( code == 0 )) && code=1
exit "$code"
