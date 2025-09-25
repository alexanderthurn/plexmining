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
            <td>${miner.hashrate}</td>
            <td>${miner.power}</td>
            <td>${miner.temperature}</td>
            <td>${miner.btcPerKwh}</td>
            <td>${miner.euroPerKwh}</td>
        `;
        tbody.appendChild(row);
    });
}

function fetchAndRenderMiners() {
    fetch(dataApiUrl)
        .then(function(response) { return response.json(); })
        .then(function(data) {
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
            // Last update timestamp
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

function setText(id, value) {
    var el = document.getElementById(id);
    if (el) {
        el.textContent = value;
    }
}

function renderPV(pv) {
    if (!pv) return;
    if (typeof pv.pv_leistung_w !== 'undefined') setText('pv-leistung', String(pv.pv_leistung_w));
    if (pv.batterie_stand && typeof pv.batterie_stand.kwh !== 'undefined' && typeof pv.batterie_stand.percent !== 'undefined') {
        setText('batterie-stand', pv.batterie_stand.kwh + ' kWh (' + pv.batterie_stand.percent + '%)');
    }
    if (typeof pv.netz_leistung_w !== 'undefined') setText('netz-leistung', String(pv.netz_leistung_w));
    if (typeof pv.haus_last_w !== 'undefined') setText('haus-last', String(pv.haus_last_w));
    if (Array.isArray(pv.miner_betriebszeiten)) {
        setText('miner-betriebszeiten', pv.miner_betriebszeiten.join(', '));
    }
}

function renderWeatherAndForecast(weather, calculation) {
    // For now we just display dummy forecast values from calculation
    if (calculation && Array.isArray(calculation.pv_forecast_kwh_next_hours)) {
        setText('pv-prognose', calculation.pv_forecast_kwh_next_hours.join(' / ') + ' kWh');
    }
    // Render compact weather table
    var tbody = document.getElementById('weather-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (Array.isArray(weather)) {
        weather.forEach(function(row) {
            var tr = document.createElement('tr');
            tr.innerHTML = '<td>' + (row.date || '') + '</td>' +
                           '<td>' + (typeof row.sunshine_hours !== 'undefined' ? row.sunshine_hours : '') + '</td>' +
                           '<td>' + (typeof row.shortwave_radiation_sum_Wh_m2 !== 'undefined' ? row.shortwave_radiation_sum_Wh_m2 : '') + '</td>';
            tbody.appendChild(tr);
        });
    }
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