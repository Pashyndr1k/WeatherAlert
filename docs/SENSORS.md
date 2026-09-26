# Feeding ship sensors into WeatherAlert

Settings → **Sensors** turns on a local receiver. While it runs, an **OWN SHIP** point appears on the
map; its widgets show the live readings (tagged LIVE) with the model forecast underneath, and the
alarm engine treats the live value as "now" for that point, so a limit crossed by your own
anemometer or barometer raises CRITICAL immediately.

Two inputs are accepted at the same time:

## 1. NMEA 0183 over UDP or TCP (default port 10110)

Point your weather station, NMEA multiplexer or bridge software (e.g. an Airmar/Maretron/Furuno
weather sensor, OpenCPN, Signal K's NMEA 0183 output, a serial-to-Ethernet converter) at the PC
running WeatherAlert, port 10110. Sentences with a checksum are verified; the talker id is ignored.

| Sentence | Used for |
|---|---|
| `MWV` | wind angle + speed (units N knots, M m/s, K km/h). `T` = true wind. `R` = relative: converted to an *apparent* direction when a `HDT` heading has been received |
| `MWD` | true wind direction + speed |
| `MDA` | pressure (bar or inHg), air temperature, water temperature, humidity, dew point, wind |
| `XDR` | transducers: `P` pressure (bar or Pa), `C` temperature (name containing WATER/SEA → water temp), `H` humidity, `A` wind angle |
| `MTW` | water temperature |
| `HDT` | true heading (for relative wind) |
| `RMC`, `GGA`, `GLL`, `VTG` | own position, speed and course → the OWN SHIP marker follows the GPS |

Example (any tool that sends UDP text works):

```powershell
$u = New-Object System.Net.Sockets.UdpClient
$b = [Text.Encoding]::ASCII.GetBytes("`$WIMDA,29.92,I,1.0132,B,18.5,C,16.2,C,78.0,,,,14.5,C,270.0,T,265.0,M,12.0,N,6.2,M*3F`r`n")
$u.Send($b, $b.Length, "127.0.0.1", 10110)
```

## 2. JSON over HTTP (default port 8787)

For Arduino/ESP32 loggers, Raspberry Pi scripts or anything that can make an HTTP request:

```
POST http://<pc-address>:8787/sensors
Content-Type: application/json

{ "windSpeed": 25, "windSpeedUnit": "kn", "windDirection": 200, "gust": 31,
  "airTemperature": 9.1, "pressure": 998.4, "humidity": 82, "waterTemperature": 12.0,
  "dewPointTemperature": 6.2, "visibility": 4.5, "lat": 44.50, "lon": 34.20, "heading": 95 }
```

All fields are optional; send whatever the sensor has. Units: `windSpeedUnit` `ms` (default), `kn` or
`kmh`; temperatures °C; `pressure` hPa (or add `"pressureUnit": "inHg"`); `humidity` %; `visibility`
km; `lat`/`lon` decimal degrees WGS84. `GET /sensors` returns the current snapshot as JSON.
NMEA text can also be POSTed as `text/plain`.

## Behaviour

- Readings are kept per metric with their arrival time; a reading older than the **staleness
  limit** (default 5 minutes) is no longer used and the widget falls back to the forecast.
- Position: from GPS sentences / JSON when present, otherwise the fixed coordinates set in Settings.
- Alarms: for OWN SHIP the current value is the live reading; the 60–90 min WARNING still comes from
  the forecast trajectory. Other tracking points are unaffected.
- The receiver listens on all interfaces; keep the PC on the ship's LAN, not exposed to the internet.
