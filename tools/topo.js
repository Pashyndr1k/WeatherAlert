// Convert the clipped GeoJSON layers into one quantised TopoJSON file per level of detail.
// Usage: node tools/topo.js
const fs = require('fs');
const path = require('path');
const topojson = require('topojson-server');

const dir = path.join(__dirname, '..', 'assets', 'blacksea');
const RES = { c: 1e4, l: 3e4, i: 1e5, h: 3e5, f: 1e6 }; // quantisation grid per resolution

for (const [res, q] of Object.entries(RES)) {
  const layers = {};
  for (const layer of ['land', 'lakes', 'borders', 'rivers']) {
    const p = path.join(dir, `${layer}_${res}.geojson`);
    if (fs.existsSync(p)) layers[layer] = JSON.parse(fs.readFileSync(p, 'utf8'));
  }
  const topo = topojson.topology(layers, q);
  const out = path.join(dir, `blacksea_${res}.json`);
  fs.writeFileSync(out, JSON.stringify(topo));
  const kb = (fs.statSync(out).size / 1024).toFixed(0);
  console.log(`${res}: ${kb} KB, arcs=${topo.arcs.length}`);
}
