# Saved Predictions System - Architectural Design

## Executive Summary

This document outlines the comprehensive architecture for the "Sonuç Tahminlerim" (Saved Predictions) system - a feature that allows users to save match predictions, track their accuracy, and integrate with AI chat conversations.

## Current State Analysis

### Database Schema
The [`saved_predictions`](migrations/002_saved_predictions.sql:3) table exists with comprehensive fields:
- **Identity**: `id`, `created_by` (user_id)
- **Fixture Info**: `fixture_id`, `league_id`, `fixture_starting_at`, `fixture_date`, team names, `match_label`
- **Model Info**: `model_id`, `model_name`
- **Prediction Data**: probabilities (home/draw/away), lambda values, `prediction_outcome`
- **Actual Results**: `actual_home_goals`, `actual_away_goals`, `actual_outcome`, `is_correct`
- **Status**: `status` (pending/settled), `settled_at`
- **Snapshots**: `simulation_snapshot` (JSONB), `ai_snapshot` (JSONB)
- **Metadata**: `note`, `prediction_created_at`, `prediction_date`, timestamps

**Missing**: `created_by` column needs to be added via migration.

### Backend Endpoints (Partial)
Located in [`app/admin.py`](app/admin.py:66):
- [`POST /admin/predictions/save`](app/admin.py:2187) - Save prediction with simulation
- [`GET /admin/predictions/daily`](app/admin.py:2383) - List predictions by day
- [`GET /admin/predictions/list`](app/admin.py:2460) - List with date range and archive filter
- [`POST /admin/predictions/{id}/refresh-result`](app/admin.py:2534) - Refresh actual results

**Missing**: Statistics endpoint, bulk refresh endpoint.

### Frontend Components
- [`SavedPredictionsPage.jsx`](web/src/pages/SavedPredictionsPage.jsx:36) - Basic list view with date picker
- [`FixtureDetailPage.jsx`](web/src/pages/FixtureDetailPage.jsx:13) - Simulation page (needs save button)
- [`ChatPage.jsx`](web/src/pages/ChatPage.jsx:9) - Chat interface (needs save integration)

### AI Chat System
- [`ai_chat_threads`](migrations/008_ai_chat_history.sql:1) - Thread management
- [`ai_chat_messages`](migrations/008_ai_chat_history.sql:14) - Message storage
- Relationship: `thread_id` → `fixture_id` → can link to saved predictions

### Scheduler
[`app/scheduler.py`](app/scheduler.py:1) uses APScheduler with cron triggers for daily jobs.

---

## System Architecture

### 1. Database Layer

#### Schema Enhancements

**Migration Required**: Add `created_by` column
```sql
ALTER TABLE saved_predictions 
ADD COLUMN IF NOT EXISTS created_by BIGINT;

CREATE INDEX IF NOT EXISTS idx_saved_predictions_user_date
ON saved_predictions (created_by, prediction_date DESC, prediction_created_at DESC);
```

**Indexes** (existing + new):
- `idx_saved_predictions_prediction_date` - Date-based queries
- `idx_saved_predictions_fixture_id` - Fixture lookups
- `idx_saved_predictions_user_date` - User-specific queries (NEW)

#### Data Relationships

```
┌─────────────────┐
│  auth_users     │
│  - id           │
└────────┬────────┘
         │ 1:N
         │
┌────────▼────────────────┐      ┌──────────────────┐
│  saved_predictions      │      │  ai_chat_threads │
│  - id                   │      │  - id            │
│  - created_by (FK)      │      │  - fixture_id    │
│  - fixture_id           │◄─────┤  - user_id       │
│  - simulation_snapshot  │      └──────────────────┘
│  - ai_snapshot          │
│  - status               │
│  - is_correct           │
└─────────────────────────┘
```

### 2. Backend API Architecture

#### RESTful Endpoint Design

**Base Path**: `/admin/predictions`

##### Core CRUD Operations

1. **Create Prediction**
   - `POST /admin/predictions/save`
   - Request: [`SavePredictionRequest`](app/admin.py:263)
   - Response: `{ prediction_id, fixture_id, match_label, prediction_date, status }`
   - Auth: Required (user_id from token)

2. **List Predictions**
   - `GET /admin/predictions/list`
   - Query params: `date_from`, `date_to`, `mine_only`, `archive`, `page`, `page_size`
   - Response: Paginated list with metadata
   - Filters: Date range, archive (past/future), user ownership

3. **Daily Predictions**
   - `GET /admin/predictions/daily`
   - Query params: `day`, `page`, `page_size`, `league_id`, `mine_only`, `auto_refresh_results`
   - Response: Day-specific paginated list
   - Feature: Optional auto-refresh of results

4. **Refresh Result**
   - `POST /admin/predictions/{prediction_id}/refresh-result`
   - Response: Updated prediction with actual results
   - Logic: Fetches fixture data, updates actual scores

##### New Endpoints Required

5. **Statistics Endpoint** (NEW)
   - `GET /admin/predictions/stats`
   - Query params: `date_from`, `date_to`, `league_id`
   - Response:
     ```json
     {
       "total_predictions": 150,
       "settled_predictions": 120,
       "pending_predictions": 30,
       "correct_predictions": 85,
       "accuracy_rate": 0.708,
       "by_outcome": {
         "home_win": { "total": 50, "correct": 35, "accuracy": 0.70 },
         "draw": { "total": 30, "correct": 20, "accuracy": 0.67 },
         "away_win": { "total": 40, "correct": 30, "accuracy": 0.75 }
       },
       "by_league": [
         { "league_id": 600, "league_name": "Süper Lig", "total": 100, "accuracy": 0.72 }
       ]
     }
     ```

6. **Bulk Refresh Endpoint** (NEW)
   - `POST /admin/predictions/bulk-refresh`
   - Request: `{ date_from?, date_to?, prediction_ids? }`
   - Response: `{ refreshed_count, updated_predictions[] }`
   - Use case: Scheduler job, manual bulk updates

7. **Delete Prediction** (NEW)
   - `DELETE /admin/predictions/{prediction_id}`
   - Response: `{ success: true }`
   - Auth: Only owner can delete

#### Service Layer Functions

**Helper Functions** (existing in [`app/admin.py`](app/admin.py:1)):
- [`_ensure_saved_predictions_table()`](app/admin.py:781) - Table initialization
- [`_prediction_row_to_dict()`](app/admin.py:1700) - Row serialization
- [`_refresh_saved_prediction_result()`](app/admin.py:1488) - Result update logic
- [`_outcome_from_goals()`](app/admin.py:1439) - Outcome calculation
- [`_outcome_from_probabilities()`](app/admin.py:1449) - Prediction outcome

**New Functions Required**:
- `_calculate_prediction_statistics()` - Aggregate stats calculation
- `_bulk_refresh_predictions()` - Batch result updates
- `_link_prediction_to_chat_thread()` - Chat integration

### 3. Frontend Architecture

#### Component Hierarchy

```
SavedPredictionsPage (Enhanced)
├── PredictionFilters (NEW)
│   ├── DateRangePicker
│   ├── QuickFilters (Today, Yesterday, Last Week)
│   └── ArchiveToggle
├── PredictionStats (NEW)
│   ├── AccuracyCard
│   ├── TotalPredictionsCard
│   └── OutcomeBreakdown
├── PredictionList
│   └── PredictionCard (NEW)
│       ├── MatchInfo
│       ├── PredictionDetails
│       ├── ActualResult
│       ├── AccuracyBadge
│       └── ActionButtons
└── Pagination

FixtureDetailPage (Enhanced)
├── SimulationResults
└── SavePredictionButton (NEW)
    └── SavePredictionModal (NEW)
        ├── NoteInput
        ├── IncludeAIToggle
        └── SaveButton

ChatMessageList (Enhanced)
└── SaveFromChatButton (NEW)
    └── SavePredictionModal (reused)
```

#### State Management

**SavedPredictionsPage State**:
```javascript
{
  filters: {
    dateFrom: Date | null,
    dateTo: Date | null,
    quickFilter: 'today' | 'yesterday' | 'last_week' | 'custom',
    archive: boolean,
    page: number
  },
  predictions: {
    items: Prediction[],
    total: number,
    page: number,
    total_pages: number,
    loading: boolean,
    error: string | null
  },
  stats: {
    data: PredictionStats | null,
    loading: boolean,
    error: string | null
  }
}
```

**SavePredictionModal State**:
```javascript
{
  isOpen: boolean,
  note: string,
  includeAI: boolean,
  saving: boolean,
  error: string | null
}
```

#### API Client Functions

**New functions in [`web/src/lib/api.js`](web/src/lib/api.js:1)**:
```javascript
// Predictions API
export async function savePrediction(fixtureId, options) { ... }
export async function getPredictionsList(filters) { ... }
export async function getPredictionStats(filters) { ... }
export async function refreshPrediction(predictionId) { ... }
export async function deletePrediction(predictionId) { ... }
```

### 4. Scheduler Architecture

#### Job Design

**New Scheduler Job**: Automatic Score Updates

```python
# In app/scheduler.py

async def update_predictions_results_job():
    """
    Updates actual results for pending predictions.
    Runs every 6 hours.
    """
    try:
        logger.info("Starting predictions results update job...")
        settings = get_settings()
        
        # Get predictions from last 7 days that are still pending
        date_from = date.today() - timedelta(days=7)
        date_to = date.today()
        
        # Call bulk refresh endpoint
        updated_count = await bulk_refresh_predictions(
            settings=settings,
            date_from=date_from,
            date_to=date_to,
            status='pending'
        )
        
        logger.info(f"Updated {updated_count} predictions")
        
    except Exception as e:
        logger.error(f"Predictions update job failed: {e}", exc_info=True)
```

**Scheduler Configuration**:
```python
scheduler.add_job(
    update_predictions_results_job,
    trigger=CronTrigger(hour='*/6'),  # Every 6 hours
    id="update_predictions_results",
    name="Update Saved Predictions Results",
    replace_existing=True,
)
```

### 5. AI Chat Integration Architecture

#### Integration Points

**1. Save from Chat Thread**
- Location: [`ChatMessageList.jsx`](web/src/components/chat/ChatMessageList.jsx:9)
- Trigger: "Save Prediction" button in chat header
- Data flow:
  ```
  Chat Thread → Get latest AI response → Extract fixture_id → 
  Trigger simulation → Save with ai_snapshot
  ```

**2. Link Prediction to Thread**
- Store `thread_id` reference in `ai_snapshot` JSONB field
- Schema:
  ```json
  {
    "thread_id": 123,
    "commentary": "AI analysis text...",
    "provider": "openai",
    "provider_model": "gpt-4",
    "messages_snapshot": [
      { "role": "user", "content": "..." },
      { "role": "assistant", "content": "..." }
    ]
  }
  ```

**3. View Chat from Prediction**
- Add "View Chat" button in prediction card
- Navigate to: `/chat?thread_id={thread_id}`
- Restore chat context

#### Data Flow Diagram

```
┌──────────────┐
│  User asks   │
│  about match │
└──────┬───────┘
       │
       ▼
┌──────────────────┐
│  AI responds     │
│  with analysis   │
└──────┬───────────┘
       │
       ▼
┌──────────────────────┐
│  User clicks         │
│  "Save Prediction"   │
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐      ┌─────────────────┐
│  Run simulation      │─────►│  Save to DB     │
│  (if not exists)     │      │  with ai_snapshot│
└──────────────────────┘      └─────────────────┘
       │
       ▼
┌──────────────────────┐
│  Show success        │
│  + link to view      │
└──────────────────────┘
```

### 6. UI/UX Design Patterns

#### Filter System

**Quick Filters** (Buttons):
- Bugün (Today)
- Dün (Yesterday)
- Geçen Hafta (Last Week)
- Özel Tarih (Custom Date Range)

**Date Range Picker**:
- From: `<input type="date">`
- To: `<input type="date">`
- Apply button

**Archive Toggle**:
- Switch: "Geçmiş Maçlar" / "Gelecek Maçlar"
- Default: Future matches

#### Prediction Card Design

```
┌─────────────────────────────────────────────────┐
│ ✓/✗  [Team Logo] Team A vs Team B [Team Logo]  │
│      Süper Lig • 01 Mar 2026, 19:00            │
├─────────────────────────────────────────────────┤
│ Tahmin: Ev %45 | Ber %30 | Dep %25             │
│ Sonuç: 2-1 (Ev Galibiyeti)                     │
│ Durum: ✓ Doğru                                  │
├─────────────────────────────────────────────────┤
│ Not: "Ev sahibi formu çok iyi..."              │
│ Model: SuperLig_Pro_v2.3                        │
├─────────────────────────────────────────────────┤
│ [Yenile] [Sohbeti Gör] [Sil]                   │
└─────────────────────────────────────────────────┘
```

#### Statistics Dashboard

```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Toplam       │ │ Doğruluk     │ │ Bekleyen     │
│   150        │ │   %70.8      │ │    30        │
└──────────────┘ └──────────────┘ └──────────────┘

Sonuç Türüne Göre Başarı:
┌─────────────────────────────────────────────────┐
│ Ev Galibiyeti:    ████████░░  70% (35/50)      │
│ Beraberlik:       ███████░░░  67% (20/30)      │
│ Deplasman:        █████████░  75% (30/40)      │
└─────────────────────────────────────────────────┘
```

### 7. Security & Authorization

**Access Control**:
- All endpoints require authentication
- Users can only see/modify their own predictions
- Admin role can view all predictions (future enhancement)

**Data Validation**:
- Input sanitization for notes (max 500 chars)
- Date range validation (max 1 year)
- Fixture ID validation (must exist)

**Rate Limiting**:
- Save prediction: 10 per minute per user
- Refresh result: 30 per minute per user
- List queries: 60 per minute per user

### 8. Performance Considerations

**Database Optimization**:
- Indexes on frequently queried columns
- JSONB indexes for `ai_snapshot` queries (if needed)
- Pagination for all list endpoints (max 100 per page)

**Caching Strategy**:
- Cache statistics for 5 minutes
- Cache fixture data for 1 hour
- Invalidate on new predictions

**Query Optimization**:
- Use `LIMIT` and `OFFSET` for pagination
- Avoid N+1 queries with proper joins
- Use `COUNT(*)` with same WHERE clause for totals

### 9. Error Handling

**Backend Error Responses**:
```json
{
  "detail": "Error message",
  "error_code": "PREDICTION_NOT_FOUND",
  "status_code": 404
}
```

**Frontend Error Handling**:
- Network errors: Retry with exponential backoff
- Validation errors: Show inline field errors
- Server errors: Show toast notification
- Loading states: Skeleton screens

### 10. Testing Strategy

**Backend Tests**:
- Unit tests for helper functions
- Integration tests for endpoints
- Test fixtures for database operations
- Mock SportMonks API responses

**Frontend Tests**:
- Component rendering tests
- User interaction tests (save, filter, refresh)
- API integration tests with MSW
- Accessibility tests

---

## Technology Stack

**Backend**:
- FastAPI (Python)
- SQLAlchemy (ORM)
- PostgreSQL (Database)
- APScheduler (Job scheduling)
- Pydantic (Validation)

**Frontend**:
- React 18
- React Router v6
- Context API (State management)
- CSS Modules (Styling)
- Date-fns (Date utilities)

**Infrastructure**:
- Docker (Containerization)
- Celery (Background tasks)
- Redis (Cache & queue)

---

## Migration Path

**Phase 1**: Database & Backend Core
1. Add `created_by` column migration
2. Implement statistics endpoint
3. Implement bulk refresh endpoint
4. Add scheduler job

**Phase 2**: Frontend Core
1. Enhance SavedPredictionsPage with filters
2. Add statistics dashboard
3. Implement save button in FixtureDetailPage
4. Create SavePredictionModal

**Phase 3**: Chat Integration
1. Add save button in ChatMessageList
2. Implement chat-to-prediction linking
3. Add "View Chat" navigation
4. Test end-to-end flow

**Phase 4**: Polish & Optimization
1. Add loading states and error handling
2. Implement caching
3. Add animations and transitions
4. Performance testing and optimization

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Scheduler job overload | High | Batch processing, rate limiting |
| Large result sets | Medium | Pagination, date range limits |
| Stale fixture data | Medium | Regular refresh job, cache invalidation |
| Chat thread orphaning | Low | Soft delete, archive old threads |
| JSONB query performance | Medium | Selective indexing, limit queries |

---

## Future Enhancements

1. **Social Features**: Share predictions with friends
2. **Leaderboards**: Compare accuracy with other users
3. **Prediction Insights**: ML-based accuracy improvement suggestions
4. **Export**: Download predictions as CSV/PDF
5. **Notifications**: Alert when prediction is settled
6. **Advanced Filters**: By model, by league, by accuracy
7. **Prediction History Graph**: Visual timeline of accuracy
8. **Betting Integration**: Compare predictions with actual odds

---

## Conclusion

This architecture provides a robust, scalable foundation for the Saved Predictions system. It leverages existing infrastructure while adding new capabilities for tracking, analyzing, and improving prediction accuracy. The modular design allows for incremental implementation and future enhancements.
