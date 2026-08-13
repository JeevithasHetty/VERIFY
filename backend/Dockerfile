# FieldVerify backend image. The default process serves the API.
# Render can run the same image with a worker command when scaling the worker separately.
FROM node:20-slim AS base

# Sharp needs these for its prebuilt binaries / fallback build on some platforms.
RUN apt-get update -qq \
    && apt-get install -y --no-install-recommends libvips-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY src ./src

RUN mkdir -p uploads

ENV NODE_ENV=production

EXPOSE 4000

# Default to the API process. The take-home deployment can also embed the worker in this process.
CMD ["node", "src/server.js"]
