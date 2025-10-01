# Plex Mining


![Plex Mining Logo](web/res/plexmining.png)


Plex Mining is a lightweight control system for Bitcoin miners.  
It allows both manual and automated management of multiple devices, optimized for solar-powered setups.

[PowerPoint Presentation](misc/bitcoinmining.pptx)
[Demo](https://plexmining.feuerware.com/)


[Github Page](https://alexanderthurn.github.io/plexmining/web/html/demo.html)

## Features

- **Multi-miner control**  
  Start, stop, and restart any number of miners individually or in groups.

- **Manual mode**  
  Directly operate miners via a simple API.

- **Auto mode (solar-optimized)**  
  - Uses power only when your PV system provides enough energy  
  - Avoids expensive grid electricity  
  - Integrates battery state and live power data  
  - Considers weather forecasts to schedule operation

- **API-driven**  
  Access miner status and control endpoints programmatically.

- **Extensible design**  
  Easy to adapt to different miner models and environments.


## Development 

```
docker run --rm -p 8080:8080 -v "$PWD/web":/var/www/html php:8.3-cli-alpine php -S 0.0.0.0:8080 -t /var/www/html
```

open http://127.0.0.1:8080/index.html


## Production

```
cd caddy
docker-compose up
```

open http://127.0.0.1:9090/index.html


Restart after changes

```
docker compose down && docker compose up -d
```

## Miner Level Configuration

Miner settings now support any number of power levels per device. Each level defines:

- `label`: Name displayed in the UI (e.g. `Eco`, `Full`)
- `power_kw`: Target miner power draw when the level is active
- `battery_min_kwh`: Required battery energy before the level can start
- `pv_forecast_hours`: Forecast horizon to inspect (integer hours)
- `pv_forecast_min_kwh`: Minimum PV production expected within that horizon

Example snippet inside `web/data/config/settings.json`:

```
{
  "id": "1",
  "model": "S23",
  "hashrate": 300,
  "power_kw": 3.5,
  "ip": "192.168.1.101",
  "levels": [
    {
      "label": "Eco",
      "power_kw": 2.1,
      "battery_min_kwh": 10,
      "pv_forecast_hours": 0,
      "pv_forecast_min_kwh": 0
    },
    {
      "label": "Full",
      "power_kw": 3.5,
      "battery_min_kwh": 20,
      "pv_forecast_hours": 1,
      "pv_forecast_min_kwh": 0.5
    }
  ]
}
```

The settings editor (`web/settings.html`) validates JSON and the backend normalizes values (sorting by battery requirement, ensuring numeric types). Legacy `minBatteryFullKwh` / `minBatteryReducedKwh` fields are still accepted and converted into two default levels.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
