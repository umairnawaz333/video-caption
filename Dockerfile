# Captionly backend: NestJS + FFmpeg + faster-whisper in one image.
# Works on Hugging Face Spaces (Docker SDK, port 7860) and any VPS.

FROM node:20-slim

# ffmpeg (with libass) for audio extraction + subtitle burn; python for whisper
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg python3 python3-venv \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# python sidecar + whisper
COPY transcriber/requirements.txt transcriber/
RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir -r transcriber/requirements.txt
COPY transcriber transcriber

# bake the whisper model into the image so the first request has no download
ENV HF_HOME=/app/.cache
ARG WHISPER_MODEL=base
RUN /opt/venv/bin/python -c "from faster_whisper import WhisperModel; WhisperModel('${WHISPER_MODEL}', device='cpu', compute_type='int8')"

# backend
COPY backend/package*.json backend/
RUN cd backend && npm ci
COPY backend backend
RUN cd backend && npm run build && npm prune --omit=dev

# caption fonts for ffmpeg's fontsdir
COPY fonts fonts

ENV NODE_ENV=production \
    PYTHON_BIN=/opt/venv/bin/python \
    TRANSCRIBER_SCRIPT=/app/transcriber/transcribe.py \
    FONTS_DIR=/app/fonts \
    TMP_ROOT=/app/tmp \
    WHISPER_MODEL=${WHISPER_MODEL} \
    PORT=7860

# HF Spaces runs the container as a non-root user (uid 1000)
RUN mkdir -p /app/tmp && chmod -R 777 /app/tmp /app/.cache
EXPOSE 7860

WORKDIR /app/backend
CMD ["node", "dist/main.js"]
