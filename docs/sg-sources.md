# Data Sources

Access the world's most reliable weather intelligence through the stormglass API. Each data source maintains a unique set of attributes, and data is refreshed at independent intervals.


## Available Data Sources
Below you can find tables overviewing the available data sources and what parameters to expect from each source.

<!-- tabs:start -->

#### ** SG **

### SG - Storm Glass AI
Storm Glass AI is an intelligent global grid that automatically chooses the best weather data source depending on location.

Dataset | Storm Glass AI
---- | -----
Abbreviation | sg
Spatial resolution | From 0.05°x0.05° (depending on data source)
Update Frequency | Every 4 hours (depending on data source)
Forecast Span  | 240 hours - up to 10 days (depending on data source)
Area | Global

#### ** ECMWF **

### ECMWF
European Centre for Medium-Range Weather Forecasts

Dataset | High-Resolution Forecast (oper)
---- | -----
Abbreviation | ecmwf
Spatial resolution | 0.25°x0.25°
Update Frequency | Daily
Forecast Span | 144 hours - up to 6 days
Area | Global

Dataset | Wave Model (wave)
---- | -----
Abbreviation | ecmwf
Spatial resolution | 0.25°x0.25°
Update Frequency | Daily
Forecast Span | 144 hours - up to 6 days
Area | Global

Dataset             | ERA5
------------------- | ----------------------------------------------------------
Selectors           | ecmwf, ecmwf:era5
Area                | Global
Spatial resolution  | 0.25°x0.25°
Temporal resolution | 1h
Update frequency    | Daily
Data from           | 2014-01-01
Data until          | Today's date - 7 days

Dataset             | ERA5 Wave Model
------------------- | ----------------------------------------------------------
Selectors           | ecmwf, ecmwf:era5
Area                | Global
Spatial resolution  | 0.50°x0.50°
Temporal resolution | 1h
Update frequency    | Daily
Data from           | 2014-01-01
Data until          | Today's date - 7 days

#### ** ECMWF-AIFS **

### ECMWF-AIFS
ECMWF’s AI weather model, AIFS, provides outputs at 00:00, 06:00, 12:00, and 18:00 UTC respectively. Hourly data provided between the model outputs is linearly interpolated.

Dataset | AI Forceast System (aifs)
---- | -----
Abbreviation | ecmwf:aifs
Spatial resolution | 0.25°x0.25°
Update Frequency | Daily
Forecast Span | 360 hours - up to 15 days
Area | Global



#### ** NOAA **

### NOAA
The National Oceanic and Atmospheric Administration

Dataset | GFS-Wave
---- | -----
Abbreviation | noaa
Description | The National Oceanic and Atmospheric Administration wave model forecast
Spatial resolution | 0.25°x0.25°
Update Frequency | Every 6 hours
Forecast Span  | 183 hours - up to 7,5 days
Area | Global - Except for smaller seas such as the Baltic Sea and the Mediterranean Sea

Dataset | GFS
---- | -----
Description |  The National Oceanic and Atmospheric Administration global forecast system
Abbreviation | noaa
Spatial resolution | 0.5°x0.5°
Update Frequency | Daily
Forecast Span  | 240 hours - up to 10 days
Area | Global

Dataset | RTOFS
---- | -----
Abbreviation | noaa
Description | The National Oceanic and Atmospheric Administration Real-Time Oceam Forecast System
Spatial resolution | 0.25°x0.25°
Update Frequency | Daily
Forecast Span  | 72 hours - up to 3 days
Area | Global

#### ** NOAA-AIGFS **

### NOAA-AIGFS
NOAA's AI weather model, AIGFS, provides outputs at 00:00, 06:00, 12:00, and 18:00 UTC respectively. Hourly data provided between the model outputs is linearly interpolated.

Dataset | AI Global Forceast System (aigfs)
---- | -----
Abbreviation | noaa:aigfs
Spatial resolution | 0.25°x0.25°
Update Frequency | Daily
Forecast Span | 360 hours - up to 15 days
Area | Global

#### ** Météo-France **

### Météo-France (meteo)
French National Meteorological service

Dataset | MFWAM
---- | -----
Abbreviation | meteo
Spatial resolution | 0.5°x0.5°
Update Frequency | Daily
Forecast Span  | 120 hours - up to 5 days
Area | Global



#### ** DWD **

### DWD
Germany's National Meteorological Service, the Deutscher Wetterdienst

Dataset | GWAM
---- | -----
Abbreviation | dwd
Spatial resolution | 0.25°x0.25°
Update Frequency | Every 24 hours
Forecast Span  | 144 hours - up to 6 days
Area | Global




#### ** UK MetOffice **

### UK MetOffice (meto)
United Kingdom's national weather service, The UK MetOffice

Dataset | Global
---- | -----
Description | Global currents, water temperature, sea level and salinity
Abbreviation | meto
Spatial resolution | 0.25°x0.25°
Update Frequency | Daily
Forecast Span  | 240 hours - up to 10 days
Area | Global

Dataset | North West Shelf
---- | -----
Description |  High resolution data for currents and waves in North West Shelf
Abbreviation | meto
Spatial resolution | 0.017°x0.017°
Update Frequency | Daily
Forecast Span  | 240 hours - up to 10 days
Area | North West Shelf


#### ** MET NO **

### MET NO / Meteorologisk Institutt (yr)
Norwegian Meteorological Institute and NRK

Dataset          | Arome Arctic
---------------- | -----
Abbreviation     | metno
Spatial resolution       | 0.10°x0.10°
Update Frequency | Every 4 hours
Forecast Span    | 66 hours
Area             | North of 63°N

Dataset          | Nordic
---------------- | -----
Abbreviation     | metno
Spatial resolution       | 0.10°x0.10°
Update Frequency | Every 4 hours
Forecast Span    | 64 hours
Area             | Nordics

Dataset          | Nordic Seas
---------------- | -----
Abbreviation     | metno
Spatial resolution      | 0.10°x0.10°
Update Frequency | Daily
Forecast Span    | 120 hours - up to 5 days
Area             | North of 41.12°N

Dataset          | Topaz5 Arctic
---------------- | -----
Abbreviation     | metno
Spatial resolution       | 0.10°x0.10°
Update Frequency | Daily
Forecast Span    | 240 hours - up to 10 days
Area             | North of 63°N





#### ** FCOO **

### FCOO
Danish Defence Centre for Operational Oceanography

Dataset | Wave Watch 3
---- | -----
Description | Wave period, wave height and wave direction
Abbreviation | fcoo
Spatial resolution | 0.5°x0.5°
Update Frequency | Every 12 hours
Forecast Span  | 48 hours - up to 2 days
Area | Baltic Sea including Gulf of Botnia and Gulf of Finland


#### ** FMI **

### FMI
The Finnish Meteorological Institution

Dataset | FMI
---- | -----
Abbreviation | fmi
Spatial resolution | 0.25°x0.25°
Update Frequency | Every 4 hours
Forecast Span  | 55 hours - up to 2,5 days
Area | Baltic Sea including Gulf of Botnia and Gulf of Finland


#### ** CMEMS **

### CMEMS
Copernicus Marine Environment Monitoring Service

Dataset             | Global Ocean Physics Analysis and Forecast
------------------- | ----------------------------------------------------------
Selectors           | cmems, cmems:gopaf
Area                | Global
Spatial resolution  | 0.083333°x0.083333°
Temporal resolution | 1h
Update frequency    | Daily
Data from           | 2022-06-01
Data until          | Today's date - 15 days


<!-- tabs:end -->


<aside class="notice">
We are continuously adding more data sources and parameters to the stormglass API. Please contact <a href="mailto:support@stormglass.io">support@stormglass.io</a> if you have specific requests.
</aside>

## Parameters per Source
Below you will find a table showing which parameters are available for each data source.


### Weather Parameters
Click <a href="/#/weather?id=point-request">here</a> for information about how to interpret the weather parameters


| Parameter | sg | ecmwf | ecmwf:<br>aifs | noaa | noaa:<br>aigfs | meteo | dwd | meto | metno | fcoo | fmi |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| airTemperature | ✔ | ✔ | ✔ | ✔ | ✔ | | | | ✔ | | |
| pressure | ✔ | ✔ | ✔ | ✔ | ✔ | | | | ✔ | | |
| cloudCover | ✔ | | | ✔ | | | | | ✔ | | |
| currentDirection | ✔ | ✔ | | ✔ | | | | ✔ | ✔ | | |
| currentSpeed | ✔ | ✔ | | ✔ | | | | ✔ | ✔ | | |
| dewPointTemperature | ✔ | ✔ | ✔ | ✔ | | | | | | | |
| gust | ✔ | ✔ | | ✔ | | | | | ✔ | | |
| humidity | ✔ | | | ✔ | | | | | ✔ | | |
| iceCover | ✔ | | | ✔ | | | | | | | |
| precipitation | ✔ | ✔ | ✔ | ✔ | ✔ | | | | ✔ | | |
| rain | ✔ | | | | | | | | ✔ | | |
| snow | ✔ | ✔ | ✔ | | | | | | ✔ | | |
| graupel | ✔ | | | | | | | | ✔ | | |
| seaLevel | ✔ | | | | | | | ✔ | | | |
| snowAlbedo | ✔ | ✔ | | | | | | | | | |
| snowDepth | ✔ | | | ✔ | | | | | | | |
| seaIceThickness | ✔ | ✔ | | ✔ | | | | | ✔ | | |
| swellDirection | ✔ | | | ✔ | | ✔ | ✔ | ✔ | ✔ | | |
| swellHeight | ✔ | | | ✔ | | ✔ | ✔ | ✔ | ✔ | | |
| swellPeriod | ✔ | | | ✔ | | ✔ | ✔ | ✔ | ✔ | | |
| secondarySwellDirection | ✔ | | | ✔ | | | | | | | |
| secondarySwellHeight | ✔ | | | ✔ | | | | | | | |
| secondarySwellPeriod | ✔ | | | ✔ | | | | | | | |
| visiblity | ✔ | | | ✔ | | | | | ✔ | | |
| waterTemperature | ✔ | | | ✔ | | | | ✔ | ✔ | | |
| surfaceTemperature | ✔ | | | ✔ | | | | | | | |
| waveDirection | ✔ | ✔ | | ✔ | | ✔ | | ✔ | ✔ | ✔ | ✔ |
| waveHeight | ✔ | ✔ | | ✔ | | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| wavePeriod | ✔ | ✔ | | ✔ | | ✔ | | ✔ | | ✔ | ✔ |
| windWaveDirection | ✔ | | | ✔ | ✔ | ✔
| windWaveHeight | ✔ | | | ✔ | | ✔ | ✔ | ✔ | | | | |
| windWavePeriod | ✔ | | | ✔ | | ✔ | ✔ | ✔ | | | | |
| windDirection | ✔ | ✔ | ✔ | ✔ | ✔ | | ✔ | ✔ | ✔ | ✔ | | ✔ |
| windSpeed | ✔ | ✔ | ✔ | ✔ | ✔ | | ✔ | ✔ | ✔ | ✔ | | ✔ |

### Bio Parameters
Click <a href="/#/bio?id=point-request">here</a> for information about how to interpret the bio parameters.

Parameter             | mercator | meto | noaa | ecmwf | ecmwf:aifs | sg
--------------------- | -------- | ---- | ---- | ----- | ---------- | --
chlorophyll           | ✔        |      |      |       |            | ✔
iron                  | ✔        |      |      |       |            | ✔
nitrate               | ✔        |      |      |       |            | ✔
phyto                 | ✔        |      |      |       |            | ✔
oxygen                | ✔        |      |      |       |            | ✔
ph                    | ✔        |      |      |       |            | ✔
phytoplankton         | ✔        |      |      |       |            | ✔
phosphate             | ✔        |      |      |       |            | ✔
silicate              | ✔        |      |      |       |            | ✔
salinity              |          | ✔    |      |       |            | ✔
soilMoisture          |          |      | ✔    | ✔     | ✔          | ✔
soilMoisture-10cm     |          |      | ✔    | ✔     | ✔          | ✔
soilMoisture-40cm     |          |      | ✔    | ✔     |            | ✔
soilMoisture-100cm    |          |      | ✔    | ✔     |            | ✔
soilTemperature       |          |      | ✔    | ✔     | ✔          | ✔
soilTemperature-10cm  |          |      | ✔    | ✔     | ✔          | ✔
soilTemperature-40cm  |          |      | ✔    | ✔     |            | ✔
soilTemperature-100cm |          |      | ✔    | ✔     |            | ✔


### Solar Parameters
Click <a href="/#/solar?id=point-request">here</a> for information about how to interpret the solar parameters.


Parameter                                 | ecmwf | ecmwf:aifs | noaa | sg
----------------------------------------- | ----- | ---------- | ---- | --
uvIndex                                   |       |            | ✔    | ✔
solarDownwardRadiationFlux                | ✔     |            |      | ✔
surfaceNetShortwaveRadiationDownwardsFlux | ✔     | ✔          |      | ✔


### Historical Parameters
Click <a href="/#/historical?id=point-request">here</a> for information about how to interpret the weather parameters.

Parameter                                 | cmems | cmems:gopaf | ecmwf | ecmwf:era5 | sg
----------------------------------------- | ----- | ----------- | ----- | ---------- | --
airTemperature                            |       |             | ✔     | ✔          | ✔
bathymetry                                |       |             | ✔     | ✔          | ✔
cloudCover                                |       |             | ✔     | ✔          | ✔
currentDirection                          | ✔     | ✔           |       |            | ✔
currentSpeed                              | ✔     | ✔           |       |            | ✔
dewPointTemperature                       |       |             | ✔     | ✔          | ✔
gust                                      |       |             | ✔     | ✔          | ✔
iceCover                                  |       |             | ✔     | ✔          | ✔
precipitation                             |       |             | ✔     | ✔          | ✔
pressure                                  |       |             | ✔     | ✔          | ✔
rain                                      |       |             | ✔     | ✔          | ✔
secondarySwellDirection                   |       |             | ✔     | ✔          | ✔
secondarySwellHeight                      |       |             | ✔     | ✔          | ✔
secondarySwellPeriod                      |       |             | ✔     | ✔          | ✔
snow                                      |       |             | ✔     | ✔          | ✔
snowAlbedo                                |       |             | ✔     | ✔          | ✔
soilMoisture                              |       |             | ✔     | ✔          | ✔
soilMoisture10cm                          |       |             | ✔     | ✔          | ✔
soilMoisture40cm                          |       |             | ✔     | ✔          | ✔
soilMoisture100cm                         |       |             | ✔     | ✔          | ✔
soilTemperature                           |       |             | ✔     | ✔          | ✔
soilTemperature10cm                       |       |             | ✔     | ✔          | ✔
soilTemperature40cm                       |       |             | ✔     | ✔          | ✔
soilTemperature100cm                      |       |             | ✔     | ✔          | ✔
solarDownwardRadiationFlux                |       |             | ✔     | ✔          | ✔
surfaceNetShortwaveRadiationDownwardsFlux |       |             | ✔     | ✔          | ✔
swellDirection                            |       |             | ✔     | ✔          | ✔
swellHeight                               |       |             | ✔     | ✔          | ✔
swellPeriod                               |       |             | ✔     | ✔          | ✔
waterTemperature                          | ✔     | ✔           |       |            | ✔
waveDirection                             |       |             | ✔     | ✔          | ✔
waveHeight                                |       |             | ✔     | ✔          | ✔
wavePeriod                                |       |             | ✔     | ✔          | ✔
windDirection                             |       |             | ✔     | ✔          | ✔
windDirection100m                         |       |             | ✔     | ✔          | ✔
windDirection200hpa                       |       |             | ✔     | ✔          | ✔
windDirection500hpa                       |       |             | ✔     | ✔          | ✔
windDirection800hpa                       |       |             | ✔     | ✔          | ✔
windDirection1000hpa                      |       |             | ✔     | ✔          | ✔
windSpeed                                 |       |             | ✔     | ✔          | ✔
windSpeed100m                             |       |             | ✔     | ✔          | ✔
windSpeed200hpa                           |       |             | ✔     | ✔          | ✔
windSpeed500hpa                           |       |             | ✔     | ✔          | ✔
windSpeed800hpa                           |       |             | ✔     | ✔          | ✔
windSpeed1000hpa                          |       |             | ✔     | ✔          | ✔
windWaveDirection                         |       |             | ✔     | ✔          | ✔
windWaveHeight                            |       |             | ✔     | ✔          | ✔
windWavePeriod                            |       |             | ✔     | ✔          | ✔
