function getParameterByName(name, url = window.location.href) {
    name = name.replace(/[[\]]/g, '\$&' );
    var regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)'),
        results = regex.exec(url);
    if (!results) return null;
    if (!results[2]) return '';
    return decodeURIComponent(results[2].replace(/\+/g, ' '));
}

function fetchData(url) {
    fetch(url)
        .then(response => response.json())
        .then(data => {
            document.getElementById('api-result').textContent = data.message;
        });
}

const demoMode = getParameterByName('demo') === 'true';
const apiUrl = demoMode ? '../api/index.php?fake=true' : '../api/index.php';
const dataApiUrl = '../api/data.php';

function populateMinerTable(miners) {
    const tbody = document.getElementById('miner-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    (miners || []).forEach(miner => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${miner.id}</td>
            <td>${miner.model}</td>
            <td><span class="badge ${getStatusBadgeClass(miner.status)}">${miner.status}</span></td>
            <td>${formatMaybeNumberDE(miner.hashrate, 0)}</td>
            <td>${formatMaybeNumberDE(miner.power, 0)}</td>
            <td>${typeof miner.temperature === 'number' ? formatNumberDE(miner.temperature, 0) : (miner.temperature || '')}</td>
            <td>${formatMaybeNumberDE(miner.btcPerKwh, 5)}</td>
            <td>${formatMaybeNumberDE(miner.euroPerKwh, 2)}</td>
        `;
        tbody.appendChild(row);
    });
}

function fetchAndRenderMiners() {
    fetch(dataApiUrl)
        .then(function(response) { return response.json(); })
        .then(function(data) {
            // expose settings early for downstream renderers (graphs, tables)
            if (data && data.settings) {
                window.__plexSettings = data.settings;
            }

            if (data && Array.isArray(data.miners)) {
                populateMinerTable(data.miners);
                renderMinerCounts(data.miners);
            } else if (Array.isArray(data)) {
                // Backward compat: if endpoint returns array directly
                populateMinerTable(data);
                renderMinerCounts(data);
            } else {
                populateMinerTable([]);
            }
            // Render PV and Weather
            if (data && data.pv) {
                renderPV(data.pv);
            }
            if (data && (data.weather || data.calculation)) {
                renderWeatherAndForecast(data.weather, data.calculation);
            }
            // Last update timestamps: show relative age (< 7d) or date; color if >24h (warning) or >48h (danger)
            if (data && data.mtimes) {
                setRelativeTimestamp('ts-pv', data.mtimes.pv);
                setRelativeTimestamp('ts-weather', data.mtimes.weather);
                setRelativeTimestamp('ts-miners', data.mtimes.miners);
                setRelativeTimestamp('ts-system', data.mtimes.settings);
                setRelativeTimestamp('ts-economy', data.mtimes.pv);
                setRelativeTimestamp('ts-forecast', data.mtimes.weather);
            }
            setText('last-update', new Date().toISOString());
        })
        .catch(function() {
            populateMinerTable([]);
        });
}

// Helper functions moved to helper.js

// setText moved to helper.js

function renderPV(pv) {
    if (!pv) return;
    
    // PV Leistung
    var pvPower = typeof pv.pv_leistung_w !== 'undefined' ? pv.pv_leistung_w : 0;
    setText('pv-leistung', formatNumberDE(pvPower, 0));
    
    // Batterie
    var batteryKwh = pv.batterie_stand && typeof pv.batterie_stand.kwh !== 'undefined' ? pv.batterie_stand.kwh : 0;
    var batteryPercent = pv.batterie_stand && typeof pv.batterie_stand.percent !== 'undefined' ? pv.batterie_stand.percent : 0;
    var batteryCapacity = pv.batterie_stand && typeof pv.batterie_stand.capacity_kwh !== 'undefined' ? pv.batterie_stand.capacity_kwh : 49.9;
    setText('batterie-kwh', formatNumberDE(batteryCapacity, 1));
    
    
    // Aktuelle Batteriekapazität anzeigen
    setText('batterie-current', formatNumberDE(batteryKwh, 1));
    
    // Mining-Status prüfen und verfügbare Leistung anzeigen
    var miningMinBattery = (window.__plexSettings && typeof window.__plexSettings.miningMinBatteryKwh !== 'undefined') ? window.__plexSettings.miningMinBatteryKwh : 15.0;
    setText('mining-min-battery', formatNumberDE(miningMinBattery, 1));
    
    var miningPossible = batteryKwh >= miningMinBattery;
    var batteryDifference = batteryKwh - miningMinBattery;
    var hausLast = typeof pv.haus_last_w !== 'undefined' ? pv.haus_last_w : 0;
    var availablePower = pvPower - hausLast;
    
    var miningStatusText = miningPossible ? 'Ja, ' + formatNumberDE(batteryDifference, 1) + ' kWh' : 'Nein';
    var miningStatusClass = miningPossible ? 'text-success' : 'text-danger';
    var miningStatusEl = document.getElementById('mining-status');
    if (miningStatusEl) {
        miningStatusEl.textContent = miningStatusText;
        miningStatusEl.className = 'fw-bold ' + miningStatusClass;
    }
    
    // Hauslast und verfügbare Leistung anzeigen
    setText('haus-last', formatNumberDE(hausLast, 0));
    setText('available-power', formatNumberDE(availablePower, 0));
    if (Array.isArray(pv.miner_betriebszeiten)) {
        setText('miner-betriebszeiten', pv.miner_betriebszeiten.join(', '));
    }
    
    // Draw charts
    try {
        if (typeof d3 !== 'undefined') {
            if (typeof drawBatteryDonut === 'function') {
                drawBatteryDonut(batteryPercent, batteryKwh);
            }
            if (typeof drawSolarPanel === 'function') {
                drawSolarPanel(pvPower);
            }
        }
    } catch (e) { /* no-op */ }
}

function renderWeatherAndForecast(weather, calculation) {
    // Aggregate sunshine hours
    // sumHours and sumRadiation moved to helper.js
    if (Array.isArray(weather)) {
        // Today is first entry, tomorrow is second
        setText('sun-today', formatNumberDE(sumHours(weather, 1), 2));
        setText('sun-tomorrow', formatNumberDE(sumHours(weather.slice(1), 1), 2));
        setText('sun-7d', formatNumberDE(sumHours(weather, 7), 2));
        setText('sun-14d', formatNumberDE(sumHours(weather, 14), 2));
        setText('rad-today', formatNumberDE(sumRadiation(weather, 1), 0));
        setText('rad-tomorrow', formatNumberDE(sumRadiation(weather.slice(1), 1), 0));
        setText('rad-7d', formatNumberDE(sumRadiation(weather, 7), 0));
        setText('rad-14d', formatNumberDE(sumRadiation(weather, 14), 0));

        // PV energy is now calculated server-side in data.php
        var pvKwp = (window.__plexSettings && typeof window.__plexSettings.pv_kwp === 'number') ? window.__plexSettings.pv_kwp : null;
        if (pvKwp) {
            var sumPV = function(arr, n) {
                var s = 0; var count = Math.min(n, arr.length);
                for (var i = 0; i < count; i++) {
                    var v = arr[i] && typeof arr[i].pv_energy_kwh === 'number' ? arr[i].pv_energy_kwh : 0;
                    s += v;
                }
                return Math.round(s * 100) / 100;
            };
            setText('pv-today', formatNumberDE(sumPV(weather, 1), 2));
            setText('pv-tomorrow', formatNumberDE(sumPV(weather.slice(1), 1), 2));
            setText('pv-7d', formatNumberDE(sumPV(weather, 7), 2));
            setText('pv-14d', formatNumberDE(sumPV(weather, 14), 2));
        } else {
            setText('pv-today', '');
            setText('pv-tomorrow', '');
            setText('pv-7d', '');
            setText('pv-14d', '');
        }
    }
    // Render compact weather table
    var tbody = document.getElementById('weather-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (Array.isArray(weather)) {
        var pvKwp = (window.__plexSettings && isFinite(Number(window.__plexSettings.pv_kwp))) ? Number(window.__plexSettings.pv_kwp) : null;
        var pvFactor = (window.__plexSettings && isFinite(Number(window.__plexSettings.pvSystemFactor))) ? Number(window.__plexSettings.pvSystemFactor) : 0.8;
        
        // Update PV-Ertrag header with kWp value
        updatePVHeaderWithKwp(pvKwp);
        
        weather.forEach(function(row) {
            var tr = document.createElement('tr');
            var sun = (typeof row.sunshine_hours !== 'undefined') ? formatNumberDE(row.sunshine_hours, 2) : '';
            var radNum = Number(row.shortwave_radiation_sum_Wh_m2);
            var rad = isFinite(radNum) ? formatNumberDE(radNum, 0) : '';
            var pv = '';
            if (typeof row.pv_energy_kwh === 'number') {
                pv = formatNumberDE(row.pv_energy_kwh, 2);
            }
            tr.innerHTML = '<td>' + (row.date || '') + '</td>' +
                           '<td>' + sun + '</td>' +
                           '<td>' + rad + '</td>' +
                           '<td>' + pv + '</td>';
            tbody.appendChild(tr);
        });
    }

    // Draw D3 line chart for sunshine hours per day
    try {
        if (typeof d3 !== 'undefined' && typeof drawWeatherChart === 'function') {
            drawWeatherChart(weather || []);
        }
    } catch (e) { /* no-op */ }
}

function renderMinerCounts(miners) {
    if (!Array.isArray(miners)) return;
    var total = miners.length;
    var active = miners.filter(function(m) { return m.status === 'Running'; }).length;
    setText('miner-anzahl', active + ' / ' + total);
}

// Initialize the page when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    fetchAndRenderMiners();
    
    // Add event listeners for buttons if they exist
    const apiButton = document.getElementById('api-button');
    if (apiButton) {
        apiButton.addEventListener('click', function() {
            fetchData(apiUrl);
        });
    }
});