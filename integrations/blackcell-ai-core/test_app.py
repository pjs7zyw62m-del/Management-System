"""Offline BLACKCELL AI Core security tests. No GPU, cloud service or private data needed."""
import base64

from fastapi.testclient import TestClient

import app as service


client = TestClient(service.app)
TOKEN = "unit_test_only_token_123456789012345678901234567890"
PHOTO = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"synthetic-pixel-data").decode("ascii")


def headers():
    return {"Authorization": "Bearer " + TOKEN}


def vision_payload(**changes):
    base = {
        "image_base64": PHOTO,
        "mime_type": "image/png",
        "instruction": "Describe visible uniform features objectively",
        "rights_confirmed": True,
        "adult_restricted": False,
        "server_authorized": True,
    }
    base.update(changes)
    return base


def test_health_does_not_expose_secrets(monkeypatch):
    monkeypatch.setenv("BLACKCELL_AI_INTERNAL_TOKEN", TOKEN)
    res = client.get("/healthz")
    assert res.status_code == 200
    assert TOKEN not in res.text
    assert res.json()["video_enabled"] is False


def test_unconfigured_internal_key_rejected(monkeypatch):
    monkeypatch.delenv("BLACKCELL_AI_INTERNAL_TOKEN", raising=False)
    res = client.post("/v1/chat", headers=headers(), json={"prompt": "hello"})
    assert res.status_code == 503


def test_unauthorized_request_rejected(monkeypatch):
    monkeypatch.setenv("BLACKCELL_AI_INTERNAL_TOKEN", TOKEN)
    res = client.post("/v1/chat", json={"prompt": "hello"})
    assert res.status_code == 401


def test_private_media_policy_rejects_restricted(monkeypatch):
    monkeypatch.setenv("BLACKCELL_AI_INTERNAL_TOKEN", TOKEN)
    res = client.post("/v1/vision/classify", headers=headers(),
                      json=vision_payload(adult_restricted=True))
    assert res.status_code == 403


def test_rights_and_broker_restrictions(monkeypatch):
    monkeypatch.setenv("BLACKCELL_AI_INTERNAL_TOKEN", TOKEN)
    for change in ({"rights_confirmed": False}, {"server_authorized": False}):
        res = client.post("/v1/vision/classify", headers=headers(),
                          json=vision_payload(**change))
        assert res.status_code == 403


def test_image_and_mime_validation_does_not_echo_input(monkeypatch):
    monkeypatch.setenv("BLACKCELL_AI_INTERNAL_TOKEN", TOKEN)
    bad = "SENSITIVE_UNPARSEABLE_IMAGE_BYTES"
    res = client.post("/v1/vision/classify", headers=headers(),
                      json=vision_payload(image_base64=bad))
    assert res.status_code == 422
    assert bad not in res.text
    res = client.post("/v1/vision/classify", headers=headers(),
                      json=vision_payload(mime_type="image/jpeg"))
    assert res.status_code == 422


def test_no_configured_gpu_means_no_inference(monkeypatch):
    monkeypatch.setenv("BLACKCELL_AI_INTERNAL_TOKEN", TOKEN)
    monkeypatch.delenv("BLACKCELL_VISION_UPSTREAM", raising=False)
    monkeypatch.delenv("BLACKCELL_VISION_MODEL", raising=False)
    res = client.post("/v1/vision/classify", headers=headers(),
                      json=vision_payload())
    assert res.status_code == 503


def test_no_public_gpu_endpoint(monkeypatch):
    monkeypatch.setenv("BLACKCELL_AI_INTERNAL_TOKEN", TOKEN)
    monkeypatch.setenv("BLACKCELL_VISION_UPSTREAM", "https://public-model.example/v1")
    monkeypatch.setenv("BLACKCELL_VISION_MODEL", "example")
    res = client.post("/v1/vision/classify", headers=headers(),
                      json=vision_payload())
    assert res.status_code == 503


def test_self_hosted_results_never_auto_publish(monkeypatch):
    monkeypatch.setenv("BLACKCELL_AI_INTERNAL_TOKEN", TOKEN)

    async def mocked(*_args, **_kwargs):
        return "Descriptive analysis only, not verified"

    monkeypatch.setattr(service, "infer", mocked)
    res = client.post("/v1/vision/classify", headers=headers(),
                      json=vision_payload())
    assert res.status_code == 200
    assert res.json()["verified"] is False
    assert res.json()["published"] is False
    assert res.json()["source"] == "self_hosted_vlm"


def test_video_generation_not_misrepresented(monkeypatch):
    monkeypatch.setenv("BLACKCELL_AI_INTERNAL_TOKEN", TOKEN)
    res = client.post("/v1/video", headers=headers())
    assert res.status_code == 503
