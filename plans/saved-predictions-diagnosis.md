# Saved Predictions Issue - Diagnostic Report

## Problem Statement
User sees "Güncel tahmin yok" message on the "Sonuç Tahminlerim" page even though predictions may have been saved.

## Investigation Results

### 1. Database Analysis
```sql
-- Total predictions: 15
-- Unique users: 2
-- Records with NULL created_by: 11 (73%)
-- Prediction dates: 2026-02-11 (4), 2026-02-09 (2), 2026-02-08 (9)
-- Today's date: 2026-03-01
-- Today's predictions: 0
```

### 2. Root Causes Identified

#### **PRIMARY ISSUE: NULL created_by Values**
- **Impact**: 11 out of 15 predictions (73%) have `created_by = NULL`
- **Why this matters**: Frontend uses `mine_only=true` parameter which filters by `created_by = current_user.id`
- **Result**: Predictions with NULL created_by are NEVER shown to any user

**Code Evidence:**
```python
# app/admin.py line 2401-2403
if mine_only:
    where_parts.append("created_by = :created_by")
    params["created_by"] = int(current_user.id)
```

```javascript
// web/src/pages/SavedPredictionsPage.jsx line 66
params.set("mine_only", "true");  // Always true!
```

#### **SECONDARY ISSUE: Date Mismatch**
- **Impact**: No predictions exist for today (2026-03-01)
- **Why this matters**: Frontend defaults to today's date
- **Result**: Even if created_by was fixed, user would see empty results for today

**Code Evidence:**
```javascript
// web/src/pages/SavedPredictionsPage.jsx line 38
const [savedPredictionsDay, setSavedPredictionsDay] = useState(todayLocalISODate());
```

### 3. Possible Sources of NULL created_by

Looking at the save endpoint:

```python
# app/admin.py line 2259-2262
INSERT INTO saved_predictions (
    created_by,  # This field is included
    fixture_id,
    ...
```

The `created_by` field IS being inserted, but the value comes from `current_user.id`. 

**Hypothesis 1**: Old predictions were saved before `created_by` column was added
- Migration 002 creates table WITHOUT created_by
- Line 852 in admin.py adds it later: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS created_by BIGINT`
- Old records would have NULL

**Hypothesis 2**: Predictions saved without authentication (unlikely given Depends(get_current_user))

### 4. API Endpoint Analysis

**Save Endpoint**: `/admin/predictions/save` (POST)
- ✅ Requires authentication: `Depends(get_current_user)`
- ✅ Inserts created_by: Line 2262, 2319
- ✅ Uses current_user.id: Line 2319

**List Endpoint**: `/admin/predictions/daily` (GET)
- ✅ Requires authentication: `Depends(get_current_user)`
- ⚠️ Filters by created_by when mine_only=True (line 2401-2403)
- ⚠️ Frontend ALWAYS sends mine_only=true (line 66)

### 5. Frontend Analysis

**SavedPredictionsPage.jsx**:
- Line 38: Defaults to today's date
- Line 66: ALWAYS sends `mine_only=true`
- Line 70: Calls `/admin/predictions/daily` endpoint
- Line 228: Shows "noRecordsToday" message when items.length === 0

## Diagnosis Summary

### Most Likely Scenario (5/7 confidence)
1. User has old predictions with `created_by = NULL` (from before column was added)
2. User is looking at today's date (2026-03-01) which has no predictions
3. Even if user changes date to 2026-02-11, they won't see NULL predictions due to mine_only filter

### Alternative Scenarios

**Scenario 2** (2/7 confidence): User never saved predictions
- Database shows 15 predictions exist, so SOMEONE saved them
- But maybe not THIS user

**Scenario 3** (1/7 confidence): Bug in save endpoint
- Unlikely: code shows created_by is properly inserted
- Would need to test save functionality

## Recommended Actions

### Immediate Fix (High Priority)
1. **Update NULL created_by records** - Assign them to a user or mark as legacy
2. **Add logging** to save endpoint to verify created_by is being set

### Code Improvements (Medium Priority)
1. **Make mine_only optional** in frontend with toggle
2. **Show date range** instead of single day
3. **Add "no predictions" state** that suggests trying different dates

### Testing Required
1. Test prediction save with current user
2. Verify created_by is populated
3. Test with different dates
4. Test mine_only=false to see all predictions

## Next Steps
1. Add diagnostic logging to save endpoint
2. Fix NULL created_by records in database
3. Test save functionality
4. Consider UX improvements
