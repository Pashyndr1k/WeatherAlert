// Build the depth grid used for shoaling and fetch estimates from an ETOPO subset downloaded from NOAA ERDDAP:
//   curl -o tools/depth/etopo_3min.json "https://coastwatch.pfeg.noaa.gov/erddap/griddap/etopo180.json?altitude[(39.8):3:(47.8)][(26.5):3:(42.5)]"
// Output: assets/blacksea/bathy.json — { lat0, lon0, dlat, dlon, w, h, d } with d = depth in metres (0 on land),
// row-major from the south-west corner. 0.05° cells (≈ 5.5 km N–S, ≈ 4 km E–W), 161 × 321 = 51 681 cells.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const src = JSON.parse(fs.readFileSync(path.join(__dirname, 'depth', 'etopo_3min.json'), 'utf8'));
const rows = src.table.rows; // [lat, lon, altitude]
const r2 = (x) => Math.round(x * 20) / 20; // snap ERDDAP's 39.80000000000001 to the 0.05° lattice
const lats = [...new Set(rows.map((r) => r2(r[0])))].sort((a, b) => a - b);
const lons = [...new Set(rows.map((r) => r2(r[1])))].sort((a, b) => a - b);
const w = lons.length, h = lats.length;
const li = new Map(lons.map((v, i) => [v, i])), ti = new Map(lats.map((v, i) => [v, i]));
const d = new Array(w * h).fill(0);
rows.forEach(([lat, lon, alt]) => { d[ti.get(r2(lat)) * w + li.get(r2(lon))] = Math.max(0, Math.round(-alt)); });
const out = { lat0: lats[0], lon0: lons[0], dlat: 0.05, dlon: 0.05, w, h, d };
const file = path.join(__dirname, '..', 'assets', 'blacksea', 'bathy.json');
fs.writeFileSync(file, JSON.stringify(out));
const sea = d.filter((x) => x > 0).length;
console.log(`grid ${w}x${h}, sea cells ${sea}, max depth ${Math.max(...d)} m, ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
