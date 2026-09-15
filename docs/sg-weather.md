# Weather

The stormglass API gives you direct access to the world’s most accurate weather forecasts and you can get data from multiple datasets and several weather parameters in every request. 

Use the weather endpoint to get weather forecast data for a single coordinate anywhere in the world. To receive marine weather data - simply query a coordinate located at sea.

Forecast records are accessible for a 14-day look-back period. However, we recommend the Historical Endpoint for retrieval of all past weather data.

stormglass AI is an intelligent global grid that automatically chooses the best weather source depending on performance. To use stormglass AI - specify the source “sg” in your API queries.



## Point Request

Point Requests are used to retrieve data for a single coordinate.

```endpoint
GET https://api.stormglass.io/v2/weather/point
```

#### Available Query Parameters

Parameter | Required | Default | Description
--------- | -------- | ------- | -----------
`lat` | ✔ | n/a | Latitude of the desired coordinate
`lng` | ✔ | n/a | Longitude of the desired coordinate
`params` | ✔ | n/a | Comma separated list of the parameters you want to retrieve, Eg `swellHeight,waveHeight`
`start` | | Today at 00.00 | Timestamp in UTC for first forecast hour - UNIX format or URL encoded ISO format.
`end` | | all | Timestamp in UTC for last forecast hour - UNIX format or URL encoded ISO format.
`source` | | all | Specify a single source or a comma separated list of sources. Eg `noaa` or `dwd,noaa`




<h4 id="point-response">Response Format</h4>

The response will be sent back in the form of a JSON object. The resource root contains two objects -
*data* and *meta*.

*Meta*

The meta object contains information about the API request. Such as requested latitude and longitude,
your daily quota and how many requests you have made so far today.

*Data*

The data object contains the actual weather data on an hourly basis. One item in the data array can contain:

key | value
--- | -----
`time` | Timestamp in UTC
`airTemperature` | Air temperature in degrees celsius
`airTemperature80m` | Air temperature at 80m above ground in degrees celsius
`airTemperature100m` | Air temperature at 100m above ground in degrees celsius
`airTemperature1000hpa` | Air temperature at 1000hpa in degrees celsius
`airTemperature800hpa` | Air temperature at 800hpa in degrees celsius
`airTemperature500hpa` | Air temperature at 500hpa in degrees celsius
`airTemperature200hpa` | Air temperature at 200hpa in degrees celsius
`pressure` | Air pressure in hPa
`cloudCover` | Total cloud coverage in percent
`currentDirection` | Direction of current. 0° indicates current coming from north
`currentSpeed` | Speed of current in meters per second
`dewPointTemperature` | Dew point temperature at 2m above ground in degrees Celsius.
`gust` | Wind gust in meters per second
`humidity` | Relative humidity in percent
`iceCover` | Ice cover. Unitless factor between 0.0 and 1.0.
`precipitation` | Mean precipitation in kg/m²/h = mm/h
`rain` | Mean rain-type precipitation in kg/m²/h = mm/h
`snow` | Mean snow-type precipitation in kg/m²/h = mm/h
`graupel` | Mean graupel-type precipitation in kg/m²/h = mm/h
`snowAlbedo` | Reflectivity of snow cover. Unitless factor between 0.0 and 1.0.
`snowDepth` | Depth of snow in meters
`seaIceThickness` | Thickness of sea ice in meters.
`seaLevel` | Sea level relative to MSL
`swellDirection` | Direction of swell waves. 0° indicates swell coming from north
`swellHeight` | Height of swell waves in meters
`swellPeriod` | Period of swell waves in seconds
`secondarySwellPeriod` | Direction of secondary swell waves. 0° indicates swell coming from north
`secondarySwellDirection` | Height of secondary swell waves in meters
`secondarySwellHeight` | Period of secondary swell waves in seconds
`visibility` | Horizontal visibility in km
`waterTemperature` | Water temperature in degrees celsius
`surfaceTemperature` | Surface temperature in degrees celsius
`waveDirection` | Direction of combined wind and swell waves. 0° indicates waves coming from north
`waveHeight` | Significant Height of combined wind and swell waves in meters
`wavePeriod` | Period of combined wind and swell waves in seconds
`windWaveDirection` | Direction of wind waves. 0° indicates waves coming from north
`windWaveHeight` | Height of wind waves in meters
`windWavePeriod` | Period of wind waves in seconds
`windDirection` | Direction of wind at 10m above ground. 0° indicates wind coming from north
`windDirection20m` | Direction of wind at 20m above ground. 0° indicates wind coming from north
`windDirection30m` | Direction of wind at 30m above ground. 0° indicates wind coming from north
`windDirection40m` | Direction of wind at 40m above ground. 0° indicates wind coming from north
`windDirection50m` | Direction of wind at 50m above ground. 0° indicates wind coming from north
`windDirection80m` | Direction of wind at 80m above ground. 0° indicates wind coming from north
`windDirection100m` | Direction of wind at 100m above ground. 0° indicates wind coming from north
`windDirection1000hpa` | Direction of wind at 1000hpa. 0° indicates wind coming from north
`windDirection800hpa` | Direction of wind at 800hpa. 0° indicates wind coming from north
`windDirection500hpa` | Direction of wind at 500hpa. 0° indicates wind coming from north
`windDirection200hpa` | Direction of wind at 200hpa. 0° indicates wind coming from north
`windSpeed` | Speed of wind at 10m above ground in meters per second.
`windSpeed20m` | Speed of wind at 20m above ground in meters per second.
`windSpeed30m` | Speed of wind at 30m above ground in meters per second.
`windSpeed40m` | Speed of wind at 40m above ground in meters per second.
`windSpeed50m` | Speed of wind at 50m above ground in meters per second.
`windSpeed80m` | Speed of wind at 80m above ground in meters per second.
`windSpeed100m` | Speed of wind at 100m above ground in meters per second.
`windSpeed1000hpa` | Speed of wind at 1000hpa in meters per second.
`windSpeed800hpa` | Speed of wind at 800hpa in meters per second.
`windSpeed500hpa` | Speed of wind at 500hpa in meters per second.
`windSpeed200hpa` | Speed of wind at 200hpa in meters per second.

Each parameter (eg. `swellHeight`) is an object that contains a `key` and `value` for each available source, i.e. `{ sg: 10.3 }`.

#### Example
<!-- tabs:start -->

#### ** Python **
```python
import arrow
import requests

# Get first hour of today
start = arrow.now().floor('day')

# Get last hour of today
end = arrow.now().ceil('day')

response = requests.get(
  'https://api.stormglass.io/v2/weather/point',
  params={
    'lat': 58.7984,
    'lng': 17.8081,
    'params': ','.join(['waveHeight', 'airTemperature']),
    'start': start.to('UTC').timestamp(),  # Convert to UTC timestamp
    'end': end.to('UTC').timestamp()  # Convert to UTC timestamp
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
curl -H "Authorization: example-api-key" "https://api.stormglass.io/v2/weather/point?lat=58.7984&lng=17.8081&params=waveHeight,airTemperature"
```

#### ** JavaScript **
```javascript
const lat = 58.7984;
const lng = 17.8081;
const params = 'waveHeight,airTemperature';

fetch(`https://api.stormglass.io/v2/weather/point?lat=${lat}&lng=${lng}&params=${params}`, {
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
  "hours": [
    {
      "time": "2018-01-19T17:00:00+00:00",
      "airTemperature": {
        "smhi": "-2.6",
      },
      "waveHeight": {
        "noaa": 2.1,
        "meteo": 2.3,
      },
      ...
    }
  ],
  "meta": {
    "dailyQuota": 50,
    "lat": 58.7984,
    "lng": 17.8081,
    "requestCount": 1
  }
}
```
