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
            var setRelativeTs = function(elId, tsSeconds) {
                var el = document.getElementById(elId);
                if (!el) return;
                el.classList.remove('text-muted', 'text-warning', 'text-danger');
                if (!tsSeconds) { el.textContent = ''; return; }
                var now = Date.now();
                var tsMs = tsSeconds * 1000;
                var diffMs = Math.max(0, now - tsMs);
                var diffSec = Math.floor(diffMs / 1000);
                var diffMin = Math.floor(diffSec / 60);
                var diffHour = Math.floor(diffMin / 60);
                var diffDay = Math.floor(diffHour / 24);
                var text = '';
                if (diffDay < 7) {
                    if (diffSec < 60) {
                        text = 'vor ' + diffSec + ' Sekunden';
                    } else if (diffMin < 60) {
                        text = 'vor ' + diffMin + ' Minuten';
                    } else if (diffHour < 24) {
                        text = 'vor ' + diffHour + ' Stunden';
                    } else {
                        text = 'vor ' + diffDay + ' Tagen';
                    }
                } else {
                    try {
                        text = new Date(tsMs).toLocaleString('de-DE', { hour12: false });
                    } catch (e) {
                        text = '';
                    }
                }
                el.textContent = text;
                if (diffHour >= 48) {
                    el.classList.add('text-danger');
                } else if (diffHour >= 24) {
                    el.classList.add('text-warning');
                } else {
                    el.classList.add('text-muted');
                }
            };
            if (data && data.mtimes) {
                setRelativeTs('ts-pv', data.mtimes.pv);
                setRelativeTs('ts-weather', data.mtimes.weather);
                setRelativeTs('ts-miners', data.mtimes.miners);
                setRelativeTs('ts-system', data.mtimes.settings);
                setRelativeTs('ts-economy', data.mtimes.pv);
                setRelativeTs('ts-forecast', data.mtimes.weather);
            }
            setText('last-update', new Date().toISOString());
        })
        .catch(function() {
            populateMinerTable([]);
        });
}

function getStatusBadgeClass(status) {
    switch(status) {
        case 'Running': return 'bg-success';
        case 'Error': return 'bg-danger';
        case 'Idle': return 'bg-secondary';
        default: return 'bg-light text-dark';
    }
}

function formatNumberDE(value, fractionDigits) {
    if (value === null || value === undefined || !isFinite(Number(value))) return '';
    try {
        return new Intl.NumberFormat('de-DE', {
            minimumFractionDigits: fractionDigits,
            maximumFractionDigits: fractionDigits
        }).format(Number(value));
    } catch (e) {
        return String(value);
    }
}

function formatMaybeNumberDE(value, fractionDigits) {
    if (value === null || value === undefined || !isFinite(Number(value))) return '';
    return formatNumberDE(value, fractionDigits);
}

function setText(id, value) {
    var el = document.getElementById(id);
    if (el) {
        el.textContent = value;
    }
}

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
    var sumHours = function(arr, n) {
        var s = 0; var count = Math.min(n, arr.length);
        for (var i = 0; i < count; i++) {
            var v = arr[i] && typeof arr[i].sunshine_hours === 'number' ? arr[i].sunshine_hours : 0;
            s += v;
        }
        return Math.round(s * 100) / 100;
    };
    var sumRad = function(arr, n) {
        var s = 0; var count = Math.min(n, arr.length);
        for (var i = 0; i < count; i++) {
            var raw = arr[i] ? arr[i].shortwave_radiation_sum_Wh_m2 : null;
            var v = Number(raw);
            if (isFinite(v)) s += v;
        }
        return Math.round(s);
    };
    if (Array.isArray(weather)) {
        // Today is first entry, tomorrow is second
        setText('sun-today', formatNumberDE(sumHours(weather, 1), 2));
        setText('sun-tomorrow', formatNumberDE(sumHours(weather.slice(1), 1), 2));
        setText('sun-7d', formatNumberDE(sumHours(weather, 7), 2));
        setText('sun-14d', formatNumberDE(sumHours(weather, 14), 2));
        setText('rad-today', formatNumberDE(sumRad(weather, 1), 0));
        setText('rad-tomorrow', formatNumberDE(sumRad(weather.slice(1), 1), 0));
        setText('rad-7d', formatNumberDE(sumRad(weather, 7), 0));
        setText('rad-14d', formatNumberDE(sumRad(weather, 14), 0));

        var pvKwp = (window.__plexSettings && typeof window.__plexSettings.pv_kwp === 'number') ? window.__plexSettings.pv_kwp : null;
        if (pvKwp) {
            var pv1 = (sumRad(weather, 1) / 1000) * pvKwp * 0.8;
            var pvT = (sumRad(weather.slice(1), 1) / 1000) * pvKwp * 0.8;
            var pv7 = (sumRad(weather, 7) / 1000) * pvKwp * 0.8;
            var pv14 = (sumRad(weather, 14) / 1000) * pvKwp * 0.8;
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
        weather.forEach(function(row) {
            var tr = document.createElement('tr');
            var sun = (typeof row.sunshine_hours !== 'undefined') ? formatNumberDE(row.sunshine_hours, 2) : '';
            var radNum = Number(row.shortwave_radiation_sum_Wh_m2);
            var rad = isFinite(radNum) ? formatNumberDE(radNum, 0) : '';
            var pv = '';
            if (pvKwp && isFinite(radNum)) {
                var pvVal = (radNum / 1000) * pvKwp * 0.8;
                pv = formatNumberDE(pvVal, 2);
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