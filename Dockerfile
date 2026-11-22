FROM node:22-bookworm-slim

ENV NODE_ENV=production
ENV PORT=10000
ENV CONVERTO_YTDLP_PYTHON=/opt/converto-venv/bin/python
ENV CONVERTO_MEDIA_INSPECT_ENABLED=false

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       python3 \
       python3-venv \
       ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /opt/converto-venv \
    && /opt/converto-venv/bin/python -m pip install \
       --no-cache-dir "yt-dlp[default]==2026.10.26"

COPY package*.json verify-sharp.js ./

RUN npm ci --include=optional --omit=dev

COPY --chown=node:node . .

USER node

EXPOSE 10000

CMD ["node", "index.js"]

