from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from loguru import logger

ARTIFACT_DIR = Path("artifacts")
MODEL_STORE_DIR = ARTIFACT_DIR / "models"
MODEL_INDEX_PATH = MODEL_STORE_DIR / "index.json"


def _default_index() -> dict:
    return {"active_model_id": None, "models": []}


def _ensure_store() -> None:
    MODEL_STORE_DIR.mkdir(parents=True, exist_ok=True)
    if not MODEL_INDEX_PATH.exists():
        MODEL_INDEX_PATH.write_text(json.dumps(_default_index(), indent=2))


def _load_index() -> dict:
    _ensure_store()
    try:
        payload = json.loads(MODEL_INDEX_PATH.read_text())
    except Exception:
        payload = _default_index()
    if not isinstance(payload, dict):
        payload = _default_index()
    if "models" not in payload or not isinstance(payload["models"], list):
        payload["models"] = []
    if "active_model_id" not in payload:
        payload["active_model_id"] = None
    return payload


def _save_index(payload: dict) -> None:
    _ensure_store()
    MODEL_INDEX_PATH.write_text(json.dumps(payload, indent=2))


def _parse_sort_key(entry: dict) -> str:
    return str(entry.get("trained_at") or "")


def _legacy_default_model() -> Optional[dict]:
    lambda_home = ARTIFACT_DIR / "lambda_home.pkl"
    lambda_away = ARTIFACT_DIR / "lambda_away.pkl"
    meta_path = ARTIFACT_DIR / "meta.json"
    if not lambda_home.exists() or not lambda_away.exists():
        return None

    meta: Dict[str, Any] = {}
    if meta_path.exists():
        try:
            meta = json.loads(meta_path.read_text())
        except Exception:
            meta = {}

    model_id = str(meta.get("model_id") or "legacy-default")
    return {
        "model_id": model_id,
        "model_name": str(meta.get("model_name") or "Legacy Default Model"),
        "version": str(meta.get("model_version") or "legacy"),
        "artifact_dir": str(ARTIFACT_DIR.resolve()),
        "trained_at": meta.get("trained_at"),
        "meta": meta,
        "is_active": True,
    }


def list_models(limit: int = 50) -> List[dict]:
    index = _load_index()
    items = list(index.get("models", []))
    legacy = _legacy_default_model()
    if not items and legacy:
        items = [legacy]
    elif legacy and all(item.get("model_id") != legacy.get("model_id") for item in items):
        items.append(legacy)
    active_model_id = index.get("active_model_id")
    if not active_model_id:
        if legacy:
            active_model_id = legacy.get("model_id")
    for item in items:
        item["is_active"] = bool(active_model_id and item.get("model_id") == active_model_id)
    items.sort(key=_parse_sort_key, reverse=True)
    return items[: max(1, min(limit, 500))]


def get_model(model_id: str) -> Optional[dict]:
    index = _load_index()
    for item in index.get("models", []):
        if item.get("model_id") == model_id:
            model = dict(item)
            model["is_active"] = model_id == index.get("active_model_id")
            return model
    legacy = _legacy_default_model()
    if legacy and legacy.get("model_id") == model_id:
        return legacy
    return None


def get_active_model() -> Optional[dict]:
    index = _load_index()
    active_model_id = index.get("active_model_id")
    if active_model_id:
        return get_model(active_model_id)
    legacy = _legacy_default_model()
    if legacy:
        return legacy
    return None


def _sync_to_root(entry: dict) -> None:
    model_dir = Path(str(entry.get("artifact_dir") or "")).resolve()
    for file_name in ("lambda_home.pkl", "lambda_away.pkl", "meta.json"):
        source = model_dir / file_name
        if not source.exists():
            raise FileNotFoundError(f"Missing model artifact: {source}")
        shutil.copy2(source, ARTIFACT_DIR / file_name)


def register_model(entry: dict, *, set_active: bool = True) -> dict:
    index = _load_index()
    filtered = [item for item in index.get("models", []) if item.get("model_id") != entry.get("model_id")]
    filtered.append(entry)
    filtered.sort(key=_parse_sort_key, reverse=True)
    index["models"] = filtered
    if set_active:
        index["active_model_id"] = entry.get("model_id")
        _sync_to_root(entry)
    _save_index(index)
    logger.info("Registered model {} (active={})", entry.get("model_id"), set_active)
    return entry


def activate_model(model_id: str) -> Optional[dict]:
    index = _load_index()
    model = next((item for item in index.get("models", []) if item.get("model_id") == model_id), None)
    if not model:
        return None
    index["active_model_id"] = model_id
    _sync_to_root(model)
    _save_index(index)
    activated = dict(model)
    activated["is_active"] = True
    return activated


def _remove_root_artifacts() -> None:
    for file_name in ("lambda_home.pkl", "lambda_away.pkl", "meta.json"):
        try:
            (ARTIFACT_DIR / file_name).unlink(missing_ok=True)
        except Exception:
            continue


def delete_model(model_id: str) -> tuple[Optional[dict], Optional[dict]]:
    index = _load_index()
    models = list(index.get("models", []))
    target = next((item for item in models if item.get("model_id") == model_id), None)
    if not target:
        legacy = _legacy_default_model()
        if legacy and str(legacy.get("model_id")) == str(model_id):
            raise ValueError("Legacy model cannot be deleted.")
        return None, None

    remaining = [item for item in models if item.get("model_id") != model_id]
    was_active = str(index.get("active_model_id") or "") == str(model_id)
    next_active_model = None
    if was_active and remaining:
        next_active_model = max(remaining, key=_parse_sort_key)
        index["active_model_id"] = next_active_model.get("model_id")
    elif was_active:
        index["active_model_id"] = None

    index["models"] = remaining
    _save_index(index)

    target_dir_raw = str(target.get("artifact_dir") or "").strip()
    if target_dir_raw:
        target_dir = Path(target_dir_raw).resolve()
        try:
            store_root = MODEL_STORE_DIR.resolve()
            if target_dir.exists() and target_dir != store_root and store_root in target_dir.parents:
                shutil.rmtree(target_dir, ignore_errors=True)
        except Exception as exc:  # pragma: no cover
            logger.warning("Failed to remove model artifacts for {}: {}", model_id, exc)

    activated: Optional[dict] = None
    if next_active_model:
        try:
            _sync_to_root(next_active_model)
        except Exception as exc:  # pragma: no cover
            logger.warning("Failed to sync new active model {} after deletion: {}", next_active_model.get("model_id"), exc)
        activated = dict(next_active_model)
        activated["is_active"] = True
    elif was_active:
        _remove_root_artifacts()

    deleted = dict(target)
    deleted["is_active"] = False
    logger.info("Deleted model {} (next_active={})", model_id, activated.get("model_id") if activated else None)
    return deleted, activated


def purge_registered_models(*, remove_root_artifacts: bool = True) -> dict:
    index = _load_index()
    existing_models = list(index.get("models", []))
    existing_model_ids = [str(item.get("model_id") or "") for item in existing_models if str(item.get("model_id") or "").strip()]
    existing_active = str(index.get("active_model_id") or "").strip() or None

    # Hard reset registry index first to prevent stale reads during cleanup.
    index["models"] = []
    index["active_model_id"] = None
    _save_index(index)

    removed_dirs = 0
    removed_files = 0
    _ensure_store()
    for child in MODEL_STORE_DIR.iterdir():
        if child.name == MODEL_INDEX_PATH.name:
            continue
        try:
            if child.is_dir():
                shutil.rmtree(child, ignore_errors=True)
                removed_dirs += 1
            else:
                child.unlink(missing_ok=True)
                removed_files += 1
        except Exception as exc:  # pragma: no cover
            logger.warning("Failed to remove model store path {}: {}", child, exc)

    if remove_root_artifacts:
        _remove_root_artifacts()

    return {
        "removed_model_count": len(existing_models),
        "removed_model_ids": existing_model_ids,
        "previous_active_model_id": existing_active,
        "store_dirs_removed": int(removed_dirs),
        "store_files_removed": int(removed_files),
        "root_artifacts_cleared": bool(remove_root_artifacts),
    }


def resolve_model_dir(model_id: Optional[str] = None) -> Tuple[Path, Optional[dict]]:
    if model_id:
        model = get_model(model_id)
        if not model:
            raise FileNotFoundError(f"Model '{model_id}' not found")
        model_dir = Path(str(model.get("artifact_dir") or "")).resolve()
        if not model_dir.exists():
            raise FileNotFoundError(f"Model artifacts missing for '{model_id}'")
        return model_dir, model

    active = get_active_model()
    if active:
        model_dir = Path(str(active.get("artifact_dir") or "")).resolve()
        if model_dir.exists():
            return model_dir, active

    if (ARTIFACT_DIR / "lambda_home.pkl").exists() and (ARTIFACT_DIR / "lambda_away.pkl").exists():
        legacy = _legacy_default_model()
        return ARTIFACT_DIR.resolve(), legacy

    raise FileNotFoundError("No trained models available. Train a model first.")


def get_active_model_id() -> Optional[str]:
    index = _load_index()
    active_model_id = index.get("active_model_id")
    if active_model_id:
        return active_model_id
    legacy = _legacy_default_model()
    if legacy:
        return str(legacy.get("model_id"))
    return None
