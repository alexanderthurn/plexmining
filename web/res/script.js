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
    if (typeof pv.pv_leistung_w !== 'undefined') setText('pv-leistung', formatNumberDE(pv.pv_leistung_w, 0));
    if (pv.batterie_stand && typeof pv.batterie_stand.kwh !== 'undefined' && typeof pv.batterie_stand.percent !== 'undefined') {
        setText('batterie-stand', formatNumberDE(pv.batterie_stand.kwh, 2) + ' kWh (' + formatNumberDE(pv.batterie_stand.percent, 0) + '%)');
    }
    if (typeof pv.netz_leistung_w !== 'undefined') setText('netz-leistung', formatNumberDE(pv.netz_leistung_w, 0));
    if (typeof pv.haus_last_w !== 'undefined') setText('haus-last', formatNumberDE(pv.haus_last_w, 0));
    if (Array.isArray(pv.miner_betriebszeiten)) {
        setText('miner-betriebszeiten', pv.miner_betriebszeiten.join(', '));
    }
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

        var pvKwp = (window.__plexSettings && typeof window.__plexSettings.pv_kwp === 'number') ? window.__plexSettings.pv_kwp : null;
        var pvFactor = (window.__plexSettings && isFinite(Number(window.__plexSettings.pvSystemFactor))) ? Number(window.__plexSettings.pvSystemFactor) : 0.8;
        if (pvKwp) {
            var pv1 = (sumRadiation(weather, 1) / 1000) * pvKwp * pvFactor;
            var pvT = (sumRadiation(weather.slice(1), 1) / 1000) * pvKwp * pvFactor;
            var pv7 = (sumRadiation(weather, 7) / 1000) * pvKwp * pvFactor;
            var pv14 = (sumRadiation(weather, 14) / 1000) * pvKwp * pvFactor;
            setText('pv-today', formatNumberDE(pv1, 2));
            setText('pv-tomorrow', formatNumberDE(pvT, 2));
            setText('pv-7d', formatNumberDE(pv7, 2));
            setText('pv-14d', formatNumberDE(pv14, 2));
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
            if (pvKwp && isFinite(radNum)) {
                var pvVal = calculatePVEnergy(radNum, pvKwp, pvFactor);
                pv = pvVal ? formatNumberDE(pvVal, 2) : '';
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