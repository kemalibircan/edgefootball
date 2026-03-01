from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone, timedelta, date
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import create_engine, text

from app.config import Settings, get_settings
from app.image_generation import generate_slider_images_batch, generate_match_based_slider_images

logger = logging.getLogger(__name__)

scheduler: Optional[AsyncIOScheduler] = None


async def daily_content_generation_job():
    """
    Daily content generation job.
    Runs every day at 6:00 AM local time.
    """
    try:
        logger.info("Starting daily content generation job...")
        settings = get_settings()

        if not getattr(settings, "daily_generation_enabled", True):
            logger.info("Daily generation disabled, skipping")
            return

        logger.info("Generating match-based slider images...")
        slider_results = await generate_match_based_slider_images(settings=settings)
        logger.info(f"Generated {len(slider_results)} match-based slider images")

        for i, result in enumerate(slider_results, 1):
            logger.info(f"  Image {i}: {result.get('relative_url')}")

        logger.info("Daily content generation job completed successfully")

    except Exception as e:
        logger.error(f"Daily content generation job failed: {e}", exc_info=True)


async def update_predictions_results_job():
    """
    Updates actual results for pending predictions.
    Runs every 6 hours to check for settled matches.
    """
    try:
        logger.info("Starting predictions results update job...")
        settings = get_settings()
        
        # Import here to avoid circular dependency
        from app.admin import (
            SAVED_PREDICTIONS_TABLE,
            _ensure_saved_predictions_table,
            _refresh_saved_prediction_result,
        )
        
        engine = create_engine(settings.db_url)
        _ensure_saved_predictions_table(engine)
        
        # Get predictions from last 7 days that are still pending
        date_from = date.today() - timedelta(days=7)
        date_to = date.today()
        
        select_sql = text(
            f"""
            SELECT * FROM {SAVED_PREDICTIONS_TABLE}
            WHERE status = 'pending'
            AND fixture_date >= :date_from
            AND fixture_date <= :date_to
            ORDER BY fixture_date DESC
            """
        )
        
        updated_count = 0
        with engine.begin() as conn:
            rows = conn.execute(
                select_sql,
                {"date_from": date_from, "date_to": date_to}
            ).mappings().all()
            
            logger.info(f"Found {len(rows)} pending predictions to check")
            
            for row in rows:
                row_dict = dict(row)
                updated = _refresh_saved_prediction_result(conn, settings, row_dict)
                if updated:
                    updated_count += 1
        
        logger.info(f"Predictions update job completed: {updated_count} predictions updated")
        
    except Exception as e:
        logger.error(f"Predictions update job failed: {e}", exc_info=True)


def start_scheduler():
    """Initialize and start the background scheduler."""
    global scheduler

    if scheduler is not None:
        logger.warning("Scheduler already started")
        return

    scheduler = AsyncIOScheduler(timezone="UTC")

    scheduler.add_job(
        daily_content_generation_job,
        trigger=CronTrigger(hour=6, minute=0),
        id="daily_content_generation",
        name="Daily Content Generation (Slider Images, AI Highlights)",
        replace_existing=True,
    )
    
    scheduler.add_job(
        update_predictions_results_job,
        trigger=CronTrigger(hour="*/6"),  # Every 6 hours
        id="update_predictions_results",
        name="Update Saved Predictions Results",
        replace_existing=True,
    )

    scheduler.start()
    logger.info("Scheduler started successfully")


def stop_scheduler():
    """Stop the background scheduler."""
    global scheduler
    
    if scheduler is None:
        return
    
    scheduler.shutdown(wait=True)
    scheduler = None
    logger.info("Scheduler stopped")


def get_scheduler() -> Optional[AsyncIOScheduler]:
    """Get the current scheduler instance."""
    return scheduler
