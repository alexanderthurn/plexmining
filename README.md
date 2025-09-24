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

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
