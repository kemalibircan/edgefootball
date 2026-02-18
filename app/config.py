from __future__ import annotations

from functools import lru_cache
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    sportmonks_api_token: Optional[str] = None
    openai_api_key: Optional[str] = None
    openai_model: str = "gpt-5"
    db_url: str = "postgresql://football:football@localhost:5432/football"
    redis_url: str = "redis://localhost:6379/0"
    dummy_mode: bool = False
    log_level: str = "INFO"
    monte_carlo_runs: int = 10000
    simulate_min_monte_carlo_runs: int = 1500
    simulate_max_monte_carlo_runs: int = 10000
    simulate_feature_cache_ttl_seconds: int = 120
    simulate_model_cache_ttl_seconds: int = 300

    # Rate limiting
    rate_limit_per_minute: int = 55  # stay under typical 60 rpm
    cache_ttl_seconds: int = 600
    sportmonks_timeout_seconds: int = 120
    openai_timeout_seconds: int = 45

    # Auth & credit system
    auth_secret: str = "footballai-dev-secret-change-me"
    auth_token_ttl_hours: int = 72
    auth_initial_credits: int = 100
    simulation_credit_cost: int = 7
    ai_commentary_credit_cost: int = 10
    model_training_credit_cost: int = 5
    ai_query_credit_cost: int = 10
    advanced_mode_price_tl: int = 500
    advanced_mode_package_key: str = "advanced-mode-500"
    model_training_requires_advanced_mode: bool = True
    pro_training_data_sources: str = "team_form,elo,injuries,lineup_strength,weather,referee,market_odds"
    bootstrap_superadmin_username: str = "superadmin"
    bootstrap_superadmin_email: str = "superadmin@footballai.local"
    bootstrap_superadmin_password: str = "superadmin123"

    # Auth email / OTP
    auth_code_ttl_minutes: int = 10
    auth_code_resend_cooldown_seconds: int = 60
    auth_code_max_attempts: int = 5
    google_oauth_client_ids: str = ""

    # SMTP
    smtp_host: Optional[str] = None
    smtp_port: int = 587
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_from_address: Optional[str] = None
    smtp_from_name: str = "Football AI"
    smtp_use_tls: bool = True
    smtp_use_ssl: bool = False
    smtp_timeout_seconds: int = 20
    smtp_retry_attempts: int = 2
    smtp_retry_backoff_seconds: float = 1.0

    # Fixture board cache
    fixture_cache_league_ids: str = "600,564,8,384,2,5"  # Süper Lig, La Liga, Premier League, Serie A, Champions League, Europa League
    fixture_cache_horizon_days: int = 7
    fixture_cache_refresh_hour_utc: int = 3
    fixture_cache_refresh_minute_utc: int = 15

    # Coupon generation
    coupon_generation_credit_cost: int = 15
    coupon_generation_run_ttl_hours: int = 24
    coupon_generation_max_simulations: int = 90
    coupon_generation_soft_time_limit_seconds: int = 120

    # League model routing and bootstrap
    league_model_league_ids: str = "600,564,8,384,2,5"  # Süper Lig, La Liga, Premier League, Serie A, Champions League, Europa League
    league_model_target_rows: int = 1000
    league_model_min_rows: int = 600
    league_model_training_mode: str = "latest"
    league_model_retrain_weekday_utc: int = 0
    league_model_retrain_hour_utc: int = 3
    league_model_retrain_minute_utc: int = 30
    strict_league_model_routing: bool = True
    allow_global_fallback_model: bool = False

    # Modeling quality controls
    training_feature_schema_version: str = "v2"
    training_enable_live_stats_by_default: bool = False
    training_walk_forward_splits: int = 4
    training_odds_blend_grid_step: float = 0.05


@lru_cache
def get_settings() -> Settings:
    return Settings()
