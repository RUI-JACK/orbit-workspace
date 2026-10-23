"""Orbit local API example. Python standard library only; no saved credentials."""
import argparse
import getpass
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description="Orbit local browser API")
    parser.add_argument("action", choices=["list", "start", "stop", "screenshot"])
    parser.add_argument("id", nargs="?")
    parser.add_argument("--base", default="http://127.0.0.1:50326")
    parser.add_argument("--output", default="orbit-screenshot.png")
    args = parser.parse_args()
    if args.action != "list" and not args.id:
        parser.error("this action requires an environment ID")
    parsed = urllib.parse.urlparse(args.base)
    if parsed.scheme != "http" or parsed.hostname != "127.0.0.1" or parsed.username or parsed.password:
        parser.error("base must be http://127.0.0.1:PORT")
    token = os.environ.get("ORBIT_API_TOKEN") or getpass.getpass("Orbit API token: ")
    route = "/api/v1/profiles" if args.action == "list" else "/api/v1/browser/" + args.action
    payload = None
    if args.action in ["start", "stop"]:
        payload = json.dumps({"id": args.id}).encode("utf-8")
    elif args.action == "screenshot":
        route += "?" + urllib.parse.urlencode({"id": args.id, "fullPage": "true"})
    req = urllib.request.Request(args.base.rstrip("/") + route, data=payload,
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"})
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(req, timeout=90) as response:
            data = response.read()
        if args.action == "screenshot":
            Path(args.output).write_bytes(data)
            print("Saved:", Path(args.output).resolve())
        else:
            print(json.dumps(json.loads(data), ensure_ascii=False, indent=2))
    except urllib.error.HTTPError as exc:
        print("API error:", exc.code, exc.read().decode("utf-8", errors="replace"))
        raise SystemExit(1)
    except urllib.error.URLError:
        print("Cannot connect. Open Orbit and enable its local API first.")
        raise SystemExit(1)


if __name__ == "__main__":
    main()
