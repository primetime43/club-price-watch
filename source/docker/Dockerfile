FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build:docker

FROM node:24-bookworm-slim
ARG SOURCE_URL=""
LABEL org.opencontainers.image.source="$SOURCE_URL"
LABEL org.opencontainers.image.title="Club Price Watch"
WORKDIR /app
ENV NODE_ENV=production PORT=3000 CPW_DATA_DIR=/data
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/server ./server
COPY --from=build /app/docker/start.mjs ./docker/start.mjs
COPY --from=build /app/package.json ./package.json
RUN mkdir /data
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/items',{signal:AbortSignal.timeout(4000)}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "docker/start.mjs"]
