from __future__ import annotations

import time
from datetime import date
from typing import Any, Dict, Iterable, List, Optional

import httpx
from cachetools import TTLCache
from loguru import logger
from tenacity import retry, stop_after_attempt, wait_exponential

from app.config import get_settings
from sportmonks_client.models import FixturePayload

API_BASE = "https://api.sportmonks.com/v3/football"


def build_includes(includes: Iterable[str]) -> str:
    return ";".join(sorted(set(includes)))


class RateLimiter:
    def __init__(self, per_minute: int):
        self.per_minute = per_minute
        self.min_interval = 60.0 / per_minute
        self._last_call = 0.0

    def wait(self) -> None:
        now = time.perf_counter()
        elapsed = now - self._last_call
        if elapsed < self.min_interval:
            sleep_for = self.min_interval - elapsed
            logger.debug("Rate limiter sleeping for {sleep_for:.3f}s", sleep_for=sleep_for)
            time.sleep(sleep_for)
        self._last_call = time.perf_counter()


class SportMonksClient:
    def __init__(
        self,
        api_token: Optional[str] = None,
        *,
        cache_ttl: Optional[int] = None,
        rate_limit_per_minute: int = 55,
        dummy_mode: bool = False,
        timeout_seconds: Optional[int] = None,
    ) -> None:
        settings = get_settings()
        self.api_token = api_token or settings.sportmonks_api_token
        self.rate_limiter = RateLimiter(rate_limit_per_minute)
        self.cache = TTLCache(maxsize=512, ttl=cache_ttl or settings.cache_ttl_seconds)
        self.dummy_mode = dummy_mode or settings.dummy_mode
        self.client = httpx.Client(base_url=API_BASE, timeout=timeout_seconds or settings.sportmonks_timeout_seconds)

    def _headers(self) -> Dict[str, str]:
        # v3 accepts Authorization token directly (without Bearer).
        return {"Authorization": self.api_token} if self.api_token else {}

    def _cached(self, key: str) -> Optional[Dict[str, Any]]:
        if key in self.cache:
            logger.debug("Cache hit for {key}", key=key)
            return self.cache[key]
        return None

    def _store_cache(self, key: str, value: Dict[str, Any]) -> None:
        self.cache[key] = value

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=8))
    def _request(self, method: str, url: str, params: Dict[str, Any]) -> Dict[str, Any]:
        if self.dummy_mode or not self.api_token:
            logger.warning("SportMonks client running in dummy mode; returning synthetic data")
            return self._dummy_response(params)

        query_params = dict(params)
        query_params["api_token"] = self.api_token
        self.rate_limiter.wait()
        resp = self.client.request(method, url, params=query_params, headers=self._headers())
        if resp.status_code >= 500:
            logger.warning("Server error {}, retrying", resp.status_code)
            resp.raise_for_status()
        resp.raise_for_status()
        return resp.json()

    def get_fixture(self, fixture_id: int, includes: Optional[List[str]] = None) -> FixturePayload:
        includes = includes or [
            "participants",
            "statistics",
            "statistics.type",
            "trends",
            "weatherreport",
            "lineups",
            "sidelined",
            "referees",
            "formations",
            "ballcoordinates",
            "scores",
            "odds",
        ]
        include_param = build_includes(includes)
        key = f"fixture:{fixture_id}:{include_param}"
        cached = self._cached(key)
        if cached:
            return FixturePayload.model_validate(cached)

        params = {"include": include_param}
        data = self._request("GET", f"/fixtures/{fixture_id}", params)
        self._store_cache(key, data)
        return FixturePayload.model_validate(data)

    def get_league(self, league_id: int, includes: Optional[List[str]] = None) -> Dict[str, Any]:
        include_param = build_includes(includes or [])
        key = f"league:{league_id}:{include_param}"
        cached = self._cached(key)
        if cached:
            return cached

        params: Dict[str, Any] = {}
        if include_param:
            params["include"] = include_param
        data = self._request("GET", f"/leagues/{league_id}", params=params)
        self._store_cache(key, data)
        return data

    def get_season(self, season_id: int, includes: Optional[List[str]] = None) -> Dict[str, Any]:
        include_param = build_includes(includes or [])
        key = f"season:{season_id}:{include_param}"
        cached = self._cached(key)
        if cached:
            return cached

        params: Dict[str, Any] = {}
        if include_param:
            params["include"] = include_param
        data = self._request("GET", f"/seasons/{season_id}", params=params)
        self._store_cache(key, data)
        return data

    def get_team(self, team_id: int, includes: Optional[List[str]] = None) -> Dict[str, Any]:
        include_param = build_includes(includes or [])
        key = f"team:{team_id}:{include_param}"
        cached = self._cached(key)
        if cached:
            return cached

        params: Dict[str, Any] = {}
        if include_param:
            params["include"] = include_param
        data = self._request("GET", f"/teams/{team_id}", params=params)
        self._store_cache(key, data)
        return data

    def get_fixtures_by_date(
        self,
        fixture_date: date,
        includes: Optional[List[str]] = None,
        *,
        page: Optional[int] = None,
        per_page: Optional[int] = None,
    ) -> Dict[str, Any]:
        include_param = build_includes(includes or [])
        key = f"fixtures_by_date:{fixture_date.isoformat()}:{include_param}:{page or 1}:{per_page or 0}"
        cached = self._cached(key)
        if cached:
            return cached

        params: Dict[str, Any] = {}
        if include_param:
            params["include"] = include_param
        if page is not None and page > 0:
            params["page"] = page
        if per_page is not None and per_page > 0:
            params["per_page"] = per_page
        data = self._request("GET", f"/fixtures/date/{fixture_date.isoformat()}", params=params)
        self._store_cache(key, data)
        return data

    def get_referee(self, referee_id: int) -> Dict[str, Any]:
        key = f"referee:{referee_id}"
        cached = self._cached(key)
        if cached:
            return cached
        data = self._request("GET", f"/referees/{referee_id}", params={})
        self._store_cache(key, data)
        return data

    def get_transfers(self, team_id: int) -> Dict[str, Any]:
        key = f"transfers:{team_id}"
        cached = self._cached(key)
        if cached:
            return cached
        data = self._request("GET", f"/transfers/teams/{team_id}", params={})
        self._store_cache(key, data)
        return data

    # Synthetic fallback data to allow end-to-end flow without API token
    def _dummy_response(self, params: Dict[str, Any]) -> Dict[str, Any]:
        # Very small realistic payload
        return {
            "data": {
                "id": 999999,
                "starting_at": "2026-02-10T20:00:00Z",
                "participants": [
                    {"id": 1, "name": "FC Home", "meta": {"location": "home"}},
                    {"id": 2, "name": "FC Away", "meta": {"location": "away"}},
                ],
                "scores": {
                    "ft_score": "0-0",
                },
                "weatherreport": {
                    "temperature": 18,
                    "wind": 10,
                    "humidity": 65,
                    "type": "cloudy",
                },
                "referee": {"id": 50, "name": "Jane Doe", "yellow_cards_per_game": 4.1, "penalties_per_game": 0.25},
                "statistics": [
                    {
                        "team_id": 1,
                        "shots": 12,
                        "shots_on_target": 6,
                        "possession": 55,
                        "dangerous_attacks": 30,
                        "goals": 2,
                    },
                    {
                        "team_id": 2,
                        "shots": 9,
                        "shots_on_target": 4,
                        "possession": 45,
                        "dangerous_attacks": 25,
                        "goals": 1,
                    },
                ],
                "trends": [],
                "lineups": [],
                "sidelined": [],
                "formations": [],
                "ballCoordinates": [],
                "odds": [],
            }
        }


def get_client() -> SportMonksClient:
    settings = get_settings()
    return SportMonksClient(
        api_token=settings.sportmonks_api_token,
        cache_ttl=settings.cache_ttl_seconds,
        rate_limit_per_minute=settings.rate_limit_per_minute,
        dummy_mode=settings.dummy_mode,
        timeout_seconds=settings.sportmonks_timeout_seconds,
    )
