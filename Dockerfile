# Idiomate - single-origin Node server (API + built client)
FROM node:20-slim

# Build tools for better-sqlite3 native compilation.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps (devDeps included: tsx + vite are needed for build/start).
COPY package*.json ./
RUN npm ci

# Build the client bundle, then bring in the rest of the source.
COPY . .
RUN npm run build

ENV NODE_ENV=production
# DB_PATH should point at a mounted persistent volume in production, e.g. /data/idiomate.sqlite
ENV PORT=8787
EXPOSE 8787

CMD ["npm", "start"]
