"""Hale One read-only Kalshi market snapshot collector; no order endpoints."""
import argparse, datetime, hashlib, json, urllib.parse, urllib.request
BASE="https://external-api.kalshi.com/trade-api/v2"
def get_json(path):
    if not (path.startswith("/markets?") or (path.startswith("/markets/") and path.endswith("/orderbook"))):
        raise ValueError("Only public market discovery and orderbook reads permitted")
    req=urllib.request.Request(BASE+path,headers={"User-Agent":"HaleOnePaperResearch/0.1","Accept":"application/json"},method="GET")
    with urllib.request.urlopen(req,timeout=12) as res: return json.loads(res.read(3_000_000))
def validate_book(data):
    b=data.get("orderbook_fp")
    if not isinstance(b,dict): raise ValueError("missing orderbook_fp")
    for key in ("yes_dollars","no_dollars"):
        levels=b.get(key)
        if not isinstance(levels,list): raise ValueError("missing "+key)
        for p,q in levels:
            if not (0<float(p)<1 and float(q)>0): raise ValueError("invalid book level")
    yes=max([float(x[0]) for x in b["yes_dollars"]],default=0)
    no=max([float(x[0]) for x in b["no_dollars"]],default=0)
    if yes+no>1.00000001: raise ValueError("crossed complementary bids")
    return {"yes_best_bid":yes,"yes_best_ask":1-no if no else None,"no_best_bid":no,"no_best_ask":1-yes if yes else None}
def snapshot(ticker):
    if not ticker or not all(c.isalnum() or c in "-_" for c in ticker): raise ValueError("unsafe ticker")
    start=datetime.datetime.now(datetime.timezone.utc).isoformat()
    raw=get_json("/markets/"+urllib.parse.quote(ticker,safe="")+"/orderbook")
    end=datetime.datetime.now(datetime.timezone.utc).isoformat()
    return {"ticker":ticker,"captured_start_utc":start,"captured_end_utc":end,"sha256":hashlib.sha256(json.dumps(raw,sort_keys=True,separators=(",",":")).encode()).hexdigest(),"derived":validate_book(raw),"raw":raw}
def main():
    p=argparse.ArgumentParser();p.add_argument("--ticker");p.add_argument("--discover",action="store_true");p.add_argument("--out",required=True);a=p.parse_args()
    if not a.ticker and not a.discover:p.error("provide --ticker or --discover")
    try:
        if a.discover:
            data=get_json("/markets?limit=10&status=open")
            result={"status":"DISCOVERY_ONLY","captured_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),"markets":[{"ticker":x.get("ticker"),"title":x.get("title")} for x in data.get("markets",[])]}
        else:result={"status":"READ_ONLY_SNAPSHOT","snapshot":snapshot(a.ticker)}
    except Exception as e:result={"status":"NO_GO","reason":type(e).__name__,"detail":str(e)[:250]}
    with open(a.out,"w",encoding="utf8") as f:json.dump(result,f,indent=2,ensure_ascii=False)
    print(result["status"]);return 0 if result["status"]!="NO_GO" else 2
if __name__=="__main__":raise SystemExit(main())
