"""
Test script to check saved_predictions database and API endpoints
"""
import os
from sqlalchemy import create_engine, text
from datetime import date

# Get database URL from environment
db_url = os.getenv("DATABASE_URL")
if not db_url:
    print("ERROR: DATABASE_URL environment variable not set")
    exit(1)

engine = create_engine(db_url)

print("=" * 80)
print("SAVED PREDICTIONS DATABASE ANALYSIS")
print("=" * 80)

with engine.connect() as conn:
    # Check if table exists
    print("\n1. Checking if saved_predictions table exists...")
    result = conn.execute(text("""
        SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_name = 'saved_predictions'
        );
    """))
    table_exists = result.scalar()
    print(f"   Table exists: {table_exists}")
    
    if not table_exists:
        print("\n   ERROR: saved_predictions table does not exist!")
        print("   Run migrations to create the table.")
        exit(1)
    
    # Check total records
    print("\n2. Checking total records...")
    result = conn.execute(text("SELECT COUNT(*) FROM saved_predictions;"))
    total = result.scalar()
    print(f"   Total predictions: {total}")
    
    # Check records by user
    print("\n3. Checking records by user...")
    result = conn.execute(text("""
        SELECT 
            created_by,
            COUNT(*) as count
        FROM saved_predictions
        GROUP BY created_by
        ORDER BY count DESC
        LIMIT 10;
    """))
    rows = result.fetchall()
    if rows:
        print("   User ID | Count")
        print("   --------|------")
        for row in rows:
            print(f"   {row[0] or 'NULL':7} | {row[1]}")
    else:
        print("   No records found")
    
    # Check records by date
    print("\n4. Checking records by prediction_date...")
    result = conn.execute(text("""
        SELECT 
            prediction_date,
            COUNT(*) as count
        FROM saved_predictions
        GROUP BY prediction_date
        ORDER BY prediction_date DESC
        LIMIT 10;
    """))
    rows = result.fetchall()
    if rows:
        print("   Date       | Count")
        print("   -----------|------")
        for row in rows:
            print(f"   {row[0]} | {row[1]}")
    else:
        print("   No records found")
    
    # Check recent records
    print("\n5. Checking most recent records...")
    result = conn.execute(text("""
        SELECT 
            id,
            created_by,
            fixture_id,
            prediction_date,
            match_label,
            created_at
        FROM saved_predictions
        ORDER BY created_at DESC
        LIMIT 5;
    """))
    rows = result.fetchall()
    if rows:
        print("   ID | User | Fixture | Date       | Match")
        print("   ---|------|---------|------------|------")
        for row in rows:
            match_label = (row[4] or "")[:30]
            print(f"   {row[0]:3} | {row[1] or 'NULL':4} | {row[2]:7} | {row[3]} | {match_label}")
    else:
        print("   No records found")
    
    # Check for today's records
    print(f"\n6. Checking records for today ({date.today()})...")
    result = conn.execute(text("""
        SELECT COUNT(*) 
        FROM saved_predictions 
        WHERE prediction_date = :today;
    """), {"today": date.today()})
    today_count = result.scalar()
    print(f"   Today's predictions: {today_count}")
    
    # Check created_by column for NULL values
    print("\n7. Checking for NULL created_by values...")
    result = conn.execute(text("""
        SELECT COUNT(*) 
        FROM saved_predictions 
        WHERE created_by IS NULL;
    """))
    null_count = result.scalar()
    print(f"   Records with NULL created_by: {null_count}")
    
    if null_count > 0:
        print("\n   WARNING: Found records with NULL created_by!")
        print("   This will cause them to not appear when mine_only=true is used.")

print("\n" + "=" * 80)
print("ANALYSIS COMPLETE")
print("=" * 80)
