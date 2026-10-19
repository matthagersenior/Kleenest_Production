"""Overture Maps extraction worker, resumable by stable Overture place ID.

This worker intentionally stages through the canonical ingestion pipeline. Task
completion requires a separate reconciliation pass over staged batches.
"""
import json
import os
import requests
import duckdb

BASE = os.environ["SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
HEADERS = {"apikey": KEY, "Authorization": "Bearer " + KEY, "Content-Type": "application/json"}
LIMIT = min(500, max(1, int(os.getenv("OVERTURE_BATCH_SIZE", "250"))))

def rest(method, path, **kwargs):
    r = requests.request(method, BASE + "/rest/v1/" + path, headers=HEADERS, timeout=120, **kwargs)
    r.raise_for_status()
    return r.json() if r.content else None

def extract(conn, release, bbox, after):
    if not release or any(c not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-" for c in release):
        raise ValueError("invalid release")
    if not isinstance(bbox, list) or len(bbox) != 4:
        raise ValueError("invalid bbox")
    west, south, east, north = map(float, bbox)
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        raise ValueError("invalid coordinates")
    path = f"s3://overturemaps-us-west-2/release/{release}/theme=places/type=place/*"
    sql = """SELECT id, names.primary AS name, categories.primary AS category,
                    ST_X(geometry) AS longitude, ST_Y(geometry) AS latitude
             FROM read_parquet(?, hive_partitioning=true)
             WHERE bbox.xmin <= ? AND bbox.xmax >= ?
               AND bbox.ymin <= ? AND bbox.ymax >= ?
               AND id > ? AND names.primary IS NOT NULL
             ORDER BY id LIMIT ?"""
    return conn.execute(sql, [path, east, west, north, south, after, LIMIT]).fetchall()

def main():
    tasks = rest("GET", "place_discovery_hydration_queue", params={
        "select": "id,market_key,bbox,release,status,owner_paused",
        "source_key": "eq.overture", "status": "eq.pending",
        "owner_paused": "eq.false", "order": "priority.desc,requested_at.asc", "limit": "20"
    })
    if not tasks:
        print(json.dumps({"status": "idle"}))
        return
    # No queue cursor exists yet. A separate checkpoint table is required to
    # prevent replay and distinguish staged vs canonically committed records.
    # Until it is deployed, fail closed instead of importing an arbitrary page.
    if os.getenv("OVERTURE_ENABLE_WRITES") != "true":
        print(json.dumps({"status": "preflight", "eligible": len(tasks)}))
        return
    raise RuntimeError("Checkpointed claim/stage/commit RPC not installed: refusing unsafe writes")

if __name__ == "__main__":
    main()
