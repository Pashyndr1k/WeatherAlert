"""Clip GSHHG (shorelines) + WDBII (borders, rivers) to the Black Sea / Sea of Azov window
and write one GeoJSON per level of detail. Run once; output goes to assets/blacksea/.

GSHHG resolutions: c (crude) l (low) i (intermediate) h (high) f (full)
Levels: L1 land, L2 lakes. WDBII: border L1 national, river L01-L03 major.
"""
import io, json, os, sys, zipfile
import shapefile
from shapely.geometry import shape, box, mapping, MultiPolygon, Polygon, MultiLineString, LineString, GeometryCollection
from shapely.ops import unary_union

HERE = os.path.dirname(os.path.abspath(__file__))
ZIP = os.path.join(HERE, 'gshhg', 'gshhg-shp-2.3.7.zip')
OUT = os.path.join(HERE, '..', 'assets', 'blacksea')
# generous window so the map can pan a little beyond the seas
BBOX = box(25.0, 38.5, 44.0, 49.5)
RES = ['c', 'l', 'i', 'h', 'f']

os.makedirs(OUT, exist_ok=True)
z = zipfile.ZipFile(ZIP)

def read_shp(base):
    """base like 'GSHHS_shp/f/GSHHS_f_L1' -> shapefile.Reader from in-memory members"""
    def mem(ext):
        try:
            return io.BytesIO(z.read(base + ext))
        except KeyError:
            return None
    shp, shx, dbf = mem('.shp'), mem('.shx'), mem('.dbf')
    if not shp:
        return None
    return shapefile.Reader(shp=shp, shx=shx, dbf=dbf)

def clip_layer(base, keep_types):
    r = read_shp(base)
    if r is None:
        return []
    feats = []
    minx, miny, maxx, maxy = BBOX.bounds
    for sr in r.iterShapeRecords():
        b = sr.shape.bbox
        if b[2] < minx or b[0] > maxx or b[3] < miny or b[1] > maxy:
            continue
        g = shape(sr.shape.__geo_interface__)
        if not g.is_valid:
            g = g.buffer(0)
        c = g.intersection(BBOX)
        if c.is_empty:
            continue
        parts = c.geoms if isinstance(c, GeometryCollection) else [c]
        for p in parts:
            if isinstance(p, keep_types) and not p.is_empty:
                feats.append(p)
    return feats

def write(name, geoms, props):
    fc = {'type': 'FeatureCollection', 'features': [
        {'type': 'Feature', 'properties': props, 'geometry': mapping(g)} for g in geoms]}
    path = os.path.join(OUT, name)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(fc, f, separators=(',', ':'))
    return os.path.getsize(path)

summary = {}
for res in RES:
    land = clip_layer(f'GSHHS_shp/{res}/GSHHS_{res}_L1', (Polygon, MultiPolygon))
    lakes = clip_layer(f'GSHHS_shp/{res}/GSHHS_{res}_L2', (Polygon, MultiPolygon))
    borders = clip_layer(f'WDBII_shp/{res}/WDBII_border_{res}_L1', (LineString, MultiLineString))
    rivers = []
    for lvl in ('L01', 'L02', 'L03'):
        rivers += clip_layer(f'WDBII_shp/{res}/WDBII_river_{res}_{lvl}', (LineString, MultiLineString))
    sizes = {
        'land': write(f'land_{res}.geojson', land, {'layer': 'land'}),
        'lakes': write(f'lakes_{res}.geojson', lakes, {'layer': 'lakes'}),
        'borders': write(f'borders_{res}.geojson', borders, {'layer': 'borders'}),
        'rivers': write(f'rivers_{res}.geojson', rivers, {'layer': 'rivers'}),
    }
    summary[res] = {'features': {'land': len(land), 'lakes': len(lakes), 'borders': len(borders), 'rivers': len(rivers)}, 'bytes': sizes}
    print(res, summary[res], flush=True)

with open(os.path.join(OUT, 'summary.json'), 'w') as f:
    json.dump(summary, f, indent=1)
print('done')
