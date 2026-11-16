#!/usr/bin/env python3
"""Build the static site with one cached CelesTrak feed and a pinned SGP4 library."""
from argparse import ArgumentParser
from base64 import b64encode
from datetime import datetime, timezone
from hashlib import sha512
from io import BytesIO
from pathlib import Path
from shutil import copytree, rmtree
from tarfile import open as tar_open
from urllib.request import Request, urlopen
import json
import math

ROOT = Path(__file__).resolve().parents[1]
SOURCE = "https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=json"
LIBRARY = "https://registry.npmjs.org/satellite.js/-/satellite.js-6.0.1.tgz"
INTEGRITY = "T0qpKYSlNIH9L0yY1SRF2J6XfV9TToZuDNBXSeTW9K6fN5kwf4uidzk3+q6Rg4KVHibcLaire910C47yai0W9A=="
OBJECTS = {
    25544: ("International Space Station", "Crewed station"),
    48274: ("Tiangong", "Chinese space station"),
    20580: ("Hubble", "Space telescope"),
    25994: ("Terra", "Earth observation"),
    27424: ("Aqua", "Earth observation"),
    27386: ("Envisat", "Retired Earth observation"),
}
NUMERIC = ("MEAN_MOTION", "ECCENTRICITY", "INCLINATION", "RA_OF_ASC_NODE",
           "ARG_OF_PERICENTER", "MEAN_ANOMALY", "BSTAR", "MEAN_MOTION_DOT", "MEAN_MOTION_DDOT")


def download(url, ceiling):
    request = Request(url, headers={"User-Agent": "CoolCode Satellite Pass build (+https://coolcode.ca/satpasses/)"})
    with urlopen(request, timeout=30) as response:
        body = response.read(ceiling + 1)
    if len(body) > ceiling:
        raise ValueError(f"Unexpected data size from {url}")
    return body


def cache_file(path, data):
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_bytes(data)
    tmp.replace(path)


def snapshot(rows, retrieved):
    by_id = {int(item["NORAD_CAT_ID"]): item for item in rows}
    entries = []
    for number, (name, description) in OBJECTS.items():
        if number not in by_id:
            continue
        row = by_id[number]
        epoch = datetime.fromisoformat(row["EPOCH"].removesuffix("Z")).replace(tzinfo=timezone.utc)
        fields = {key: float(row[key]) for key in NUMERIC}
        if not all(math.isfinite(v) for v in fields.values()):
            raise ValueError(f"Invalid orbital elements for {number}")
        if not (0 < fields["MEAN_MOTION"] < 20 and 0 <= fields["ECCENTRICITY"] < 1):
            raise ValueError(f"Unexpected orbital values for {number}")
        entries.append({"name": name, "description": description, "omm": {
            "NORAD_CAT_ID": number,
            "OBJECT_NAME": row["OBJECT_NAME"],
            "EPOCH": epoch.isoformat().replace("+00:00", "Z"),
            **fields,
        }})
    if not entries or entries[0]["omm"]["NORAD_CAT_ID"] != 25544 or len(entries) < 3:
        raise ValueError("Incomplete CelesTrak visual group")
    return {"retrieved": retrieved.isoformat().replace("+00:00", "Z"),
            "source": SOURCE, "objects": entries}


def read_snapshot(path):
    retrieved = datetime.fromtimestamp(path.stat().st_mtime, timezone.utc)
    return snapshot(json.loads(path.read_bytes()), retrieved)


def get_snapshot(cache, supplied):
    if supplied:
        return read_snapshot(supplied)
    path = cache / "visual.json"
    now = datetime.now(timezone.utc)
    old = None
    if path.exists():
        try:
            old = read_snapshot(path)
        except (KeyError, ValueError, TypeError, OSError) as error:
            print(f"Ignoring unreadable orbital cache: {error}")
        if old and 0 <= now.timestamp() - path.stat().st_mtime < 7200:
            return old
    try:
        body = download(SOURCE, 2_000_000)
        verified = snapshot(json.loads(body), datetime.now(timezone.utc))
        cache_file(path, body)
        return verified
    except (KeyError, ValueError, TypeError, OSError) as error:
        if old:
            print(f"CelesTrak refresh failed. Retaining dated cache: {error}")
            return old
        raise


def vendor(cache, output):
    path = cache / "satellite.js-6.0.1.tgz"
    body = path.read_bytes() if path.exists() else download(LIBRARY, 2_000_000)
    if b64encode(sha512(body).digest()).decode() != INTEGRITY:
        raise ValueError("Satellite.js package failed integrity verification")
    if not path.exists():
        cache_file(path, body)
    output.mkdir()
    with tar_open(fileobj=BytesIO(body), mode="r:gz") as archive:
        for member, destination in (("package/dist/satellite.es.js", "satellite.mjs"),
                                    ("package/LICENSE.md", "SATELLITE-LICENSE.md")):
            (output / destination).write_bytes(archive.extractfile(member).read())


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--elements", type=Path, help="Use a previously downloaded CelesTrak JSON file")
    args = parser.parse_args()
    cache = ROOT / ".cache"
    cache.mkdir(exist_ok=True)
    data = get_snapshot(cache, args.elements)
    dist = ROOT / "dist"
    rmtree(dist, ignore_errors=True)
    copytree(ROOT / "web", dist)
    vendor(cache, dist / "vendor")
    (dist / "elements.json").write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    print(f"Built {len(data['objects'])} orbital records retrieved {data['retrieved']}")


if __name__ == "__main__":
    main()
