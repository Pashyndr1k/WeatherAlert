// Metric registry — every weather parameter the Stormglass weather endpoint offers,
// plus its Open-Meteo equivalent where one exists. Works both as a CommonJS module
// (main process) and as a browser global (renderer).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WA = Object.assign(root.WA || {}, factory());
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // kind → canonical unit stored internally
  //   speed: m/s | length: m | temp: °C | pressure: hPa | pct: % | dir: ° (from)
  //   period: s | vis: km | precip: mm/h | factor: 0..1 | depth: m
  const M = (id, label, group, kind, om, extra = {}) =>
    Object.assign({ id, label, group, kind, om, sg: id, threshold: kind !== 'dir' && kind !== 'text' }, extra);

  const METRICS = [
    // ---- Wind ----
    M('windSpeed', 'Wind speed', 'Wind', 'speed', 'wind_speed_10m', { core: true, def: true, icon: 'wind' }),
    M('gust', 'Wind gust', 'Wind', 'speed', 'wind_gusts_10m', { core: true, def: true, icon: 'gust' }),
    M('windDirection', 'Wind direction', 'Wind', 'dir', 'wind_direction_10m', { core: true, def: true, icon: 'compass' }),
    M('windSpeed20m', 'Wind speed 20 m', 'Wind (levels)', 'speed', null),
    M('windSpeed30m', 'Wind speed 30 m', 'Wind (levels)', 'speed', null),
    M('windSpeed40m', 'Wind speed 40 m', 'Wind (levels)', 'speed', null),
    M('windSpeed50m', 'Wind speed 50 m', 'Wind (levels)', 'speed', null),
    M('windSpeed80m', 'Wind speed 80 m', 'Wind (levels)', 'speed', 'wind_speed_80m'),
    M('windSpeed100m', 'Wind speed 100 m', 'Wind (levels)', 'speed', 'wind_speed_120m'),
    M('windDirection20m', 'Wind dir 20 m', 'Wind (levels)', 'dir', null),
    M('windDirection30m', 'Wind dir 30 m', 'Wind (levels)', 'dir', null),
    M('windDirection40m', 'Wind dir 40 m', 'Wind (levels)', 'dir', null),
    M('windDirection50m', 'Wind dir 50 m', 'Wind (levels)', 'dir', null),
    M('windDirection80m', 'Wind dir 80 m', 'Wind (levels)', 'dir', 'wind_direction_80m'),
    M('windDirection100m', 'Wind dir 100 m', 'Wind (levels)', 'dir', 'wind_direction_120m'),
    M('windSpeed1000hpa', 'Wind speed 1000 hPa', 'Upper air', 'speed', 'wind_speed_1000hPa'),
    M('windSpeed800hpa', 'Wind speed 800 hPa', 'Upper air', 'speed', 'wind_speed_800hPa'),
    M('windSpeed500hpa', 'Wind speed 500 hPa', 'Upper air', 'speed', 'wind_speed_500hPa'),
    M('windSpeed200hpa', 'Wind speed 200 hPa', 'Upper air', 'speed', 'wind_speed_200hPa'),
    M('windDirection1000hpa', 'Wind dir 1000 hPa', 'Upper air', 'dir', 'wind_direction_1000hPa'),
    M('windDirection800hpa', 'Wind dir 800 hPa', 'Upper air', 'dir', 'wind_direction_800hPa'),
    M('windDirection500hpa', 'Wind dir 500 hPa', 'Upper air', 'dir', 'wind_direction_500hPa'),
    M('windDirection200hpa', 'Wind dir 200 hPa', 'Upper air', 'dir', 'wind_direction_200hPa'),

    // ---- Sea state ----
    M('waveHeight', 'Wave height (Hs)', 'Sea state', 'length', 'wave_height', { core: true, def: true, icon: 'wave' }),
    M('wavePeriod', 'Wave period', 'Sea state', 'period', 'wave_period', { core: true, def: true, icon: 'period' }),
    M('waveDirection', 'Wave direction', 'Sea state', 'dir', 'wave_direction', { core: true, icon: 'compass' }),
    M('swellHeight', 'Swell height', 'Sea state', 'length', 'swell_wave_height', { core: true, icon: 'wave' }),
    M('swellPeriod', 'Swell period', 'Sea state', 'period', 'swell_wave_period', { core: true }),
    M('swellDirection', 'Swell direction', 'Sea state', 'dir', 'swell_wave_direction', { core: true }),
    M('secondarySwellHeight', 'Secondary swell height', 'Sea state', 'length', 'secondary_swell_wave_height'),
    M('secondarySwellPeriod', 'Secondary swell period', 'Sea state', 'period', 'secondary_swell_wave_period'),
    M('secondarySwellDirection', 'Secondary swell direction', 'Sea state', 'dir', 'secondary_swell_wave_direction'),
    M('windWaveHeight', 'Wind-wave height', 'Sea state', 'length', 'wind_wave_height', { core: true }),
    M('windWavePeriod', 'Wind-wave period', 'Sea state', 'period', 'wind_wave_period', { core: true }),
    M('windWaveDirection', 'Wind-wave direction', 'Sea state', 'dir', 'wind_wave_direction', { core: true }),

    // ---- Atmosphere ----
    M('pressure', 'Pressure (MSL)', 'Atmosphere', 'pressure', 'pressure_msl', { core: true, def: true, icon: 'baro' }),
    M('airTemperature', 'Air temperature', 'Atmosphere', 'temp', 'temperature_2m', { core: true, def: true, icon: 'temp' }),
    M('dewPointTemperature', 'Dew point', 'Atmosphere', 'temp', 'dew_point_2m', { core: true }),
    M('humidity', 'Relative humidity', 'Atmosphere', 'pct', 'relative_humidity_2m', { core: true }),
    M('cloudCover', 'Cloud cover', 'Sky & visibility', 'pct', 'cloud_cover', { core: true, def: true, icon: 'cloud' }),
    M('visibility', 'Visibility', 'Sky & visibility', 'vis', 'visibility', { core: true, def: true, icon: 'eye' }),
    M('precipitation', 'Precipitation', 'Precipitation', 'precip', 'precipitation', { core: true }),
    M('rain', 'Rain', 'Precipitation', 'precip', 'rain'),
    M('snow', 'Snow', 'Precipitation', 'precip', 'snowfall'),
    M('graupel', 'Graupel', 'Precipitation', 'precip', null),
    M('snowDepth', 'Snow depth', 'Precipitation', 'depth', 'snow_depth'),
    M('snowAlbedo', 'Snow albedo', 'Precipitation', 'factor', null),

    // ---- Temperature (levels) ----
    M('airTemperature80m', 'Air temp 80 m', 'Upper air', 'temp', 'temperature_80m'),
    M('airTemperature100m', 'Air temp 100 m', 'Upper air', 'temp', 'temperature_120m'),
    M('airTemperature1000hpa', 'Air temp 1000 hPa', 'Upper air', 'temp', 'temperature_1000hPa'),
    M('airTemperature800hpa', 'Air temp 800 hPa', 'Upper air', 'temp', 'temperature_800hPa'),
    M('airTemperature500hpa', 'Air temp 500 hPa', 'Upper air', 'temp', 'temperature_500hPa'),
    M('airTemperature200hpa', 'Air temp 200 hPa', 'Upper air', 'temp', 'temperature_200hPa'),

    // ---- Ocean ----
    M('waterTemperature', 'Water temperature', 'Ocean', 'temp', 'sea_surface_temperature', { core: true }),
    M('surfaceTemperature', 'Surface temperature', 'Ocean', 'temp', null),
    M('currentSpeed', 'Current speed', 'Ocean', 'speed', 'ocean_current_velocity', { core: true }),
    M('currentDirection', 'Current direction (towards)', 'Ocean', 'dir', 'ocean_current_direction', { core: true }),
    M('seaLevel', 'Sea level (rel. MSL)', 'Ocean', 'length', 'sea_level_height_msl'),
    M('iceCover', 'Ice cover', 'Ocean', 'factor', null),
    M('seaIceThickness', 'Sea-ice thickness', 'Ocean', 'depth', null)
  ];

  // Derived, captain-oriented indicators computed locally from the raw metrics.
  const DERIVED = [
    { id: 'd_beaufort', label: 'Beaufort force', group: 'Derived (maritime)', kind: 'text', def: true, icon: 'bft', needs: ['windSpeed'] },
    { id: 'd_seaState', label: 'Sea state (Douglas)', group: 'Derived (maritime)', kind: 'text', def: true, icon: 'wave', needs: ['waveHeight'] },
    { id: 'd_cloudCondition', label: 'Cloud conditions', group: 'Derived (maritime)', kind: 'text', def: true, icon: 'cloud', needs: ['cloudCover'] },
    { id: 'd_airCondition', label: 'Air conditions', group: 'Derived (maritime)', kind: 'text', def: true, icon: 'fog', needs: ['visibility'] },
    { id: 'd_pressureTendency', label: 'Pressure tendency (3 h)', group: 'Derived (maritime)', kind: 'ptend', def: true, threshold: true, icon: 'baro', needs: ['pressure'] },
    { id: 'd_crossSea', label: 'Cross-sea', group: 'Derived (maritime)', kind: 'text', def: false, icon: 'wave', needs: ['swellDirection', 'windWaveDirection'] },
    { id: 'd_fogRisk', label: 'Fog risk', group: 'Derived (maritime)', kind: 'text', def: false, icon: 'fog', needs: ['airTemperature', 'dewPointTemperature'] },
    { id: 'd_gustFactor', label: 'Gust factor', group: 'Derived (maritime)', kind: 'ratio', def: false, threshold: true, icon: 'gust', needs: ['windSpeed', 'gust'] },
    { id: 'd_icing', label: 'Icing index (Overland)', group: 'Derived (maritime)', kind: 'icing', def: true, threshold: true, icon: 'ice', needs: ['airTemperature', 'waterTemperature', 'windSpeed'] },
    { id: 'd_advFog', label: 'Advection-fog probability', group: 'Derived (maritime)', kind: 'pct', def: true, threshold: true, icon: 'fog', needs: ['waterTemperature', 'dewPointTemperature', 'windSpeed', 'humidity'] }
  ];
  // Short uppercase labels for the bottom metric strip
  const SHORT = { windSpeed: 'WIND 10M', gust: 'GUST', windDirection: 'WIND DIR', waveHeight: 'WAVE HS', wavePeriod: 'WAVE TP', waveDirection: 'WAVE DIR',
    swellHeight: 'SWELL', swellPeriod: 'SWELL TP', swellDirection: 'SWELL DIR', windWaveHeight: 'WIND WAVE', pressure: 'PRESSURE', airTemperature: 'AIR TEMP',
    waterTemperature: 'WATER', dewPointTemperature: 'DEW POINT', humidity: 'HUMIDITY', cloudCover: 'CLOUD', visibility: 'VISIBILITY', precipitation: 'PRECIP',
    currentSpeed: 'CURRENT', currentDirection: 'CURRENT DIR', d_beaufort: 'BEAUFORT', d_seaState: 'SEA STATE', d_cloudCondition: 'SKY', d_airCondition: 'AIR COND',
    d_pressureTendency: 'P TREND 3H', d_crossSea: 'CROSS SEA', d_fogRisk: 'FOG RISK', d_gustFactor: 'GUST FACTOR', d_icing: 'ICING', d_advFog: 'ADV FOG' };

  const byId = {};
  METRICS.forEach((m) => { byId[m.id] = m; });
  DERIVED.forEach((m) => { byId[m.id] = m; });

  const GROUP_ORDER = ['Wind', 'Sea state', 'Atmosphere', 'Sky & visibility', 'Precipitation', 'Ocean', 'Derived (maritime)', 'Wind (levels)', 'Upper air'];

  // Parameters we always request from Stormglass (one request returns all of them,
  // so asking for the useful set costs nothing extra and avoids re-fetching on toggles).
  const SG_CORE_PARAMS = METRICS.filter((m) => m.core).map((m) => m.id);

  return { METRICS, DERIVED, METRIC_BY_ID: byId, GROUP_ORDER, SG_CORE_PARAMS, SHORT };
});
