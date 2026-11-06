"""Fetch only the school's public LINQ menu using a browser-compatible HTTP client."""
import json
import sys
from urllib.parse import urlencode
from curl_cffi import requests

building, district, start, end = sys.argv[1:]
def mdy(value):
    year, month, day = value.split("-")
    return f"{month}-{day}-{year}"

query = urlencode({
    "buildingId": building,
    "districtId": district,
    "startDate": mdy(start),
    "endDate": mdy(end),
})
url = "https://api.linqconnect.com/api/FamilyMenu?" + query
errors = []
for browser in ("chrome", "safari", "firefox"):
    try:
        response = requests.get(url, impersonate=browser, timeout=20, headers={
            "accept": "application/json, text/plain, */*",
            "referer": "https://linqconnect.com/",
            "origin": "https://linqconnect.com",
        })
        response.raise_for_status()
        data = response.json()
        if not isinstance(data.get("FamilyMenuSessions"), list):
            raise ValueError("Unrecognized LINQ response")
        print(json.dumps(data))
        break
    except Exception as error:
        errors.append(f"{browser}: {type(error).__name__}: {error}")
else:
    raise SystemExit("Public LINQ menu unavailable; " + "; ".join(errors))
