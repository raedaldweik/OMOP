"""
Download the canonical OHDSI Eunomia GiBleed dataset and replace omop.sqlite.

The container that ships with this demo cannot reach raw.githubusercontent.com,
so it bundles a synthetic OMOP CDM cohort instead. To swap in the real Eunomia
dataset (used in the OHDSI tutorials), run this script on a machine with
internet access:

    python backend/data/download_eunomia.py

That writes backend/data/omop.sqlite. The omop.py data layer is identical for
both — Eunomia is a valid OMOP v5.3 CDM and our synthetic data is v5.4, both
work with the same queries.

Eunomia GiBleed contains ~2,694 persons centered on a synthetic GI bleed
exposure-outcome study. It is excellent for OHDSI tutorials but does NOT
contain the cardiometabolic concept richness our synthetic dataset has —
no SGLT2i / GLP-1 RAs, limited measurements. For demos focused on diabetes
care, the bundled synthetic cohort is the better default.
"""
from __future__ import annotations
import os
import sys
import io
import zipfile
import shutil
import urllib.request

URL = "https://github.com/OHDSI/EunomiaDatasets/raw/main/datasets/GiBleed/GiBleed_5.3.zip"
DEST_DIR = os.path.dirname(os.path.abspath(__file__))
DEST_SQLITE = os.path.join(DEST_DIR, "omop.sqlite")
BACKUP_SQLITE = os.path.join(DEST_DIR, "omop.synthetic.sqlite")


def main() -> int:
    print(f"Downloading Eunomia GiBleed from {URL}")
    try:
        req = urllib.request.Request(URL, headers={"User-Agent": "sas-omop-demo/1.0"})
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = resp.read()
        print(f"  ✓ Downloaded {len(data)/1024/1024:.1f} MB")
    except Exception as e:
        print(f"  ✗ Download failed: {e}", file=sys.stderr)
        return 1

    # Back up the bundled synthetic file before overwriting
    if os.path.exists(DEST_SQLITE) and not os.path.exists(BACKUP_SQLITE):
        shutil.copy2(DEST_SQLITE, BACKUP_SQLITE)
        print(f"  ✓ Backed up synthetic CDM to {BACKUP_SQLITE}")

    # Eunomia ships as a zip containing a SQLite file
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        sqlite_member = next((n for n in zf.namelist() if n.endswith(".sqlite")), None)
        if sqlite_member is None:
            print("  ✗ No .sqlite file found in Eunomia zip", file=sys.stderr)
            return 1
        with zf.open(sqlite_member) as src, open(DEST_SQLITE, "wb") as dst:
            shutil.copyfileobj(src, dst)
        print(f"  ✓ Extracted {sqlite_member} to {DEST_SQLITE}")

    print()
    print("✓ Done. The backend will now serve queries against the real Eunomia dataset.")
    print(f"  Restore the synthetic cohort with:  cp {BACKUP_SQLITE} {DEST_SQLITE}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
