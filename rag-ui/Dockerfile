FROM oven/bun:1 AS base
WORKDIR /app

# ---- deps ----
FROM base AS deps
COPY package.json bun.lock* ./
RUN bun install --no-save --frozen-lockfile

# ---- builder ----
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# next.config.ts uses GEMINI_API_KEY at build time to set NEXT_PUBLIC_LLM_BACKEND
# Pass a dummy value so it resolves to "Gemini"; actual key injected at runtime
ARG GEMINI_API_KEY=enabled
ENV GEMINI_API_KEY=$GEMINI_API_KEY
RUN bun run build

# ---- runner ----
FROM base AS runner
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 NODE_ENV=production PORT=3000 HOSTNAME="0.0.0.0"
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --no-log-init -g nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["bun", "./server.js"]
