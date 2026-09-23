# ClipCraft backend + manim worker in one image (Render free tier has no Docker daemon,
# so manim runs directly on the host; see MANIM_LOCAL in queueReader.ts).
FROM node:22-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    NODE_OPTIONS=--max-old-space-size=384 \
    MANIM_LOCAL=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-dev ffmpeg \
    libcairo2-dev libpango1.0-dev pkg-config build-essential \
 && rm -rf /var/lib/apt/lists/*

# Render backend only (no LaTeX: scenes using Tex fail validation and fall back
# via the self-correction retry loop)
RUN pip install --no-cache-dir --break-system-packages manim

RUN mkdir -p /manim_input /manim_output

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY . .
RUN npm run build

EXPOSE 3000
CMD ["sh", "start.sh"]
