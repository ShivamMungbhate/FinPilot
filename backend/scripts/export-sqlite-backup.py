import sqlite3
import json
import os
import sys

def backup_sqlite():
    db_path = os.path.join(os.path.dirname(__file__), "..", "prisma", "dev.db")
    backup_dir = os.path.join(os.path.dirname(__file__), "..", "backups")
    os.makedirs(backup_dir, exist_ok=True)
    out_file = os.path.join(backup_dir, "dev_db_snapshot.json")

    if not os.path.exists(db_path):
        print(f"ERROR: SQLite database not found at {db_path}", file=sys.stderr)
        sys.exit(1)

    # Read-only URI mode to ensure no accidental mutations
    uri = f"file:{os.path.abspath(db_path)}?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    tables = [r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';").fetchall()]
    print(f"Found tables: {tables}")

    data = {}
    total_records = 0
    for tbl in tables:
        rows = [dict(r) for r in c.execute(f"SELECT * FROM \"{tbl}\"").fetchall()]
        data[tbl] = rows
        total_records += len(rows)
        print(f"  Extracted table '{tbl}': {len(rows)} records")

    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"\nSUCCESS: Exported {total_records} records to {out_file}")
    conn.close()

if __name__ == "__main__":
    backup_sqlite()
