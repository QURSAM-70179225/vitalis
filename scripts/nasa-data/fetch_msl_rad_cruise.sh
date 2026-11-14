#!/usr/bin/env bash
# Downloads NASA Curiosity (MSL) RAD cruise data from the Planetary Data System and keeps only
# each observation's start time and total dose rates (detectors B and E, microGray per hour).
#
# Source: NASA PDS Planetary Plasma Interactions Node, data set MSL-M-RAD-3-RDR-V1.0
#   https://pds-ppi.igpp.ucla.edu/data/MSL-M-RAD-3-RDR-V1.0/DATA/CRUISE/
# Output: scripts/nasa-data/raw/<file>.csv  (time,doseB,doseE)   ~4 minutes, ~4 GB streamed, ~1 MB kept.
# Then run: python3 scripts/nasa-data/build_msl_rad_dataset.py
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p raw
BASE="https://pds-ppi.igpp.ucla.edu/data/MSL-M-RAD-3-RDR-V1.0/DATA/CRUISE"
one() {
  curl -s --retry 4 -m 300 "$BASE/$1" | awk '{ sub(/\r$/, "") }
    /^START_OBS_UTC=/ { t=$0; sub(/^START_OBS_UTC=/, "", t); gsub(/"/, "", t); next }
    /^\[DOSIMETRY_TOTAL_DOSE_E/ { m="E"; next }
    /^\[DOSIMETRY_TOTAL_DOSE_B/ { m="B"; next }
    m!="" && NF==1 && $1 ~ /^-?[0-9.]+$/ { if (m=="B") b=$1; else print t "," b "," $1; m=""; next }' > "raw/$1.csv"
  echo "$1 $(wc -l < "raw/$1.csv") observations"
}
export -f one; export BASE
xargs -P 8 -n 1 bash -c 'one "$0"' < msl_rad_cruise_files.txt
