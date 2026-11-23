# Satellite Pass

A browser-only planner for ISS, Tiangong, Hubble, Terra, Aqua, and Envisat passes. Select a Canadian preset or enter coordinates, then inspect pass directions, peak altitude above the horizon and likely visible windows. The elevation chart and CSV use the chosen threshold. Calendar days are displayed in the preset time zone, in your browser time zone or in UTC. CSV timestamps are UTC. Observer coordinates stay on the device.

## Build and test

1. Run `python3 scripts/build.py` from the repository root. This produces `dist/` with a trimmed orbital snapshot and a pinned local copy of Satellite.js.
2. Run `node --test tests/orbits.test.mjs` after building.
3. Use `python3 -m http.server 8000 --directory dist` for a local HTTP preview.

Use `--elements /path/to/visual.json` to build from a previously downloaded CelesTrak visual-group response. The output records retrieval time (file modification time for a supplied file) and the separate orbit epoch for each object.

## Data and method

CelesTrak [GP OMM data](https://celestrak.org/NORAD/documentation/gp-data-formats.php) is downloaded during builds from the Visual group. The build reuses data <2 hours old and keeps an older validated local cache if CelesTrak is temporarily unavailable. Follow the [CelesTrak usage policy](https://celestrak.org/usage-policy.php) when scheduling builds. Object labels and selection are supplied by CoolCode. The site includes [Satellite.js](https://github.com/shashwatak/satellite-js) under MIT.

The calculator projects the orbit with SGP4 and evaluates look angles from the selected location. A geometric pass clears the chosen elevation. A likely visible sample requires sunlight on the satellite and the Sun at least six degrees below the observer’s horizon. The illumination model uses the Earth’s approximate umbra and skips penumbra and atmospheric effects. Weather, obstructions and object brightness may prevent sighting. Read the dated orbit epoch as well as the snapshot retrieval date, especially after maneuvers.


<!-- coolcode:guide -->
Calculate passes for your location and chosen minimum elevation, filter to likely visible windows, and download the shown passes as CSV or an ICS calendar. The calendar is a dated export, not a live subscription; refresh orbital elements and recalculate before observing.
<!-- /coolcode:guide -->


## Added browser workflow

Calculate passes for your location and chosen minimum elevation, filter to likely visible windows, and download the shown passes as CSV or an ICS calendar. The calendar is a dated export, not a live subscription; refresh orbital elements and recalculate before observing.
