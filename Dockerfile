FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && npm prune --omit=dev --ignore-scripts

FROM node:24-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core fonts-noto-cjk ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build --chown=node:node /app /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
USER node
EXPOSE 3000
CMD ["npm", "start"]
