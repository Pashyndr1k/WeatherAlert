// Build depth bands for the Black Sea & Sea of Azov from the ETOPO 2022 (1 arc-minute) subset
// downloaded from NOAA ERDDAP into tools/depth/etopo.json. Output: assets/blacksea/depth.json (TopoJSON)
// with one MultiPolygon per band = "deeper than N metres" (bands stack, so later fills darken).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as d3 from 'd3';
import * as topojson from 'topojson-server';
import * as simplify from 'topojson-simplify';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const src = JSON.parse(fs.readFileSync(path.join(__dirname, 'depth', 'etopo.json'), 'utf8'));
const rows = src.table.rows; // [lat, lon, altitude]
const lats = [...new Set(rows.map((r) => r[0]))].sort((a, b) => a - b);
const lons = [...new Set(rows.map((r) => r[1]))].sort((a, b) => a - b);
const W = lons.length, H = lats.length;
const lonIdx = new Map(lons.map((v, i) => [v, i])), latIdx = new Map(lats.map((v, i) => [v, i]));
const grid = new Float32Array(W * H);
rows.forEach(([lat, lon, alt]) => { grid[latIdx.get(lat) * W + lonIdx.get(lon)] = Math.max(0, -alt); }); // depth, m (0 on land)
const lon0 = lons[0], lat0 = lats[0], dx = (lons[W - 1] - lon0) / (W - 1), dy = (lats[H - 1] - lat0) / (H - 1);

const THRESHOLDS = [0.5, 10, 20, 50, 100, 200, 500, 1000, 1500, 2000];
const contours = d3.contours().size([W, H]).thresholds(THRESHOLDS)(grid);

function toLonLat([x, y]) { return [+(lon0 + x * dx).toFixed(4), +(lat0 + y * dy).toFixed(4)]; }
function fixWinding(poly) {
  // d3-geo wants exterior rings clockwise (spherical); flip any ring set whose area exceeds a hemisphere
  const g = { type: 'Polygon', coordinates: poly };
  if (d3.geoArea(g) > 2 * Math.PI) return poly.map((r) => r.slice().reverse());
  return poly;
}
const features = contours.map((c) => ({
  type: 'Feature',
  properties: { depth: c.value === 0.5 ? 0 : c.value },
  geometry: { type: 'MultiPolygon', coordinates: c.coordinates.map((poly) => fixWinding(poly.map((ring) => ring.map(toLonLat)))).filter((poly) => poly[0].length > 8) }
}));

let topo = topojson.topology({ depth: { type: 'FeatureCollection', features } }, 2e4);
topo = simplify.presimplify(topo);
topo = simplify.simplify(topo, simplify.quantile(topo, 0.55)); // drop the noisiest ~55 % of points
const out = path.join(__dirname, '..', 'assets', 'blacksea', 'depth.json');
fs.writeFileSync(out, JSON.stringify(topo));
console.log(`grid ${W}x${H}, bands ${features.length}, ${(fs.statSync(out).size / 1024).toFixed(0)} KB, arcs ${topo.arcs.length}`);
