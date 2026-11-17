"""Private BLACKCELL AI Core gateway — pilot foundation, not a public API.

Only an authenticated BLACKCELL server-side broker may call this service.
GPU model weights and inference run separately on a private vLLM endpoint.
No photo, video, prompt, or output is persisted by this process.
"""
from __future__ import annotations

import base64
import binascii
import hmac
import ipaddress
import os
from urllib.parse import urlsplit

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator


app = FastAPI(
    title="BLACKCELL Private AI Core",
    version="0.1.0",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)


@app.exception_handler(RequestValidationError)
async def private_validation_error(_request: Request, _error: RequestValidationError):
    # FastAPI's default 422 can echo invalid request inputs, including base64 images.
    # Never return or log sensitive image bytes or prompt text in validation errors.
    return JSONResponse(status_code=422, content={"detail": "Invalid private inference request"})


class VisionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    image_base64: str = Field(min_length=12, max_length=4_200_000)
    mime_type: str = Field(pattern=r"^image/(jpeg|png|webp)$")
    instruction: str = Field(min_length=3, max_length=8000)
    rights_confirmed: bool
    adult_restricted: bool
    server_authorized: bool

    @field_validator("image_base64")
    @classmethod
    def valid_image(cls, value: str) -> str:
        try:
            data = base64.b64decode(value, validate=True)
        except (binascii.Error, ValueError):
            raise ValueError("Invalid image encoding") from None
        if not (16 <= len(data) <= 3_000_000):
            raise ValueError("Preview must be 16 bytes to 3 MB")
        if not (data.startswith(b"\xff\xd8\xff") or
                data.startswith(b"\x89PNG\r\n\x1a\n") or
                (data.startswith(b"RIFF") and data[8:12] == b"WEBP")):
            raise ValueError("Only JPEG, PNG or WebP previews are accepted")
        return value


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    prompt: str = Field(min_length=1, max_length=8000)
    system: str = Field(default="You are a private BLACKCELL assistant.", max_length=5000)
    max_tokens: int = Field(default=512, ge=16, le=1600)


def authorize(authorization: str | None = Header(default=None)) -> None:
    token = os.environ.get("BLACKCELL_AI_INTERNAL_TOKEN", "")
    if len(token) < 32 or token.startswith("REPLACE_"):
        raise HTTPException(status_code=503, detail="Internal service token not configured")
    if not authorization or not authorization.startswith("Bearer ") or not hmac.compare_digest(
        authorization[len("Bearer "):], token
    ):
        raise HTTPException(status_code=401, detail="Private service authorization required")


def upstream_url(name: str) -> str:
    value = os.environ.get(name, "").strip().rstrip("/")
    if not value:
        raise HTTPException(status_code=503, detail="Private GPU model is not configured")
    parsed = urlsplit(value)
    if parsed.scheme != "http" or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise HTTPException(status_code=503, detail="GPU URL must use a private HTTP service")
    host = parsed.hostname.lower().rstrip(".")
    try:
        ip = ipaddress.ip_address(host)
        internal = ip.is_loopback or ip.is_private
    except ValueError:
        internal = host in {"localhost", "host.docker.internal"} or host.endswith(
            (".internal", ".svc.cluster.local")
        )
    if not internal:
        raise HTTPException(status_code=503, detail="GPU endpoint must be on the private network")
    if parsed.path not in ("", "/v1"):
        raise HTTPException(status_code=503, detail="Unexpected GPU API path")
    return value + ("" if parsed.path == "/v1" else "/v1")


async def infer(upstream_env: str, model_env: str, messages: list[dict], max_tokens: int) -> str:
    endpoint = upstream_url(upstream_env) + "/chat/completions"
    model = os.environ.get(model_env, "").strip()
    if not model:
        raise HTTPException(status_code=503, detail="Private model name is not configured")
    headers = {"Content-Type": "application/json"}
    gpu_key = os.environ.get("BLACKCELL_GPU_API_KEY", "")
    if gpu_key and not gpu_key.startswith("REPLACE_"):
        headers["Authorization"] = "Bearer " + gpu_key
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(75.0), follow_redirects=False) as client:
            response = await client.post(
                endpoint,
                json={"model": model, "messages": messages, "max_tokens": max_tokens,
                      "temperature": 0.1},
                headers=headers,
            )
        if response.status_code != 200:
            # Do not return upstream error body: it could contain private prompts.
            raise HTTPException(status_code=502, detail="Private inference service failed")
        data = response.json()
        answer = data["choices"][0]["message"]["content"]
        if not isinstance(answer, str) or not answer.strip():
            raise ValueError("No model response")
        return answer[:16000]
    except HTTPException:
        raise
    except (httpx.HTTPError, KeyError, IndexError, ValueError, TypeError):
        raise HTTPException(status_code=502, detail="Private inference unavailable or incomplete") from None


@app.get("/healthz")
async def healthz():
    # Readiness without revealing upstream addresses, credentials or model identifiers.
    return {
        "service": "blackcell-ai-core",
        "mode": "pilot",
        "vision_configured": bool(os.environ.get("BLACKCELL_VISION_UPSTREAM") and os.environ.get("BLACKCELL_VISION_MODEL")),
        "chat_configured": bool(os.environ.get("BLACKCELL_CHAT_UPSTREAM") and os.environ.get("BLACKCELL_CHAT_MODEL")),
        "video_enabled": False,
    }


@app.post("/v1/vision/classify", dependencies=[Depends(authorize)])
async def vision(body: VisionRequest):
    # These booleans are supplied ONLY by the trusted authorization broker,
    # which must independently verify ownership, permission and media status.
    # Adult/restricted images are excluded until GPU provider permissions and
    # a separate safety/consent integration have been explicitly approved.
    if not body.server_authorized or not body.rights_confirmed or body.adult_restricted:
        raise HTTPException(status_code=403, detail="Eligible, rights-confirmed non-restricted photo required")
    # Match the declared mime to the actual media header. Never parse an arbitrary URL.
    raw = base64.b64decode(body.image_base64, validate=True)
    valid = {
        "image/jpeg": raw.startswith(b"\xff\xd8\xff"),
        "image/png": raw.startswith(b"\x89PNG\r\n\x1a\n"),
        "image/webp": raw.startswith(b"RIFF") and raw[8:12] == b"WEBP",
    }[body.mime_type]
    if not valid:
        raise HTTPException(status_code=422, detail="Preview MIME mismatch")
    text = await infer(
        "BLACKCELL_VISION_UPSTREAM", "BLACKCELL_VISION_MODEL",
        [{"role": "user", "content": [
            {"type": "text", "text": body.instruction},
            {"type": "image_url", "image_url": {
                "url": "data:" + body.mime_type + ";base64," + body.image_base64
            }},
        ]}], 1400,
    )
    return {"ok": True, "source": "self_hosted_vlm", "result": text,
            "verified": False, "published": False}


@app.post("/v1/chat", dependencies=[Depends(authorize)])
async def chat(body: ChatRequest):
    text = await infer(
        "BLACKCELL_CHAT_UPSTREAM", "BLACKCELL_CHAT_MODEL",
        [{"role": "system", "content": body.system},
         {"role": "user", "content": body.prompt}], body.max_tokens,
    )
    return {"ok": True, "source": "self_hosted_chat", "response": text,
            "writes_performed": False}


@app.post("/v1/video", dependencies=[Depends(authorize)])
async def video_placeholder():
    # Video generation requires a separately validated GPU job runner and
    # signed Bunny outputs. Never pretend to have created a video.
    raise HTTPException(status_code=503, detail="BLACKCELL video GPU worker not connected")
