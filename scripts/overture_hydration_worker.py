"""Overture worker preflight: validates queue and credentials before processing."""
import os, json, requests
def main():
    url=os.environ["SUPABASE_URL"].rstrip("/")
    key=os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    headers={"apikey":key,"Authorization":f"Bearer {key}"}
    response=requests.get(url+"/rest/v1/place_discovery_hydration_queue",headers=headers,params={"select":"id,market_key,status,release,records_seen,records_imported,bbox","source_key":"eq.overture","status":"eq.pending","owner_paused":"eq.false","limit":"50"},timeout=30)
    response.raise_for_status()
    tasks=response.json()
    print(json.dumps({"eligible":len(tasks),"markets":[t["market_key"] for t in tasks[:5]],"mode":"preflight_only"}))
    # The source cursor is not stored in the current schema. Do not alter task state
    # or replay partial tasks until a checkpointed extractor is implemented.
if __name__=="__main__": main()
