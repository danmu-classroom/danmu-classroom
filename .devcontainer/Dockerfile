FROM mcr.microsoft.com/devcontainers/typescript-node:24-bookworm

# Shared libraries Electron (apps/screen) needs on Linux; windows are shown through the
# desktop-lite feature (noVNC on :6080). fonts-noto-cjk for Chinese UI text.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libgtk-3-0 libgbm1 \
      libasound2 libxss1 libxshmfence1 libxkbcommon0 xvfb fonts-noto-cjk \
 && rm -rf /var/lib/apt/lists/*
