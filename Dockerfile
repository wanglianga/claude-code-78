# ---- 依赖安装阶段（含 node-gyp 编译环境，用于 better-sqlite3）----
FROM node:22-bookworm AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund

# ---- 前端构建阶段 ----
FROM node:22-bookworm AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- 运行阶段 ----
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=4000 \
    DATA_DIR=/data
WORKDIR /app
# 仅复制生产依赖（better-sqlite3 的原生 .node 已在 bookworm 编译，slim 兼容）
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server ./server
COPY --from=build /app/dist ./public
RUN mkdir -p /data && chown -R node:node /app /data
USER node
EXPOSE 4000
VOLUME ["/data"]
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
