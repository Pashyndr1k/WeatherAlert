# Authentication

You need an API key to access the stormglass API. You can register for a free API key [here](https://dashboard.stormglass.io/register).

The API key is expected to be included in all API requests to the server in a header that looks like this:

`Authorization: example-api-key`

**Note:** *You must replace <code>example-api-key</code> with your personal API key.*

**Note:** When you have signed up your API key is available in the [dashboard](https://dashboard.stormglass.io).

### Example

<!-- tabs:start -->
#### ** Python **
```python
import requests

response = requests.get(
  'https://api.stormglass.io/v2/weather/point',
  params={
    'lat': 58.7984,
    'lng': 17.8081,
    'params': 'windSpeed',
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
curl -H "Authorization: example-api-key" "https://api.stormglass.io/v2/weather/point?lat=58.7984&lng=17.8081&params=windSpeed"
```

#### ** JavaScript **
```javascript
const lat = 58.7984;
const lng = 17.8081;
const params = 'windSpeed';

fetch(`https://api.stormglass.io/v2/weather/point?lat=${lat}&lng=${lng}&params=${params}`, {
  headers: {
    'Authorization': 'example-api-key'
  }
}).then((response) => response.json()).then((jsonData) => {
  // Do something with response data.
});
```
<!-- tabs:end -->
