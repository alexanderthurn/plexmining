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
const minersApiUrl = '../api/miners.php';

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
    fetch(minersApiUrl)
        .then(function(response) { return response.json(); })
        .then(function(data) {
            if (Array.isArray(data)) {
                populateMinerTable(data);
            } else if (data && Array.isArray(data.miners)) {
                populateMinerTable(data.miners);
            } else {
                populateMinerTable([]);
            }
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