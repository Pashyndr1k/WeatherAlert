# WeatherAlert

Standalone Windows / macOS desktop app for ship captains: tracks marine weather at up to 10
user-defined WGS84 points across Europe & Asia, shows a simplified vector map with a
metrics panel, and raises **visual + audible alarms 60–90 minutes before** a user-set
critical threshold is forecast to be reached.

Built with Electron (Chromium + Node), d3-geo for the map, Web Audio for alarm tones.

## Features

- **Accurate vector map of the Black Sea & Sea of Azov** — GSHHG v2.3.7 shoreline (NOAA / University of Hawaii, WGS84) clipped to 25–44°E, 38.5–49.5°N, with lakes, rivers and national borders from WDBII. Five native levels of detail; the app switches intermediate → high → full (≈ 100 m) as you zoom, with a lat/lon grid that steps from 10° down to 5' and labelled edges. Mercator (default) or Albers equal-area conic with standard parallels 46°15'N / 41°15'N to match the reference chart. 27 port labels. A Europe & Asia overview (Natural Earth 50 m) is still available in Settings → Map.
- **Up to 10 tracking points** — add by clicking the map or typing coordinates in decimal
  degrees, degrees-decimal-minutes or DMS (`57.75, 8.5` · `57°45'N 008°30'E` · `57 45 0 N 8 30 0 E`).
  Remove with the × on a chip or the trash button.
- **Two data providers**, switchable in Settings → Provider:
  - **Open-Meteo** (default, free, no key): ICON/GFS/ECMWF atmosphere + MFWAM/EWAM/GFS-Wave waves. All points in one request.
  - **Stormglass.io** (API key): `sg` AI blend or any single source (ecmwf, noaa, metno, meteo, dwd, meto…). Key is stored encrypted with the OS keychain (DPAPI / Keychain).
- **Every Stormglass weather parameter** is listed in Settings → Metrics (wind at 10 m … 200 hPa, waves, swell, secondary swell, wind-waves, pressure, temperature, dew point, humidity, cloud cover, visibility, precipitation types, water temperature, currents, sea level, ice) and can be toggled on the main screen. Items greyed out are not provided by the active provider.
- **Maritime derived indicators**: Beaufort force, Douglas sea state, cloud oktas, air conditions (fog / mist / haze / rain / snow / thunderstorm), 3-hour pressure tendency, cross-sea detection, fog risk (dew-point spread), gust factor.
- **Thresholds & alarms** — click the **limit badge on any metric card** to set, change or remove its critical limit in place (≥ / ≤, value in your units, all points or just the selected one); Settings → Thresholds shows the full list. Any numeric metric, `≥` or `≤`, all points or one point. The engine interpolates the cached hourly forecast every 30 s and raises:
  - **WARNING** (amber) when the limit will be crossed within the lead time (60–90 min, default 90), with the ETA and clock time; a reminder re-sounds at 60 min if acknowledged.
  - **CRITICAL** (red) when the limit is currently exceeded.
  - Visual: banner, card glow, chip and map-marker colour. Audible: synthesised chime (warning) / siren burst (critical) repeating until acknowledged. Plus OS notification and taskbar/dock flash.
- **Units**: knots / m/s / km/h, metres / feet, °C / °F, NM / km, hPa.
- **Micro-animations**: card entry, value-change flash, sparkline draw-in, wind-arrow rotation, marker pulse rings, alarm ping, map fly-to.

## Run from source

Double-click **`WeatherAlert.bat`** (installs dependencies on first run, then launches the app), or:

```bash
npm install
npm start
```

## Releases from GitHub

Repository: https://github.com/Pashyndr1k/WeatherAlert. The workflow in `.github/workflows/build.yml`
builds the Windows installer + portable EXE and an unsigned macOS DMG (x64 + arm64) on every
`v*` tag and attaches them to a GitHub Release; it can also be started by hand from the
Actions tab (workflow_dispatch). To cut a release:

```bash
npm version patch          # bumps package.json and creates the tag
git push --follow-tags
```

## Package (local)

```bash
npm run dist:win     # dist/WeatherAlert Setup x.y.z.exe (NSIS) + WeatherAlert-x.y.z-portable.exe
npm run dist:mac     # dist/WeatherAlert-x.y.z.dmg (must run on macOS; x64 + arm64)
```

## Request budget

Alarms are evaluated locally from a cached 72-hour forecast, so the refresh interval only
controls how fresh the forecast is, not how early alarms fire.

| Provider | Calls per refresh | Free quota | 10 points, hourly refresh |
|---|---|---|---|
| Open-Meteo | 2 (all points batched) | 10 000 / day (non-commercial) | 48 / day |
| Stormglass | 1 per point | 10 / day (free) · 500 (€19) · 5 000 (€49) · 25 000 (€129) | 240 / day → needs Small plan |

Settings → Provider shows this calculation live for your point count and interval.

## Map data

`tools/build-blacksea.py` clips the GSHHG/WDBII shapefiles (`tools/gshhg/gshhg-shp-2.3.7.zip`, download from https://www.soest.hawaii.edu/pwessel/gshhg/) to the Black Sea window and `node tools/topo.js` quantises each level into `assets/blacksea/blacksea_{c,l,i,h,f}.json` (15 KB … 1.2 MB). GSHHG is distributed under the LGPL; keep the attribution in Settings → Map. To change the window, edit `BBOX` in the Python script and `REGIONS.blacksea` in `src/js/map.js`, then rerun both tools.

## Layout

```
main.js          Electron main: window, settings file, encrypted key, HTTP, notifications
preload.js       contextBridge API exposed to the renderer as window.bridge
src/metrics.js   Registry of all Stormglass parameters + Open-Meteo equivalents + derived indicators
src/providers.js Open-Meteo and Stormglass adapters → one normalised hourly format
src/js/units.js  Unit conversion, Beaufort/Douglas/okta scales, WMO codes, coordinate parser
src/js/alarms.js Threshold engine (interpolation, first-crossing search, ETA)
src/js/audio.js  Web Audio alarm tones
src/js/map.js    Multi-LOD d3 map (GSHHG Black Sea / NE Europe–Asia), Mercator or Albers, labelled graticule, ports
src/js/app.js    UI state, rendering, refresh scheduling, settings modal
src/dev-shim.js  Lets the renderer run in a plain browser for QA (no Electron)
```
