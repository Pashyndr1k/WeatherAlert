# Tide

The stormglass API provides tide data globally.

## Astronomical Tide

Tide data published through the stormglass API is astronomical tide which models how celestial bodies affect the sea level for a location at any given point in time. Astronomical tide is not the only phenomenon causing changes in sea level. Among others, atmospheric pressure, wind and storm systems can cause significant, long lasting effects on the local sea level.

## Sea Levels and Datums

Sea levels included in the data returned by the stormglass tide API will always be relative one of a predefined set of reference levels, or datums. The difference between two sea levels at two different points in time will correspond to the relative displacement of water as caused by the astronomical tide. The sea levels should _never_ be interpreted as representing actual water depth!

The table below lists the datums currently supported by the Storm Glass API.

Datum | Name | Interpretation of values
-------- | -------- | --------
`HAT` | Higest Astronomical Tide | Heights will be relative the highest astronomoical tide.
`MHHW` | Mean Higher High Water | Heights will be relative an average higher high tide.
`MHW` | Mean High Water | Heights will be relative an average high tide.
`MSL` | Mean Sea Level | Heights will be relative the average sea level.
`MLW` | Mean Low Water | Heights will be relative an average low tide.
`MLLW` | Mean Lower Low Water | Heights will be relative an average lower low tide.
`LAT` | Lowest Astronomical Tide | Heights will be relative the lowest astronomical tide.

Sea levels included in the data returned by the stormglass tide API will be offset by a constant value such that the selected datum becomes the zero level. For instance, when specifying the datum as `MLLW`, sea levels below the level of an average lower low tide will be reported using negative values whereas sea levels above the level of an average lower low tide will be reported using positive values. The values will always represent the same relative displacement of water, regardless of the datum used.

## Stations and Distance

The stormglass tide API is based on observational data from locations, or stations, around the world but accessed through `latitude` and `longitude` coordinates. The API will use the requested coordinates to locate the closest station and respond using its data.

The active station is indicated by the `station` object in the `meta` object included with each response. The `station` object includes a `distance` property indicating the great-circle distance in kilometers between the requested coordinates and the actual station.

## Extremes Point Request

Retrieve information about high and low tide times and the corresponding relative sea level in meters for a single coordinate. If nothing is specified, the returned values will be in relative to *Mean Sea Level* - MSL.

```endpoint
GET https://api.stormglass.io/v2/tide/extremes/point
```

#### Example
<!-- tabs:start -->

#### ** Python **
```python
import arrow
import requests

start = arrow.now().floor('day')
end = arrow.now().shift(days=1).floor('day')

response = requests.get(
  'https://api.stormglass.io/v2/tide/extremes/point',
  params={
    'lat': 60.936,
    'lng': 5.114,
    'start': start.to('UTC').timestamp(),  # Convert to UTC timestamp
    'end': end.to('UTC').timestamp(),  # Convert to UTC timestamp
  },
  headers={
    'Authorization': 'example-api-key'
  }
)

# Do something with response data.
json_data = response.json()
```

#### ** Curl **
```curl
curl -H "Authorization: example-api-key" "https://api.stormglass.io/v2/tide/extremes/point?lat=60.936&lng=5.114&start=2019-03-15&end=2019-03-15"
```

#### ** JavaScript **
```javascript
const lat = 60.936;
const lng = 5.114;

fetch(`https://api.stormglass.io/v2/tide/extremes/point?lat=${lat}&lng=${lng}&start=2019-03-15&end=2019-03-15`, {
  headers: {
    'Authorization': 'example-api-key'
  }
}).then((response) => response.json()).then((jsonData) => {
  // Do something with response data.
});
```
<!-- tabs:end -->


#### Example Response

```json
{
    "data": [
        {
            "height": 1.18,
            "time": "2019-03-15 03:40:44+00:00",
            "type": "high"
        },
        {
            "height": 0.60,
            "time": "2019-03-15 09:53:54+00:00",
            "type": "low"
        },
        {
            "height": 1.20,
            "time": "2019-03-15 16:23:29+00:00",
            "type": "high"
        },
        {
            "height": 0.61,
            "time": "2019-03-15 22:39:15+00:00",
            "type": "low"
        }
    ],
    "meta": {
        "cost": 1,
        "dailyQuota": 800,
        "end": "2019-03-16 00:00",
        "lat": 60.936,
        "lng": 5.114,
        "requestCount": 145,
        "start": "2019-03-15 00:00",
        "station": {
            "distance": 61,
            "lat": 60.398046,
            "lng": 5.320487,
            "name": "bergen",
            "source": "sehavniva.no"
        }
    }
}
```

#### Query Parameters

Parameter | Required | Default | Description
--------- | -------- | ------- | -----------
lat | ✔ | n/a | Latitude of the desired coordinate
lng | ✔ | n/a | Longitude of the desired coordinate
start | | Current UTC date at 00.00 | Timestamp in UTC for first forecast hour - UNIX format or URL encoded ISO format.
end | | 10 days from start | Timestamp in UTC for last forecast hour (exclusive) - UNIX format or URL encoded ISO format.
datum | | MSL | Datum values will be relative to. Either `LAT`, `MLLW`, `MLW`, `MSL`, `MHW`, `MHHW` or `HAT`.

#### Response Format

The response will be sent back in the form of a JSON object. The resource root contains two objects -
*data* and *meta*.

*Meta*

The meta object contains information about the API request. Such as requested latitude and longitude,
your daily quota and how many requests you've made so far today.

The meta data will also contain a *station* key with information about the station providing the data.

key | value
--- | -----
name | Name of tide station
distance | Distance between station and requested coordinate in km
lat | Latitude of tide station
lng | Longitude of tide station
source | Tide station owner

*Data*

The data object contains a list of extreme points occuring during the given time interval. One item in the list will
contain:

key | value
--- | -----
time | Timestamp in UTC
height | Height in meters
type | Type of extreme. Either `low` or `high`



## Sea Level Point Request

Retrieve the relative sea level in meters hour by hour for a single coordinate. If nothing is specified the returned values will be in relative to *Mean Sea Level* - MSL.

```endpoint
GET https://api.stormglass.io/v2/tide/sea-level/point
```

#### Example
<!-- tabs:start -->

#### ** Python **
```python
import arrow
import requests

start = arrow.now().floor('day')
end = arrow.now().shift(days=1).floor('day')

response = requests.get(
  'https://api.stormglass.io/v2/tide/sea-level/point',
  params={
    'lat': 43.38,
    'lng': -3.01,
    'start': start.to('UTC').timestamp(),  # Convert to UTC timestamp
    'end': end.to('UTC').timestamp(),  # Convert to UTC timestam
  },
  headers={
    'Authorization': 'example-api-key'
  }
)

# Do something with response data.
json_data = response.json()
```

#### ** Curl **
```curl
curl -H "Authorization: example-api-key" "https://api.stormglass.io/v2/tide/sea-level/point?lat=60.936&lng=-3.01&start=2020-02-24&end=2020-02-25"
```

#### ** JavaScript **
```javascript
const lat = 43.38;
const lng = -3.01;

fetch(`https://api.stormglass.io/v2/tide/sea-level/point?lat=${lat}&lng=${lng}&start=2020-02-24&end=2020-02-25`, {
  headers: {
    'Authorization': 'example-api-key'
  }
}).then((response) => response.json()).then((jsonData) => {
  // Do something with response data.
});
```
<!-- tabs:end -->


#### Example Response

```json
{
    "data": [
        {
            "sg": -0.62,
            "time": "2020-02-24T00:00:00+00:00"
        },
        {
            "sg": 0.16,
            "time": "2020-02-24T01:00:00+00:00"
        },
        {
            "sg": 0.9,
            "time": "2020-02-24T02:00:00+00:00"
        },
        {
            "sg": 1.45,
            "time": "2020-02-24T03:00:00+00:00"
        },
        ...
    ],
    "meta": {
        "cost": 1,
        "dailyQuota": 800,
        "end": "2020-02-25 00:00",
        "lat": 43.38,
        "lng": -3.01,
        "requestCount": 145,
        "start": "2020-02-24 00:00",
        "datum": "MSL",
        "station": {
            "distance": 4,
            "lat": 43.36,
            "lng": -3.05,
            "name": "bilbao",
            "source": "sg"
        }
    }
}
```

#### Query Parameters

Parameter | Required | Default | Description
--------- | -------- | ------- | -----------
lat | ✔ | n/a | Latitude of the desired coordinate
lng | ✔ | n/a | Longitude of the desired coordinate
start | | Current UTC date at 00.00 | Timestamp in UTC for first forecast hour - UNIX format or URL encoded ISO format.
end | | 10 days from start | Timestamp in UTC for last forecast hour (inclusive) - UNIX format or URL encoded ISO format.
datum | | MSL | Datum values will be relative to. Either `LAT`, `MLLW`, `MLW`, `MSL`, `MHW`, `MHHW` or `HAT`.

#### Response Format

The response will be sent back in the form of a JSON object. The resource root contains two objects,
*data* and *meta*.

*Meta*

The meta object contains information about the API request. Such as requested latitude and longitude,
your daily quota and how many requests you've made so far today.

The meta data will also contain a *station* key with information about the station providing the data.

key | value
--- | -----
name | Name of tide station
distance | Distance between station and requested coordinate in km
lat | Latitude of tide station
lng | Longitude of tide station
source | Tide station owner

*Data*

The data object contains sea level data on an hourly basis. One item in the list contains `key: value` pairs where
where the key is the source providing data and the value is the sea level given in meters.

key | value
--- | -----
`time` | Timestamp in UTC
`[source]` | Sea level given in metres where the key itself is the name of the source



## Stations List Request

The Tide Stations List Requests is used to list all available stations.


```endpoint
GET https://api.stormglass.io/v2/tide/stations
```

#### Response Format

The response will be sent back in the form of a JSON object. The resource root contains two objects,
*data* and *meta*.

*Meta*

The meta object contains information about the API request. Such as requested latitude and longitude,
your daily quota and how many requests you've made so far today.

*Data*

The data object contains a list of all available stations and each station consists of:

key | value
--- | -----
name | Name of tide station
lat | Latitude of tide station
lng | Longitude of tide station
source | Tide station owner

#### Example
<!-- tabs:start -->

#### ** Python **
```python
import requests

response = requests.get(
  'https://api.stormglass.io/v2/tide/stations',
  headers={
    'Authorization': 'example-api-key'
  }
)

# Do something with response data.
json_data = response.json()
```

#### ** Curl **
```curl
curl -H "Authorization: example-api-key" "https://api.stormglass.io/v2/tide/stations"
```

#### ** JavaScript **
```javascript
fetch(`https://api.stormglass.io/v2/tide/stations`, {
  headers: {
    'Authorization': 'example-api-key'
  }
}).then((response) => response.json()).then((jsonData) => {
  // Do something with response data.
});
```
<!-- tabs:end -->

#### Example Response

```json
{
    "data": [
      {
        "lat": 61.933776,
        "lng": 5.11331,
        "name": "måløy",
        "source": "sg"
      },
      {
        "lat": 63.113859,
        "lng": 7.734352,
        "name": "kristiansund",
        "source": "sg"
      },
      ...
    ],
    "meta": {
        "cost": 0,
        "dailyQuota": 800,
        "requestCount": 145
    }
}
```

## Stations Area Request

The Tide Stations Area Request will list all available tide stations within a defined geographic area.

```endpoint
GET https://api.stormglass.io/v2/tide/stations/area
```

#### Query Parameters

Parameter | Required | Default | Description
--------- | -------- | ------- | -----------
`box` | * | n/a | Top right and bottom left coordinate of box on format: `lat,lng:lat,lng`

#### Response Format

The response will be sent back in the form of a JSON object. The resource root contains two objects,
*data* and *meta*.

*Meta*

The meta object contains information about the API request. Such as requested latitude and longitude,
your daily quota and how many requests you've made so far today.

*Data*

The data object contains a list of all available stations and each station consists of:

key | value
--- | -----
name | Name of tide station
lat | Latitude of tide station
lng | Longitude of tide station
source | Tide station owner

#### Example

<!-- tabs:start -->

#### ** Python **
```python
import requests

response = requests.get(
  'https://api.stormglass.io/v2/tide/stations/area',
  params={
    'box': '60.1,2:0,-16'
  }
  headers={
    'Authorization': 'example-api-key'
  }
)

# Do something with response data.
json_data = response.json()
```

#### ** Curl **
```curl
curl -H "Authorization: example-api-key" "https://api.stormglass.io/tide/stations"
```

#### ** JavaScript **
```javascript
fetch(`https://api.stormglass.io/v2/tide/stations/area?box=60.1,2:0,-16`, {
  headers: {
    'Authorization': 'example-api-key'
  }
}).then((response) => response.json()).then((jsonData) => {
  // Do something with response data.
});
```
<!-- tabs:end -->


#### Example Response

```json
{
    "data": [
      {
        "lat": 61.933776,
        "lng": 5.11331,
        "name": "måløy",
        "source": "sg"
      },
      {
        "lat": 63.113859,
        "lng": 7.734352,
        "name": "kristiansund",
        "source": "sg"
      },
      ...
    ],
    "meta": {
        "cost": 0,
        "dailyQuota": 800,
        "requestCount": 145
    }
}
```

## References

CC-BY-4.0 Hart-Davis, Michael G; Dettmering, Denise; Seitz, Florian (2022): TICON-3: Tidal Constants based on GESLA-3 sea-level records from globally distributed tide gauges including gauge type information (data) \[dataset\]. PANGAEA, https://doi.org/10.1594/PANGAEA.951610
