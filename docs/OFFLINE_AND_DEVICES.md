# Using VITALIS offline, as an app, and across devices

VITALIS is built for places with no internet: a spacecraft, a research station, a ship, a village clinic. This guide explains how to use it on your phone, tablet, laptop and watch, and how to keep going when a battery runs out.

Everything below is on the **Devices & Sync** page (menu → *Devices & Sync*).

---

## 1. Install it as an app

| Device | How |
|---|---|
| Android (Chrome) | Menu ⋮ → **Install app** (or *Add to Home screen*), or the **Install VITALIS** button on Devices & Sync |
| iPhone / iPad (Safari) | Share button → **Add to Home Screen** |
| Windows / Mac / ChromeOS (Chrome or Edge) | Install icon at the right end of the address bar, or the **Install VITALIS** button |

After installing, **open it once while online**. Every page is then saved on the device. Long-press the app icon for shortcuts: *Daily check-in*, *Live monitor*, *Send data to another device*.

## 2. Working with no internet

- Every page, the triage engine, the assistant, charts, guides and alarms work offline.
- Your data is stored on the device (IndexedDB). Tap **Keep my data safe** on Devices & Sync so the browser never deletes it to free space (installed apps usually get this automatically).
- If you use an account, changes wait in a queue and upload by themselves when the connection returns. The status shows how many are waiting.
- The first sign-in on a new device needs internet. After that, it works offline.

## 3. Move your data to another device (no internet needed)

Use this when your phone battery is about to die, or you want to continue on a laptop or tablet.

1. **On the old device:** Devices & Sync → **Send to my other device**.
   - On a phone, the share menu opens: choose **Nearby Share / Quick Share** (Android), **AirDrop** (Apple), **Bluetooth**, or **Files**.
   - Without a share menu (most computers) the file is saved to *Downloads*: copy it with a USB cable, memory card or USB stick.
2. **On the new device:**
   - Already set up? Devices & Sync → **Receive from my other device** → pick the file → check the summary → **Sync now**.
   - Brand-new device? On the welcome screen tap **Continue from my other device** and pick the file. Your mission and history appear straight away.

What to know:

- **Nothing is deleted.** Both devices end up with everything. You can send in both directions.
- **Safe to repeat.** Receiving the same file twice adds nothing the second time.
- **Private:** the file includes your health records and private journal. Send it only to your own devices. Your passcode and settings are not included.
- *Settings → Import JSON* is different: it **replaces** all data with a backup. Use Devices & Sync to combine devices.

## 4. Low battery

On Chrome, Edge and Android, VITALIS watches the battery:

- At **20 %** and again at **10 %** (when not charging) you get a warning with a **Send to another device** button.
- Devices & Sync shows a battery banner with the same button.

Safari and Firefox do not report battery level. Send a hand-off file before the battery gets low.

## 5. Connect your watch or sensors

VITALIS reads heart rate straight from a watch over **Bluetooth**: no internet and no extra app. Devices & Sync → **Connect watch**.

| Watch / sensor | What to do |
|---|---|
| Garmin | On the watch: *Broadcast Heart Rate* |
| Polar, Coros, Suunto, Wahoo, Amazfit, many fitness bands | Start a workout or turn on *HR broadcast* |
| Chest straps (Polar H10, Garmin HRM, Wahoo TICKR) | Wear it; it appears in the list |
| Apple Watch, most Wear OS watches | They do not share heart rate directly. Use a chest strap or the phone camera |
| Pulse oximeter, blood-pressure cuff, thermometer, scale | Live Monitor → Bluetooth devices |

Bluetooth needs **Chrome or Edge** on Android, Windows, macOS or ChromeOS. iPhone Safari does not support it. No watch? Use **Camera heart rate** (fingertip over the camera) or **scan a printed report** in Check-in. More detail: [SENSORS.md](SENSORS.md).

## 6. Alarm sounds

- Browsers only allow sound after you tap the page once. Tap anywhere after opening the app.
- Live Monitor → **Test beep** checks your speaker.
- **Alarm sound on/off** mutes or un-mutes live alarms. Turning it back on plays a short beep.
- Danger alarms repeat every 20 seconds until the reading is safe or you mute them.
- All sounds and vibration can be turned off in *Settings → Alert sounds & vibration*.

## 7. Troubleshooting

| Problem | Fix |
|---|---|
| "This view hit a problem" after an update | The app reloads itself once. If it stays, tap **Repair app** (clears saved app files, not your data) |
| No sound | Tap the page once, check *Settings → Alert sounds*, check the device is not on silent, try **Test beep** |
| Install button missing | Already installed, or the browser does not support it: use the steps in section 1 |
| "Not a VITALIS hand-off file" | You picked a full backup: restore it in *Settings → Import JSON* instead |
| Watch not in the Bluetooth list | Turn on heart-rate broadcast on the watch; use Chrome/Edge; keep it within a few metres |
