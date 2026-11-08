FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      chromium xvfb fluxbox x11vnc novnc websockify nginx apache2-utils \
      x11-utils fonts-noto-cjk ca-certificates tini \
 && rm -rf /var/lib/apt/lists/* /etc/nginx/sites-enabled/default

WORKDIR /app
COPY package.json index.mjs icon.svg LICENSE ./
COPY engine/ ./engine/
COPY deploy/desktop/nginx.conf /etc/nginx/nginx.conf
COPY deploy/desktop/entrypoint.sh /usr/local/bin/muse-desktop
RUN chmod 755 /usr/local/bin/muse-desktop

ENV DISPLAY=:99 \
    MUSE_WEB_HOME=/data \
    MUSE_WEB_CHROME=/usr/bin/chromium \
    MUSE_WEB_ENGINE_PORT=18611 \
    MUSE_WEB_ENGINE_HOST=127.0.0.1 \
    MUSE_WEB_BROWSER=headless

VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/v1/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/muse-desktop"]
