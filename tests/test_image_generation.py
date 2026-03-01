import asyncio

from app.config import Settings
import app.fixture_board as fixture_board
import app.image_generation as image_generation


def test_generate_match_based_slider_images_returns_generated_items(monkeypatch):
    fixtures = [
        {
            "home_team_name": "Team A",
            "away_team_name": "Team B",
            "league_name": "League 1",
            "markets": {"match_result": {"home": 1.95, "away": 3.05}},
        },
        {
            "home_team_name": "Team C",
            "away_team_name": "Team D",
            "league_name": "League 2",
            "markets": {"match_result": {"home": 2.1, "away": 2.7}},
        },
    ]

    monkeypatch.setattr(
        fixture_board,
        "get_fixture_board_page",
        lambda **kwargs: {"items": fixtures},
    )

    async def _fake_generate_image(prompt, settings, size="1792x1024", quality="hd", style="vivid"):
        return {
            "url": "https://example.com/generated.png",
            "local_path": "/tmp/generated.png",
            "relative_url": "/static/slider/generated.png",
            "prompt": prompt,
            "metadata": {"model": "dall-e-3"},
        }

    monkeypatch.setattr(image_generation, "generate_football_slider_image", _fake_generate_image)

    settings = Settings(dummy_mode=True, sportmonks_api_token=None)
    result = asyncio.run(image_generation.generate_match_based_slider_images(settings=settings))

    assert len(result) == 2
    assert all(item.get("relative_url") == "/static/slider/generated.png" for item in result)
    assert all("Team" in item.get("prompt", "") for item in result)


def test_generate_match_based_slider_images_uses_fallback_for_empty_fixture_list(monkeypatch):
    monkeypatch.setattr(
        fixture_board,
        "get_fixture_board_page",
        lambda **kwargs: {"items": []},
    )

    fallback_calls = []
    fallback_payload = [
        {
            "url": "https://example.com/fallback.png",
            "local_path": "/tmp/fallback.png",
            "relative_url": "/static/slider/fallback.png",
            "prompt": "fallback prompt",
            "metadata": {"model": "dall-e-3"},
        }
    ]

    async def _fake_batch(count=3, settings=None):
        fallback_calls.append((count, settings))
        return fallback_payload

    monkeypatch.setattr(image_generation, "generate_slider_images_batch", _fake_batch)

    settings = Settings(dummy_mode=True, sportmonks_api_token=None)
    result = asyncio.run(image_generation.generate_match_based_slider_images(settings=settings))

    assert result == fallback_payload
    assert len(fallback_calls) == 1
    assert fallback_calls[0][0] == 3
    assert fallback_calls[0][1] is settings
