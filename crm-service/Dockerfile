FROM oven/bun:1 AS base
WORKDIR /app

# Install curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY . .

ENV NODE_ENV=production
EXPOSE 8009

CMD ["bun", "run", "src/index.ts"]
