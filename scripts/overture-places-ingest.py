#!/usr/bin/env python3
"""Ingest Overture Maps Places into Kleenest's canonical location registry.

The worker reads only bounded GeoParquet windows from Overture's public S3
release, transforms them to the existing ingest_external_locations contract,
and processes consumer/market hydration requests from Supabase.

Google Places is intentionally not used here.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import os
import socket
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Iterable

STAC_URL = "https://stac.overturemaps.org/catalog.json"
S3_ROOT = "s3://overturemaps-us-west-2/release"
SOURCE_KEY = "overture"
DEFAULT_MIN_CONFIDENCE = 0.30
batch_size = 50


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def http_retry_attempts(method: str, *, retries: int = 2) -> int:
    normalized = method.upper()
    return 1 + max(0, int(retries)) if normalized in {"GET", "PATCH"} else 1


def http_timeout_seconds(method: str) -> int:
    return 85 if method.upper() == "POST" else 45


def http_json(method: str, url: str, *, key: str | None = None, body: Any = None) -> Any:
    headers = {"Accept": "application/json", "User-Agent": "Kleenest/1.0 Overture ingestion"}
    if key:
        headers["apikey"] = key
        headers["Authorization"] = f"Bearer {key}"
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body, separators=(",", ":")).encode("utf-8")

    normalized_method = method.upper()
    max_attempts = http_retry_attempts(normalized_method, retries=2)
    retryable_statuses = {408, 425, 429, 500, 502, 503, 504}
    for attempt in range(1, max_attempts + 1):
        request = urllib.request.Request(url, data=data, headers=headers, method=normalized_method)
        try:
            with urllib.request.urlopen(request, timeout=http_timeout_seconds(normalized_method)) as response:
                payload = response.read()
                return json.loads(payload.decode("utf-8")) if payload else None
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:1500]
            if normalized_method == "GET" and exc.code in retryable_statuses and attempt < max_attempts:
                time.sleep(min(8, 2 ** (attempt - 1)))
                continue
            raise RuntimeError(f"HTTP {exc.code} for {url}: {detail}") from exc
        except (TimeoutError, socket.timeout, urllib.error.URLError) as exc:
            if normalized_method == "GET" and attempt < max_attempts:
                time.sleep(min(8, 2 ** (attempt - 1)))
                continue
            raise RuntimeError(
                f"{normalized_method} {url} failed after {attempt} attempt(s): {exc}"
            ) from exc
    raise RuntimeError(f"{normalized_method} {url} failed after {max_attempts} attempts.")


def latest_release() -> str:
    payload = http_json("GET", STAC_URL)
    release = str((payload or {}).get("latest") or "").strip().strip("/")
    if not release:
        raise RuntimeError("Overture STAC catalog did not publish a latest release.")
    return release


def normalize_state(region: Any) -> str | None:
    value = str(region or "").strip()
    if not value:
        return None
    if value.upper().startswith("US-") and len(value) == 5:
        return value[-2:].upper()
    return value.upper() if len(value) == 2 else value


def hierarchy_values(raw: Any) -> list[str]:
    if raw is None:
        return []
    if isinstance(raw, list):
        return [str(v).lower() for v in raw if v]
    if isinstance(raw, str):
        try:
            decoded = json.loads(raw)
            return [str(v).lower() for v in decoded] if isinstance(decoded, list) else []
        except json.JSONDecodeError:
            return [raw.lower()]
    return []


def place_type(basic_category: Any, taxonomy_primary: Any, hierarchy_raw: Any) -> str:
    basic = str(basic_category or "").lower()
    primary = str(taxonomy_primary or "").lower()
    hierarchy = hierarchy_values(hierarchy_raw)
    categories = set(hierarchy + [basic, primary])

    if "cafe" in categories or "coffee_shop" in categories:
        return "cafe"
    if "gas_station" in categories or "fuel_station" in categories or "petrol_station" in categories:
        return "gas_station"
    if "restaurant" in categories or "food_and_drink" in categories or any("restaurant" in x for x in categories):
        return "restaurant"
    if "shopping" in categories or "supermarket" in categories or "convenience_store" in categories or "mall" in categories:
        return "shopping"
    if "health_care" in categories or "healthcare" in categories or any(x in categories for x in ("hospital", "clinic", "pharmacy", "dentist", "doctor")):
        return "health"
    if "lodging" in categories or any(x in categories for x in ("hotel", "motel", "hostel")):
        return "lodging"
    if "park" in categories or "sports_and_recreation" in categories or any(x in categories for x in ("playground", "nature_reserve")):
        return "park"
    if "library" in categories:
        return "library"
    if any(x in categories for x in ("police_station", "fire_station", "public_safety")):
        return "public_safety"
    if any(x in categories for x in ("bus_station", "railway_station", "train_station", "transit_station")):
        return "transit"
    return "service"


def overture_row(record: tuple[Any, ...], release: str, captured_at: str) -> dict[str, Any] | None:
    (
        overture_id,
        name,
        basic_category,
        taxonomy_primary,
        taxonomy_hierarchy_json,
        confidence,
        operating_status,
        website,
        phone,
        brand_name,
        address,
        city,
        region,
        postal_code,
        country,
        longitude,
        latitude,
        sources_json,
    ) = record

    if not overture_id or not name:
        return None
    try:
        lat = float(latitude)
        lng = float(longitude)
    except (TypeError, ValueError):
        return None
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        return None

    return {
        "source_id": f"overture:{overture_id}",
        "latitude": lat,
        "longitude": lng,
        "name": str(name).strip(),
        "place_type": place_type(basic_category, taxonomy_primary, taxonomy_hierarchy_json),
        "address": str(address).strip() if address else None,
        "city": str(city).strip() if city else None,
        "state": normalize_state(region),
        "postal_code": str(postal_code).strip() if postal_code else None,
        "country": str(country).strip().upper() if country else "US",
        "phone": str(phone).strip() if phone else None,
        "website": str(website).strip() if website else None,
        "brand": str(brand_name).strip() if brand_name else None,
        "operator_name": None,
        "source_metadata": {
            "provider": "overture",
            "source_dataset": "overture_places",
            "dataset": f"overture_places_{release}",
            "publisher": "Overture Maps Foundation",
            "source_category": str(basic_category or taxonomy_primary or "place"),
            "source_confidence": str(confidence) if confidence is not None else None,
            "captured_at": captured_at,
            "overture_release": release,
            "overture_gers_id": str(overture_id),
            "taxonomy_primary": taxonomy_primary,
            "taxonomy_hierarchy": hierarchy_values(taxonomy_hierarchy_json),
            "operating_status": operating_status,
            "sources": json.loads(sources_json) if sources_json else None,
        },
    }


def connect_duckdb() -> Any:
    try:
        import duckdb  # type: ignore
    except ImportError as exc:
        raise RuntimeError("duckdb is required; install it with 'pip install duckdb'.") from exc
    con = duckdb.connect(database=":memory:")
    con.execute("INSTALL httpfs")
    con.execute("LOAD httpfs")
    con.execute("SET s3_region='us-west-2'")
    con.execute("PRAGMA enable_progress_bar=false")
    return con


def query_places(con: Any, release: str, bbox: list[float], min_confidence: float) -> Any:
    west, south, east, north = bbox
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        raise ValueError("bbox must be WEST,SOUTH,EAST,NORTH within valid coordinate ranges")
    source = f"{S3_ROOT}/{release}/theme=places/type=place/*"
    sql = """
        select
          id,
          names.primary as name,
          basic_category,
          taxonomy.primary as taxonomy_primary,
          cast(cast(taxonomy.hierarchy as json) as varchar) as taxonomy_hierarchy_json,
          confidence,
          operating_status,
          websites[1] as website,
          phones[1] as phone,
          brand.names.primary as brand_name,
          addresses[1].freeform as address,
          addresses[1].locality as city,
          addresses[1].region as region,
          addresses[1].postcode as postal_code,
          addresses[1].country as country,
          bbox.xmin as longitude,
          bbox.ymin as latitude,
          cast(cast(sources as json) as varchar) as sources_json
        from read_parquet(?, filename=true, hive_partitioning=1)
        where bbox.xmin between ? and ?
          and bbox.ymin between ? and ?
          and names.primary is not null
          and (operating_status is null or operating_status <> 'permanently_closed')
          and (confidence is null or confidence >= ?)
    """
    return con.execute(sql, [source, west, east, south, north, min_confidence])


def source_policy(url: str, key: str) -> dict[str, Any]:
    query = urllib.parse.urlencode(
        {
            "select": "source_key,enabled,max_requests_per_cycle",
            "source_key": f"eq.{SOURCE_KEY}",
            "limit": "1",
        },
        safe="(),.",
    )
    endpoint = f"{url.rstrip('/')}/rest/v1/national_ingestion_source_policies?{query}"
    data = http_json("GET", endpoint, key=key)
    return data[0] if isinstance(data, list) and data else {}


def storage_status(url: str, key: str) -> dict[str, Any]:
    endpoint = f"{url.rstrip('/')}/rest/v1/rpc/national_ingestion_storage_status"
    data = http_json("POST", endpoint, key=key, body={})
    return data if isinstance(data, dict) else {}


def effective_job_limit(requested: int, policy: dict[str, Any]) -> int:
    configured = int(policy.get("max_requests_per_cycle") or requested or 1)
    return max(1, min(max(1, int(requested)), configured, 8))


def supabase_rpc(url: str, key: str, rows: list[dict[str, Any]]) -> dict[str, Any]:
    endpoint = f"{url.rstrip('/')}/rest/v1/rpc/ingest_external_locations"
    result = http_json(
        "POST",
        endpoint,
        key=key,
        body={"p_source_key":"overture", "p_rows": rows},
    )
    return result or {}


def patch_queue(url: str, key: str, request_id: str, payload: dict[str, Any]) -> None:
    endpoint = f"{url.rstrip('/')}/rest/v1/place_discovery_hydration_queue?id=eq.{urllib.parse.quote(request_id)}"
    http_json("PATCH", endpoint, key=key, body=payload)


def queue_rows(url: str, key: str, limit: int) -> list[dict[str, Any]]:
    query = urllib.parse.urlencode(
        {
            "select": "id,request_key,market_key,latitude,longitude,radius_meters,bbox,priority,status,attempt_count",
            "status": "in.(pending,failed)",
            "attempt_count": "lt.5",
            "order": "priority.asc,requested_at.asc",
            "limit": str(max(1, min(limit, 8))),
        },
        safe="(),.",
    )
    endpoint = f"{url.rstrip('/')}/rest/v1/place_discovery_hydration_queue?{query}"
    data = http_json("GET", endpoint, key=key)
    return data if isinstance(data, list) else []


def stale_queue_rows(url: str, key: str, stale_minutes: int = 90) -> list[dict[str, Any]]:
    cutoff = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(minutes=max(15, stale_minutes))).isoformat().replace("+00:00", "Z")
    query = urllib.parse.urlencode(
        {
            "select": "id,request_key,status,attempt_count,started_at",
            "status": "eq.running",
            "started_at": f"lt.{cutoff}",
            "attempt_count": "lt.5",
            "order": "started_at.asc",
            "limit": "8",
        },
        safe="(),.:-",
    )
    endpoint = f"{url.rstrip('/')}/rest/v1/place_discovery_hydration_queue?{query}"
    data = http_json("GET", endpoint, key=key)
    return data if isinstance(data, list) else []


def recover_stale_queue(url: str, key: str, stale_minutes: int = 90) -> int:
    stale = stale_queue_rows(url, key, stale_minutes)
    recovered = 0
    for job in stale:
        request_id = str(job.get("id") or "")
        if not request_id:
            continue
        patch_queue(
            url,
            key,
            request_id,
            {
                "status": "failed",
                "last_error": "STALE_WORKER_RECOVERED",
                "updated_at": utc_now(),
            },
        )
        recovered += 1
    return recovered


def ingest_bbox(
    con: Any,
    *,
    release: str,
    bbox: list[float],
    supabase_url: str,
    service_key: str,
    min_confidence: float,
) -> dict[str, int]:
    cursor = query_places(con, release, bbox, min_confidence)
    captured_at = utc_now()
    totals = {"records_seen": 0, "records_imported": 0, "records_updated": 0, "skipped_rows": 0}

    while True:
        records = cursor.fetchmany(batch_size)
        if not records:
            break
        rows = [row for record in records if (row := overture_row(record, release, captured_at)) is not None]
        totals["records_seen"] += len(records)
        if not rows:
            continue
        result = supabase_rpc(supabase_url, service_key, rows)
        totals["records_imported"] += int(result.get("imported_locations") or 0)
        totals["records_updated"] += int(result.get("updated_locations") or 0)
        totals["skipped_rows"] += int(result.get("skipped_rows") or 0)
        if result.get("durably_accounted") is False:
            raise RuntimeError("Canonical ingestion did not durably account for every Overture row.")
    return totals


def process_queue(
    args: argparse.Namespace,
    con: Any,
    release: str,
    *,
    policy: dict[str, Any],
    storage: dict[str, Any],
) -> dict[str, Any]:
    recovered_stale_jobs = recover_stale_queue(args.supabase_url, args.service_key)
    limit = effective_job_limit(args.max_jobs, policy)
    jobs = queue_rows(args.supabase_url, args.service_key, limit)
    summary: list[dict[str, Any]] = []
    for job in jobs:
        request_id = str(job["id"])
        attempt = int(job.get("attempt_count") or 0) + 1
        patch_queue(
            args.supabase_url,
            args.service_key,
            request_id,
            {"status": "running", "started_at": utc_now(), "attempt_count": attempt, "last_error": None, "updated_at": utc_now()},
        )
        try:
            bbox = [float(v) for v in job["bbox"]]
            totals = ingest_bbox(
                con,
                release=release,
                bbox=bbox,
                supabase_url=args.supabase_url,
                service_key=args.service_key,
                min_confidence=args.min_confidence,
            )
            patch_queue(
                args.supabase_url,
                args.service_key,
                request_id,
                {
                    "status": "completed",
                    "release": release,
                    "completed_at": utc_now(),
                    "last_error": None,
                    "updated_at": utc_now(),
                    **totals,
                },
            )
            summary.append({"id": request_id, "request_key": job.get("request_key"), "ok": True, **totals})
        except Exception as exc:
            message = str(exc)[:1200]
            patch_queue(
                args.supabase_url,
                args.service_key,
                request_id,
                {"status": "failed", "last_error": message, "updated_at": utc_now()},
            )
            summary.append({"id": request_id, "request_key": job.get("request_key"), "ok": False, "error": message})
    return {
        "release": release,
        "jobs": summary,
        "job_count": len(summary),
        "recovered_stale_jobs": recovered_stale_jobs,
        "effective_job_limit": limit,
        "storage": storage,
    }


def parse_bbox(value: str) -> list[float]:
    parts = [part.strip() for part in value.split(",")]
    if len(parts) != 4:
        raise argparse.ArgumentTypeError("bbox must be WEST,SOUTH,EAST,NORTH")
    try:
        return [float(part) for part in parts]
    except ValueError as exc:
        raise argparse.ArgumentTypeError("bbox values must be numeric") from exc


def self_test() -> None:
    assert place_type("cafe", "coffee_shop", '["food_and_drink","cafe"]') == "cafe"
    assert place_type("supermarket", "supermarket", '["shopping","supermarket"]') == "shopping"
    assert place_type("casual_eatery", "pizza_restaurant", '["food_and_drink","restaurant","pizza_restaurant"]') == "restaurant"
    assert normalize_state("US-MO") == "MO"
    assert normalize_state("IL") == "IL"
    sample = (
        "gers-1", "Pizza Hut", "casual_eatery", "pizza_restaurant",
        '["food_and_drink","restaurant","pizza_restaurant"]', 0.91, "open",
        "https://example.test", "+15555555555", "Pizza Hut", "1 Main St",
        "Troy", "MO", "63379", "US", -90.98, 38.98, "[]",
    )
    row = overture_row(sample, "2026-09-23.1", "2026-10-01T00:00:00Z")
    assert row and row["source_id"] == "overture:gers-1"
    assert row["place_type"] == "restaurant"
    assert row["state"] == "MO"
    assert http_retry_attempts("GET", retries=2) == 3
    assert http_retry_attempts("PATCH", retries=2) == 3
    assert http_retry_attempts("POST", retries=2) == 1
    assert http_timeout_seconds("GET") == 45
    assert http_timeout_seconds("POST") == 85
    assert batch_size == 50
    assert effective_job_limit(8, {"max_requests_per_cycle": 4}) == 4
    assert effective_job_limit(2, {"max_requests_per_cycle": 4}) == 2
    print("Overture ingestion self-test passed.")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    parser.add_argument("--process-queue", action="store_true")
    parser.add_argument("--bbox", type=parse_bbox)
    parser.add_argument("--release")
    parser.add_argument("--max-jobs", type=int, default=4)
    parser.add_argument("--min-confidence", type=float, default=DEFAULT_MIN_CONFIDENCE)
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--supabase-url", default=os.getenv("SUPABASE_URL", ""))
    parser.add_argument("--service-key", default=os.getenv("SUPABASE_SERVICE_ROLE_KEY", ""))
    return parser


def main() -> int:
    args = build_parser().parse_args()
    if args.self_test:
        self_test()
        return 0
    if not args.supabase_url or not args.service_key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.")
    if not args.process_queue and not args.bbox:
        raise RuntimeError("Choose --process-queue or provide --bbox WEST,SOUTH,EAST,NORTH.")

    policy = source_policy(args.supabase_url, args.service_key)
    storage = storage_status(args.supabase_url, args.service_key)
    if policy.get("enabled") is False:
        print(json.dumps({"ok": True, "status": "source_disabled", "source": SOURCE_KEY}, separators=(",", ":"), sort_keys=True))
        return 0
    if storage.get("may_ingest") is False or storage.get("paused") is True or storage.get("hard_stop") is True:
        print(json.dumps({"ok": True, "status": "storage_paused", "storage": storage}, separators=(",", ":"), sort_keys=True))
        return 0

    release = str(args.release or latest_release()).strip().strip("/")
    con = connect_duckdb()
    if args.process_queue:
        result = process_queue(args, con, release, policy=policy, storage=storage)
    else:
        totals = ingest_bbox(
            con,
            release=release,
            bbox=args.bbox,
            supabase_url=args.supabase_url,
            service_key=args.service_key,
            min_confidence=args.min_confidence,
        )
        result = {"release": release, "bbox": args.bbox, "storage": storage, **totals}
    print(json.dumps(result, separators=(",", ":"), sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)[:1600]}), file=sys.stderr)
        raise
