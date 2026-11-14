# Real NASA data: Curiosity RAD radiation during the cruise to Mars

VITALIS's demo mission uses **real radiation measurements** from NASA's Mars Science Laboratory (Curiosity rover). Its Radiation Assessment Detector (RAD) measured space radiation inside the spacecraft for the whole flight from Earth to Mars. That flight is the closest real match to a crewed Mars transit.

| | |
|---|---|
| **Instrument** | Radiation Assessment Detector (RAD), Mars Science Laboratory (Curiosity) |
| **Data set** | `MSL-M-RAD-3-RDR-V1.0` (Reduced Data Records), folder `DATA/CRUISE` |
| **Archive** | NASA Planetary Data System, Planetary Plasma Interactions (PPI) node |
| **Link** | https://pds-ppi.igpp.ucla.edu/data/MSL-M-RAD-3-RDR-V1.0/ |
| **Period** | 6 Dec 2011 – 14 Jul 2012 (218 days with data) |
| **Readings** | 15,358 observations (one every ~15–20 minutes) |
| **Downloaded** | November 2026, all 218 daily cruise files |
| **License** | NASA data, not subject to copyright in the United States. Cite the source; no NASA endorsement implied. |

## Files

| File | What it is |
|---|---|
| `msl_rad_cruise_observations.csv` | Every observation: UTC start time, total dose rate of detector B (silicon) and detector E (tissue-like plastic), in µGy/h. **Measured by NASA**, only reformatted. |
| `msl_rad_cruise_daily.csv` | One row per day: number of readings, mean/median/max dose rate, absorbed dose per day, estimated crew dose equivalent, solar-event flag. |
| `../../src/data/nasa/mslRadCruise.ts` | The daily values the app uses (generated, do not edit). |
| `../../scripts/nasa-data/` | Scripts that download and rebuild everything from NASA's archive. |

## How the numbers are made

1. **Download** (`scripts/nasa-data/fetch_msl_rad_cruise.sh`): streams the 218 RAD cruise files (~19 MB each) and keeps each observation's start time and the `DOSIMETRY_TOTAL_DOSE_B` / `DOSIMETRY_TOTAL_DOSE_E` values (µGy/h). Observations with no value (≤ 0) are skipped.
2. **Build** (`scripts/nasa-data/build_msl_rad_dataset.py`):
   - **Absorbed dose per day (measured)** = mean detector-E dose rate of the day × 24 h. Detector E is the tissue-equivalent detector NASA uses for crew dose.
   - **Background (quiet Sun)** = median daily absorbed dose = **0.444 mGy/day**. NASA's published cruise average is 0.481 mGy/day including solar storms (Zeitlin et al. 2013).
   - **Solar event day** = absorbed dose ≥ 1.5 × background. This finds the known solar particle events of **27–28 Jan**, **7–9 Mar** and **17 May 2012**.
   - **Dose equivalent (estimate, mSv/day)** = background part × **3.82** + storm excess × **1.5**.
     - 3.82 is the cruise-average quality factor from the published results (1.84 mSv/day ÷ 0.481 mGy/day, Zeitlin et al. 2013).
     - 1.5 is an **assumed** quality factor for proton-dominated solar-storm radiation, which has a lower biological weighting than galactic cosmic rays.
     - This is an approximation for a demo, not a dosimetry calculation.
3. **Use in the app** (`src/data/nasa/radiationTimeline.ts`): demo mission day 1 = **27 Jan 2012**, so day 42 = **8 Mar 2012**, the strongest storm of the cruise (6.99 mGy absorbed, ≈ 11.5 mSv). Each crew member gets the day's value ±4 % for where they sit in the ship. 3 of the 90 days had no RAD reading; they are interpolated from the neighbouring days and marked `filled`.

## Rebuild from scratch

```bash
bash scripts/nasa-data/fetch_msl_rad_cruise.sh        # ~4 minutes, needs access to pds-ppi.igpp.ucla.edu
python3 scripts/nasa-data/build_msl_rad_dataset.py
npm test                                              # src/data/nasa/radiationTimeline.test.ts checks the data
```

## Citations

- Hassler, D. M., et al. *MSL RAD Reduced Data Records* (MSL-M-RAD-3-RDR-V1.0). NASA Planetary Data System, PPI node.
- Zeitlin, C., et al. (2013). Measurements of energetic particle radiation in transit to Mars on the Mars Science Laboratory. *Science* 340(6136), 1080–1084. doi:10.1126/science.1235989
- Hassler, D. M., et al. (2014). Mars' surface radiation environment measured with the Mars Science Laboratory's Curiosity rover. *Science* 343(6169). doi:10.1126/science.1244797

## What is *not* real

The demo crew's **health readings** (heart rate, blood pressure, sleep, mood, etc.) are **made up** by `src/data/seed.ts` from a fixed random seed. Individual astronaut medical records are private and not published by NASA. Only the **radiation** is real measured data.
