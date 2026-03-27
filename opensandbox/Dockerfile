FROM python:3.12-slim

# Install uv + curl (healthcheck)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Install opensandbox-server
RUN uv pip install --system opensandbox-server

COPY config.toml /etc/opensandbox/config.toml

EXPOSE 8080

CMD ["opensandbox-server", "--config", "/etc/opensandbox/config.toml"]
