# Automatic measurement: suits, wearables and medical devices

Open **Live Monitor** in VITALIS to connect sources. Readings stream in continuously:

- **Live alarms** fire within seconds (critical after 3 s, act-now after 8 s, so one noisy sample can't trigger them), with sound and an on-screen checklist.
- **One-minute averages** are stored (and synced to Mission Control when signed in).
- The **daily check-in auto-fills** from readings taken in the last 30 minutes (marked "📡 From …"), so the astronaut only answers the questions a sensor can't (mood, sleep quality, symptoms).
- With an account, the stream (every 2 s) and alarms show up live on the **Ground Console**.

Browser support: **Chrome or Edge** on Windows, macOS, Linux, Android or ChromeOS. Safari/iOS and Firefox don't support Web Bluetooth/Web Serial. The page must be served over HTTPS or `localhost`.

## 1. Bluetooth medical devices (works today)

Any device that implements the standard Bluetooth SIG health profiles:

| Profile | Measures | Examples |
|---|---|---|
| Heart Rate (0x180D) | HR + RR intervals → HRV (RMSSD) | Polar H10/H9, Garmin HRM, Wahoo TICKR, many sport watches in "broadcast HR" mode |
| Pulse Oximeter (0x1822) | SpO₂, pulse | Nonin 3230, Masimo MightySat, some Wellue/Viatom models |
| Blood Pressure (0x1810) | Systolic, diastolic, pulse | Omron Bluetooth cuffs, A&D UA-651BLE |
| Health Thermometer (0x1809) | Temperature | BLE clinical thermometers |
| Weight Scale (0x181D) | Body mass | BLE scales (in 0 g use SLAMMD-style measurement instead) |

Consumer smartwatches (Apple Watch, Fitbit, Samsung) mostly do **not** expose these profiles to browsers. Use a chest strap or a medical device instead.

## 2. Space suit / wearable telemetry (USB or Wi-Fi)

Flight suits (NASA xEMU, Axiom AxEMU) send telemetry over their own certified systems, so no app can plug into them directly. A suit integration is a small **bridge** (suit computer → VITALIS) that forwards the data in this open format. Sensor boards like the ESP32 example below speak it directly.

### VITALIS telemetry protocol (JSON lines)

One JSON object per line, UTF-8, `\n` terminated, ideally 1 per second:

```json
{"hr":92,"spo2":97,"temp":37.1,"resp":18,"suitPressure":29.5,"suitCo2":3.2,"o2":78,"doseRate":80}
```

| Key (aliases) | Meaning | Unit |
|---|---|---|
| `hr` (`heartRate`, `pulse`) | Heart rate | bpm |
| `hrv` (`rmssd`) | Heart-rate variability | ms |
| `spo2` | Blood oxygen | % |
| `temp` (`bodyTemp`, `coreTemp`) | Body temperature | °C |
| `resp` (`rr`, `respRate`) | Breathing rate | /min |
| `sys`, `dia` | Blood pressure | mmHg |
| `mass` (`weight`) | Body mass | kg |
| `suitPressure` (`suit_kpa`) | Suit pressure | kPa (nominal ≈ 29.6) |
| `suitCo2` (`co2`, `ppco2`) | Suit CO₂ partial pressure | mmHg |
| `o2` (`o2Remaining`) | O₂ consumables remaining | % |
| `doseRate` (`dose`) | Radiation dose rate | µSv/h |

Send any subset. Unknown keys are ignored and physically impossible values are dropped.

**Transports**

- **USB serial** (115200 baud): *Live Monitor → Connect over USB*.
- **Wi-Fi / WebSocket**: run a WebSocket server on the bridge that sends the same lines. *Live Monitor → enter `ws://<ip>:<port>` → Connect*. (A page served over HTTPS needs `wss://`.)

## 3. Build your own sensor board (about $15)

`docs/hardware/vitalis_sensor/vitalis_sensor.ino` is a reference sketch for:

- **ESP32** dev board,
- **MAX30102** pulse-oximeter / heart-rate sensor (I²C),
- **MLX90614** infrared thermometer (I²C, optional). Note that this measures **skin** temperature, which reads lower than core temperature.

Wiring (both sensors share the I²C bus): `3V3 → VIN`, `GND → GND`, `GPIO21 → SDA`, `GPIO22 → SCL`.

Arduino IDE libraries: **SparkFun MAX3010x Pulse and Proximity Sensor Library** and **Adafruit MLX90614 Library**. Upload, plug into the computer running VITALIS, then *Live Monitor → Connect over USB*.

> This sketch is a starting point for prototyping and is not a medical device. It was written against the libraries' documented APIs but not compiled or tested on hardware here.

## 4. No hardware? Use the simulator

*Live Monitor → Simulator → Suit (EVA)* streams realistic EVA telemetry. **Inject fault** rehearses emergencies (suit leak, CO₂ scrubber failure, solar particle event, tachycardia, hypoxia, fever) and the Ground Console sees them too.

## Alarm limits

Live limits are in `src/devices/channels.ts` (with sources). They are prototype values; a flight program would use the suit vendor's certified caution-and-warning limits.
