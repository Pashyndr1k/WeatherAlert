# Date and Time

Dates and times in the Storm Glass API are expressed in UTC timezone.

When sending a request to the API, timestamps in the following formats are accepted:

Name | Example
-- | --
UNIX Timestamp | `1542967200`
URL Encoded ISO Formatted Timestamp | `2018-11-23T10%3A00%3A00%2B00%3A00`

The API also accepts timestamps being specified as prefixes of URL-encoded timestamps formatted using the ISO format. This allows a specific date being specified as `YYYY-MM-DD` and a specific date and hour being specified as `YYYY-MM-DDTHH` and so forth.

Please note that all omitted components will default to zero and that the time zone component is ignored.

Date and time returned from the API will be expressed in ISO format:

Name | Example
-- | --
ISO Formatted Timestamp | `2018-11-23T10:00:00+00:00`

## Local time

It is often desirable for weather apps and alike to present data expressed using the local time zone of its users. Since all timestamps sent to and recieved from the Storm Glass API are expressed using the UTC time zone, timestamps in requests and responses will have to be adjusted by the app. The two examples below illustate how this is done when local time is behind of and ahead of UTC, respectively.

We strongly recommend that you utilize a thoroughly tested datetime library when manipulating timestamps since the UTC date changes for certain hours of the local date. Adjusting timestamps manually is error-prone and should ideally only be done during testing.

### Behind UTC

Seattle, USA is behind of UTC by 8 hours when using the Pacific Standard Time or `PST` time zone. When using the Pacific Daylight Time or `PDT` time zone, Seattle is behind of UTC by 7 hours.

Weather data may be requested for the local date `2018-11-23` by adjusting request timestamps forwards by the current time difference compared to UTC. This means specifying the `start` and `end` request parameters as `2018-11-23T08:00:00` and `2018-11-24T08:00:00` for the `PST` time zone. Timestamps in the response data are to be adjusted backwards to become local timestamps.

### Ahead of UTC

Sydney, Australia is ahead of UTC by 10 hours when using the Australian Eastern Standard Time or `AEST` time zone. When using the Australian Eastern Daylight Time or `AEDT` time zone, Australia is ahead of UTC by 11 hours.

Weather data may be requested for the local date `2018-11-23` by adjusting request timestamps backwards by the current time difference compared to UTC. This means specifying the `start` and `end` request parameters as `2018-11-22T13:00:00` and `2018-11-23T13:00:00` for the `AEDT` time zone. Timestamps in the response data are to be adjusted forwards to become local timestamps.
