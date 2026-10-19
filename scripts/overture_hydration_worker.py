"""Overture Maps bounded, checkpointed extraction into Kleenest canonical staging.

Requires claim_overture_hydration_task and stage_overture_hydration_page RPCs.
Fails closed if those RPCs are unavailable. No direct canonical writes.
"""
import json
import os
import sys
import requests

BASE = os.environ["SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
HEADERS = {"apikey": KEY, "Authorization": "Bearer " + KEY, "Content-Type": "application/json"}
LIMIT = min(500, max(1, int(os.getenv("OVERTURE_BATCH_SIZE", "250"))))

def rpc(name, payload):
    response = requests.post(BASE + "/rest/v1/rpc/" + name, headers=HEADERS,
                             json=payload, timeout=(10, 120))
    response.raise_for_status()
    return response.json() if response.content else None

def extract(conn, release, bbox, after):
    if not release or any(c not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-" for c in release):
        raise ValueError("invalid release")
    if not isinstance(bbox, list) or len(bbox) != 4:
        raise ValueError("invalid bbox")
    import math
    west, south, east, north = map(float, bbox)
    if not all(math.isfinite(value) for value in (west, south, east, north)):
        raise ValueError('non-finite coordinates')
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        raise ValueError("invalid coordinates")
    uri = f"s3://overturemaps-us-west-2/release/{release}/theme=places/type=place/*"
    query = """SELECT id, names.primary AS name, categories.primary AS category,
                      ST_X(ST_GeomFromWKB(geometry)) AS longitude, ST_Y(ST_GeomFromWKB(geometry)) AS latitude
               FROM read_parquet(?, hive_partitioning=true)
               WHERE bbox.xmin <= ? AND bbox.xmax >= ?
                 AND bbox.ymin <= ? AND bbox.ymax >= ?
                 AND id COLLATE "C" > ? AND names.primary IS NOT NULL
                 AND ST_X(ST_GeomFromWKB(geometry)) BETWEEN ? AND ?
                 AND ST_Y(ST_GeomFromWKB(geometry)) BETWEEN ? AND ?
               ORDER BY id COLLATE "C" LIMIT ?"""
    return conn.execute(query, [uri, east, west, north, south, after, west, east, south, north, LIMIT]).fetchall()

def run():
    # Initialize the extractor before claiming a leased task.
    import duckdb
    conn = duckdb.connect()
    conn.execute("INSTALL httpfs; LOAD httpfs;")
    conn.execute("INSTALL spatial; LOAD spatial;")
    conn.execute("SET s3_region='us-west-2'")
    # Overture is public: never require cloud credentials for this read.
    conn.execute("SET s3_access_key_id=''")
    conn.execute("SET s3_secret_access_key=''")
    # Refuse to claim a lease if the staging endpoint is absent.
    # The actual claim/stage RPCs enforce atomic leases and cursor advancement.
    task = rpc("claim_overture_hydration_task", {})
    if not task:
        print(json.dumps({"status": "idle"}))
        return
    rows = extract(conn, task["release"], task["bbox"], task["last_source_id"])
    records = []
    for identifier, name, category, longitude, latitude in rows:
        if not identifier or not name or latitude is None or longitude is None:
            continue
        records.append({
            "source_id": "overture:" + str(identifier),
            "name": str(name),
            "latitude": float(latitude),
            "longitude": float(longitude),
            "place_type": "place",
            "source_metadata": {
                "provider": "overture",
                "source_dataset": "places",
                "source_category": category,
                "market_key": task["market_key"],
            },
        })
    # Advance by last raw ID, even if some rows were filtered out.
    # The database staging RPC must persist this cursor even for empty batches.
    last_id = str(rows[-1][0]) if rows else task["last_source_id"]
    result = rpc("stage_overture_hydration_page", {
        "p_task_id": task["task_id"],
        "p_lease_token": task["lease_token"],
        "p_last_id": last_id,
        "p_rows": records,
        "p_exhausted": len(rows) < LIMIT,
    })
    print(json.dumps({"status": "staged", "task": task["task_id"],
                      "fetched": len(rows), "staged": len(records), "result": result}))

if __name__ == "__main__":
    try:
        run()
    except requests.HTTPError as exc:
        print(json.dumps({"status": "blocked", "http_status": exc.response.status_code,
                          "reason": "required checkpoint RPC unavailable or request rejected"}), file=sys.stderr)
        raise
