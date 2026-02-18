import json

import modeling.registry as registry


def test_purge_registered_models_clears_index_and_artifacts(tmp_path, monkeypatch):
    artifact_dir = tmp_path / "artifacts"
    model_store_dir = artifact_dir / "models"
    model_store_dir.mkdir(parents=True, exist_ok=True)
    index_path = model_store_dir / "index.json"

    model_dir = model_store_dir / "model-1"
    model_dir.mkdir(parents=True, exist_ok=True)
    (model_dir / "lambda_home.pkl").write_text("home")
    (model_dir / "lambda_away.pkl").write_text("away")
    (model_dir / "meta.json").write_text("{}")

    index_path.write_text(
        json.dumps(
            {
                "active_model_id": "model-1",
                "models": [
                    {
                        "model_id": "model-1",
                        "model_name": "Model 1",
                        "trained_at": "2026-02-16T00:00:00+00:00",
                        "artifact_dir": str(model_dir),
                    }
                ],
            }
        )
    )

    (artifact_dir / "lambda_home.pkl").write_text("root-home")
    (artifact_dir / "lambda_away.pkl").write_text("root-away")
    (artifact_dir / "meta.json").write_text("{}")

    monkeypatch.setattr(registry, "ARTIFACT_DIR", artifact_dir)
    monkeypatch.setattr(registry, "MODEL_STORE_DIR", model_store_dir)
    monkeypatch.setattr(registry, "MODEL_INDEX_PATH", index_path)

    report = registry.purge_registered_models(remove_root_artifacts=True)
    reloaded = json.loads(index_path.read_text())

    assert report["removed_model_count"] == 1
    assert report["previous_active_model_id"] == "model-1"
    assert reloaded["active_model_id"] is None
    assert reloaded["models"] == []
    assert not model_dir.exists()
    assert not (artifact_dir / "lambda_home.pkl").exists()
    assert not (artifact_dir / "lambda_away.pkl").exists()
    assert not (artifact_dir / "meta.json").exists()
