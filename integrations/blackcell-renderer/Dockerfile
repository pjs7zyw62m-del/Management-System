FROM python:3.12-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY render.py worker.py ./
RUN useradd --create-home --uid 10001 renderer
USER renderer
ENTRYPOINT ["python", "/app/worker.py"]
CMD ["--max-jobs", "1", "--max-height", "720"]
