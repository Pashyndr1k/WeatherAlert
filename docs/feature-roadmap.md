# Feature ideas built on Stormglass data (and Open-Meteo where noted)

Grouped by the Stormglass endpoint / parameter family that makes each feature possible.
"Ready now" = the data is already fetched by the current app; "New endpoint" = needs an
additional Stormglass call.

## A. Safety & decision support (weather/point — ready now)

1. **Route / leg forecasting** — enter a planned track (waypoints + ETA per waypoint) and
   evaluate thresholds at the *time the ship will be there*, not "now". Uses the same hourly
   series; adds a time-shift per point. This is the single most valuable upgrade for a captain.
2. **Model-spread confidence** — Stormglass returns every source side by side
   (`waveHeight: {sg, noaa, meteo, ecmwf}`). Show the spread as an error band on the sparkline
   and raise a "low confidence" flag when sources disagree by > 30 %. Alarm earlier when
   *any* source crosses the limit ("worst-case mode").
3. **Compound thresholds** — e.g. `waveHeight ≥ 2.5 AND wavePeriod ≤ 6` (steep seas),
   `windSpeed ≥ 25 kn AND currentDirection opposes windDirection` (wind-against-tide),
   `visibility ≤ 1 NM AND cloudCover ≥ 90`. Rule builder with AND/OR.
4. **Parametric roll / synchronous-roll warning** — from `wavePeriod`, `waveDirection`,
   ship heading and the vessel's natural roll period (user setting): warn when the
   encounter period ≈ ½ or 1× the roll period (IMO MSC.1/Circ.1228 criteria).
5. **Freezing-spray / icing index** — `airTemperature`, `windSpeed`, `waterTemperature`
   → Overland icing nomogram (light/moderate/heavy). Relevant north of ~55°N in winter.
6. **Cross-sea & confused-sea indicator** — already derived; extend with secondary swell
   (`secondarySwellHeight/Direction/Period`) to flag three-system seas.
7. **Squall / gust-front detector** — `gust / windSpeed` ratio, `precipitation` spikes
   and pressure micro-drops within 3 h; raise a short-lead (30 min) advisory.
8. **Fog probability** — dew-point spread, humidity, `waterTemperature` vs `airTemperature`
   (advection fog when warm moist air moves over cold water), wind < 8 kn. Show a
   probability, not just a category.
9. **Pressure-tendency alarm with Buys-Ballot hints** — already derived; add "storm
   approaching from …" using wind veer/back over 6 h.
10. **Heavy-weather checklist trigger** — when any CRITICAL fires, open a checklist
    (secure cargo, reduce speed, notify bridge team) with timestamped acknowledgement log.

## B. Tides, currents, astronomy (new endpoints)

11. **Tide extremes + sea level at each point** (`/tide/extremes/point`, `/tide/sea-level/point`)
    — show next HW/LW, height, and a warning when `seaLevel` + `waveHeight` exceeds a
    user-set under-keel or berth limit.
12. **Wind-against-current warning** — `currentSpeed/currentDirection` vs wind: when the
    angle is > 120° and current ≥ 1.5 kn, expect steeper, breaking seas; raise sea-state one
    Douglas class in the display.
13. **Set & drift overlay** — draw current vectors at every tracking point on the map.
14. **Sunrise / sunset / civil twilight / moon phase** (`/astronomy/point`) — dim the UI
    automatically for night watches (red-light "bridge mode"), and show hours of daylight
    remaining for arrival planning.

## C. Historical & verification (`/weather/point` 14-day look-back, `/historical`)

15. **Forecast-vs-observed scoreboard** — store each forecast run; after the hour passes,
    compare against the latest analysis (`start` in the past). Show per-source skill
    (MAE for wind and Hs) at *your* points and let the app auto-prefer the best source.
16. **Log-book export** — hourly actuals for the voyage (CSV/PDF) for the deck log and
    charter-party weather clauses.
17. **Climatology at a point** (ERA5 via `ecmwf:era5`) — "typical September wind here is
    Bft 4; you are in the top 5 % today".

## D. Bio / solar / elevation (new endpoints)

18. **Bathymetry / elevation** (`/elevation/point`) — shallow-water wave steepening
    heuristic and under-keel clearance check together with tide + swell.
19. **UV index and solar radiation** (`/solar/point`) — deck-crew exposure advisories;
    solar-yield forecast for hybrid vessels.
20. **Sea-surface salinity & water temperature** (bio endpoint `meto`) — ballast-water
    exchange planning; engine cooling-water alerts when `waterTemperature` > limit.
21. **Sea-ice cover and thickness** (`iceCover`, `seaIceThickness`) — Arctic/Baltic
    routing: alarm when ice cover > 10 % within 24 h at any point.

## E. App / UX

22. **AIS / GPS auto-point** — read own-ship position from NMEA 0183/2000 (serial or
    UDP) and keep "Own ship" as a moving 11th point with a forward-projected track.
23. **Heading-aware wind** — show relative/apparent wind at each point given planned
    course and speed.
24. **Bridge-alarm integration** — relay CRITICAL alarms to the bridge alert management
    system via NMEA `ALR` sentences, or to a Signal K server; escalate via email/SMS when
    unacknowledged for 5 min.
25. **Multi-display / kiosk mode** — full-screen map with the metric panel enlarged, high-
    contrast night palette, touch-friendly acknowledge button.
26. **Offline resilience** — cache the last 72 h forecast on disk; show "data age" and
    degrade gracefully when the satellite link drops; retry with exponential back-off.
27. **Threshold presets by vessel type** — "Container 8 000 TEU", "Ro-Ro", "Fishing 24 m",
    "Sailing yacht" pre-fill sensible wind/wave/visibility limits.
28. **Voice / spoken alerts** — speech synthesis reads the alarm text ("Warning, Biscay,
    wave height three metres in seventy minutes").
29. **Per-point notes and ETA** — attach berth name, pilot boarding time; show weather at ETA.
30. **Team sync** — optional export/import of the tracking list and thresholds as a JSON
    file so the whole bridge team runs the same configuration.

## Suggested next milestones

| Milestone | Items | Effort |
|---|---|---|
| v0.2 | 1 (route/leg time-shift), 2 (model spread), 11 (tides), 26 (offline cache) | 1–2 weeks |
| v0.3 | 3 (compound rules), 12 (wind-against-current), 14 (astronomy/night mode), 27 (presets) | 1–2 weeks |
| v0.4 | 15 (verification scoreboard), 22 (NMEA own-ship), 24 (bridge alarm relay) | 2–3 weeks |
