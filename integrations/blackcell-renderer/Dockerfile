FROM python:3.12-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY render.py worker.py selftest.py storage_probe.py ./
RUN useradd --create-home --uid 10001 renderer
USER renderer
CMD ["python", "/app/selftest.py"]
