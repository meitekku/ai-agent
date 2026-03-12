FROM oven/bun:1 AS base
WORKDIR /app

# ---- deps ----
FROM base AS deps
COPY package.json bun.lock* ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --no-save --frozen-lockfile

# ---- builder ----
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# next.config.ts uses GEMINI_API_KEY at build time to set NEXT_PUBLIC_LLM_BACKEND
# Pass a dummy value so it resolves to "Gemini"; actual key injected at runtime
ARG GEMINI_API_KEY=enabled
ENV GEMINI_API_KEY=$GEMINI_API_KEY
RUN bun run build

# ---- runner ----
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME="0.0.0.0"
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder --chown=bun:bun /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown bun:bun .next

COPY --from=builder --chown=bun:bun /app/.next/standalone ./
COPY --from=builder --chown=bun:bun /app/.next/static ./.next/static

# Chat file uploads directory (volume mount point)
RUN mkdir -p /app/data/chat-files && chown -R bun:bun /app/data

USER bun
EXPOSE 3000
CMD ["bun", "server.js"]
