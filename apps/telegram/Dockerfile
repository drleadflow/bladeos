FROM node:20-slim AS builder

WORKDIR /app
COPY package.json package-lock.json turbo.json ./
COPY packages/ packages/
COPY apps/telegram/ apps/telegram/
COPY skills/ skills/
COPY skill-packs/ skill-packs/

RUN npm ci --workspace=@blade/telegram --include-workspace-root
RUN npx turbo build --filter=@blade/telegram

FROM node:20-slim AS runner

WORKDIR /app
COPY --from=builder /app/node_modules node_modules/
COPY --from=builder /app/packages/ packages/
COPY --from=builder /app/apps/telegram/ apps/telegram/
COPY --from=builder /app/skills/ skills/
COPY --from=builder /app/skill-packs/ skill-packs/

ENV NODE_ENV=production

CMD ["node", "apps/telegram/dist/index.js"]
