# Private CPU orchestration gateway; GPU model runtime is on a different host.
# Pin the exact base image digest after the initial staging build and security review.
FROM python:3.12.9-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /service
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && useradd --uid 10001 --create-home --shell /usr/sbin/nologin blackcell
COPY app.py ./
USER blackcell
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/healthz', timeout=3)" || exit 1
CMD ["uvicorn","app:app","--host","0.0.0.0","--port","8080","--no-access-log"]
