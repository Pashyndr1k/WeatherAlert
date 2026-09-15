# Short-term marine weather API comparison (September 2026)

Scope: providers usable from a desktop app for point forecasts at sea across Europe & Asia,
with wind, waves, pressure, temperature, clouds and visibility. Sources: vendor docs and
pricing pages, model-verification literature, review aggregators and community threads
(links at the end).

## Summary table

| Provider | Marine data | Sources / models | Free tier | Paid entry | Resolution (best) | Horizon | Notes |
|---|---|---|---|---|---|---|---|
| **Stormglass.io** | Waves, swell (primary + secondary), wind-waves, currents, water temp, sea level, ice, tides, astronomy | ECMWF HRES/WAM/AIFS, NOAA GFS/GFS-Wave/RTOFS/AIGFS, Météo-France MFWAM, DWD GWAM, UK Met Office (global + NW Shelf 0.017°), MET Norway (0.10°, Nordic/Arctic), FCOO/FMI (Baltic), CMEMS. `sg` blend auto-picks the best source per location | 10 req/day, all parameters, **non-commercial only** | €19/mo 500/day (still non-commercial) · **€49/mo 5 000/day commercial** · €129/mo 25 000/day | 0.017° (UKMO NW Shelf), 0.10° (MET Norway), else 0.25–0.5° | up to 10 days (240 h for `sg`); ECMWF 6 d; AIFS 15 d | One request = one point, any number of parameters. Per-source values returned side by side, so a client can show model spread. Visibility only from `sg`/`noaa`/`metno`. Positive reviews from ship-routing customers; too few third-party reviews to be statistically meaningful. |
| **Open-Meteo** | Waves, swell (primary/secondary/tertiary), wind-waves, peak periods, currents, SST, sea level, inverted barometer | Atmosphere: ICON, GFS, ECMWF IFS 0.25, ARPEGE/AROME, UKMO, JMA, "best match" blend. Waves: MFWAM 0.08°, ECMWF WAM 9 km, GFS-Wave 0.25/0.16°, DWD EWAM 0.05° (Europe), GWAM | **10 000/day, no key, non-commercial** (600/min, 5 000/h) | $29/mo commercial (dedicated servers, API key, 99.9 % uptime); $99/mo professional | EWAM 0.05° Europe; MFWAM 0.08° global; atmosphere down to 1–2 km (ICON-D2/AROME) | 7–16 days depending on model | Multiple coordinates per request. Open source (AGPL); can be self-hosted. `wave_height`/`wave_period` are spectrum-combined values, so surfers report small differences vs. app-specific spectral partitions. No SLA on the free tier. |
| **Windy Point Forecast API** | Waves, wind-waves, swell 1 & 2 | GFS, ICON-EU, AROME, NAM, GFS-Wave, ICON-Wave (ECMWF *excluded* from the API for licensing reasons) | Trial: 500/day but data is **deliberately shuffled/perturbed** — unusable for real alerts | **€990/year**, 10 000/day | ICON-EU 7 km, AROME 1.3 km (atmosphere); waves 0.25° | model-dependent | Familiar brand for sailors, but no ECMWF, no visibility, and no free path to real data. |
| **Meteomatics** | Wave height/direction/period, currents, SST, sea ice, Stokes drift, tides — 1 800+ parameters total | 110+ sources incl. ECMWF, ICON, UKMO, own Meteodrone data; 90 m downscaling | 14-day trial, 500/day | Custom quote (typically four figures/year) | 1 km (marketing), 90 m downscaled | 14+ days | Strong for audited enterprise use; G2 reviewers praise accuracy and reliability, criticise inflexible pricing. Overkill for a single-vessel app. |
| **Tomorrow.io** | Maritime is a **premium add-on** (waveHeight, swell, wind-wave period…) | Proprietary blend + radar/satellite + own constellation | Free tier is atmosphere only | Enterprise quote for maritime | ~1 km atmosphere | 14 days | Excellent nowcasting on land; marine gated behind sales. |
| **WeatherAPI.com** | Marine + tide endpoint (waves, swell, water temp) | Blend | 1 M calls/month but marine limited on free tier | Pro+ ($~25/mo) unlocks marine + tides | 1 hour, ~10 km | 14 days | Easy to integrate; marine data thinner and less transparent about the source model. |
| **OpenWeatherMap One Call 3.0** | None (no waves) | Own blend | 1 000 calls/day | pay-as-you-go | ~10 km | 8 days | Not suitable as primary marine source. |
| **Visual Crossing** | None (no waves) | NWS/ECMWF/GFS blend | 1 000 records/day | $35/mo | ~10 km | 15 days | Historical/bulk strength; no sea state. |
| **Met Office UKMCAS / Copernicus Marine (CMEMS)** | Full ocean/wave analyses, AMM15 wave at 1.5 km (NW Shelf), global 1/12° | Native model output | Free (registration) | — | 1.5 km NW Shelf | 5–10 days | Delivered as NetCDF via FTP/SFTP or subsetting APIs; you need to grid-sample yourself. Best raw quality for European shelf seas but significant engineering. |

## Which models are actually most accurate?

- ECMWF IFS remains the top-scoring global model for Europe and the Northern Hemisphere in
  WMO verification, and ECMWF "maintained its long-term lead for significant wave height
  and peak period" in its 2025 forecast-performance review.
- ECMWF's AI model (AIFS) beats IFS for 2 m temperature and 10 m wind over land in Europe,
  but a 2025 study of *marine* winds found raw IFS ensembles "substantially superior" to
  raw AIFS at all horizons. For a captain, physics-based IFS/ICON remain the safer default.
- Regional models win within their domains: DWD ICON-EU / EWAM (5 km waves) for the North
  Sea and Baltic, MET Norway MEPS/Nordic (2.5 km atmosphere) for Norwegian waters, UK Met
  Office AMM15 (1.5 km) on the NW European shelf, Météo-France MFWAM for the global wave field.
- GFS/GFS-Wave is the weakest of the big three for European seas and *does not cover* the
  Baltic, Black Sea or Caspian in the GFS-Wave grid; NOAA notes this explicitly and Windy's
  API docs repeat it.

## Recommendation for this app

1. **Ship with Open-Meteo as the default and Stormglass as the premium option** (implemented).
   Open-Meteo gives real, key-less data for development and for captains who just want to try
   the app; Stormglass adds the multi-source `sg` blend, UKMO NW Shelf and MET Norway high-res
   grids, tides, and a commercial licence at €49/month.
2. **Stormglass free tier is not enough for live alerting**: 10 requests/day with one point per
   request means one refresh per day for 10 points. The app therefore evaluates alarms every
   30 s against a cached 72 h forecast, and the Settings screen shows the request budget so the
   captain can pick a plan (Small €19 = 500/day covers 10 points refreshed every 30 min).
3. **Prefer `sg` blend, but expose single sources**: the `sg` grid picks the best source per
   location; a captain in Norwegian waters may prefer `metno`, one in the Channel `meto`. The
   app lets the user choose in Settings → Provider.
4. **Avoid Windy's API for alerts** (trial data is perturbed; no ECMWF; €990/year) and
   OpenWeather/Visual Crossing (no waves). Meteomatics/Tomorrow.io only if fleet-scale budgets exist.
5. **Long-term option**: sample CMEMS/UKMCAS NetCDF directly for the North-West Shelf
   (1.5 km waves) if routes are mostly UK/North Sea — highest quality, zero licence cost, most
   engineering.

## Community / user feedback highlights

- Stormglass: customer quotes cite "accurate weather data, high quality service and great
  support"; an autonomous-ship-routing customer reports it "continuously improves the
  performance" of their routing. Independent review counts on Datarade/G2 are low. Developers
  praise the single-integration, per-source transparency. Complaints centre on the tiny free
  quota (10/day) and the fact that even the €19 plan forbids commercial use.
- Open-Meteo: GitHub discussion #577 (surf forecasts) — users found GFS-Wave data via
  Open-Meteo "very similar" to most surf apps, with the caveat that combined wave height /
  period average out swell partitions. Praised for reliability and openness; criticised for no
  SLA on the free tier and occasional model-run latency.
- Windy: sailing community threads (community.windy.com "Which model is most accurate for
  Europe?") converge on ECMWF ≥ ICON-EU > GFS for European waters, which is exactly the model
  set the Point Forecast API cannot provide (ECMWF excluded).
- Meteomatics: G2 reviewers highlight accuracy and reliability, mention inflexible pricing.

## Sources

- Stormglass docs: https://docs.stormglass.io/ (weather.md, sources.md, errors.md) · pricing: https://stormglass.io/pricing/ · FAQ: https://stormglass.io/faq/ · profile with testimonials: https://datarade.ai/data-providers/storm-glass/profile
- Open-Meteo Marine API: https://open-meteo.com/en/docs/marine-weather-api · pricing: https://open-meteo.com/en/pricing · GitHub: https://github.com/open-meteo/open-meteo · surf-forecast comparison thread: https://github.com/open-meteo/open-meteo/discussions/577 · new marine models: https://openmeteo.substack.com/p/new-weather-and-marine-models-integrated
- Windy Point Forecast API: https://api.windy.com/point-forecast/docs · https://api.windy.com/point-forecast/pricing · model accuracy thread: https://community.windy.com/topic/6540/which-model-is-most-accurate-for-europe
- Meteomatics: https://www.meteomatics.com/en/weather-api/best-weather-apis/ · https://www.meteomatics.com/en/api/available-parameters/marine-parameters/ · https://www.g2.com/products/meteomatics/pricing · https://datarade.ai/data-providers/meteomatics/profile
- Tomorrow.io: https://docs.tomorrow.io/reference/maritime · https://support.tomorrow.io/hc/en-us/articles/38449704398356-Maritime-Premium-Layer
- Multi-API roundups: https://www.getambee.com/blogs/best-weather-apis · https://nordicapis.com/6-best-free-and-paid-weather-apis/ · https://www.xweather.com/blog/top-weather-apis-for-production-2026 · https://geekflare.com/guides/weather-api/ · https://www.abstractapi.com/guides/other/best-weather-apis · https://www.visualcrossing.com/resources/blog/best-weather-api-for-2025/
- Model verification: ECMWF forecast performance 2025: https://www.ecmwf.int/en/newsletter/187/news/forecast-performance-2025 · marine wind NWP correction study (2025): https://arxiv.org/pdf/2512.03606 · AIFS update: https://arxiv.org/pdf/2509.18994 · PredictWind model glossary: https://help.predictwind.com/en/articles/2884560
- Met Office marine data service: https://www.metoffice.gov.uk/services/data/met-office-marine-data-service · Copernicus Marine: https://data.marine.copernicus.eu/
- Sailing app landscape: https://www.yacht.de/en/sailing-knowledge/navigation/apps-for-sailing-the-best-weather-apps-for-the-2026-sailing-season/ · https://www.sealegs.ai/blog/best-marine-weather-apps
