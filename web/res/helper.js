// Helper functions for Plex Mining dashboard

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

function getStatusBadgeClass(status) {
    switch(status) {
        case 'Running': return 'bg-success';
        case 'Error': return 'bg-danger';
        case 'Idle': return 'bg-secondary';
        default: return 'bg-light text-dark';
    }
}

function formatRelativeTimeDE(tsSeconds) {
    if (!tsSeconds) return '';
    
    var now = Date.now();
    var tsMs = tsSeconds * 1000;
    var diffMs = Math.max(0, now - tsMs);
    var diffSec = Math.floor(diffMs / 1000);
    var diffMin = Math.floor(diffSec / 60);
    var diffHour = Math.floor(diffMin / 60);
    var diffDay = Math.floor(diffHour / 24);
    
    if (diffDay < 7) {
        if (diffSec < 60) {
            return 'vor ' + diffSec + (diffSec === 1 ? ' Sekunde' : ' Sekunden');
        } else if (diffMin < 60) {
            return 'vor ' + diffMin + (diffMin === 1 ? ' Minute' : ' Minuten');
        } else if (diffHour < 24) {
            return 'vor ' + diffHour + (diffHour === 1 ? ' Stunde' : ' Stunden');
        } else {
            return 'vor ' + diffDay + (diffDay === 1 ? ' Tag' : ' Tagen');
        }
    } else {
        try {
            return new Date(tsMs).toLocaleString('de-DE', { hour12: false });
        } catch (e) {
            return '';
        }
    }
}

function setRelativeTimestamp(elId, tsSeconds) {
    var el = document.getElementById(elId);
    if (!el) return;
    
    el.classList.remove('text-muted', 'text-warning', 'text-danger');
    if (!tsSeconds) { 
        el.textContent = ''; 
        return; 
    }
    
    var now = Date.now();
    var tsMs = tsSeconds * 1000;
    var diffMs = Math.max(0, now - tsMs);
    var diffHour = Math.floor(diffMs / (1000 * 60 * 60));
    
    el.textContent = formatRelativeTimeDE(tsSeconds);
    
    if (diffHour >= 48) {
        el.classList.add('text-danger');
    } else if (diffHour >= 24) {
        el.classList.add('text-warning');
    } else {
        el.classList.add('text-muted');
    }
}

function updatePVHeaderWithKwp(pvKwp) {
    var pvHeaders = document.querySelectorAll('th.text-muted');
    for (var i = 0; i < pvHeaders.length; i++) {
        var header = pvHeaders[i];
        if (header.textContent.includes('PV-Ertrag') && pvKwp) {
            header.textContent = 'PV-Ertrag (kWh) - ' + formatNumberDE(pvKwp, 0) + ' kWp';
            break;
        }
    }
}

function sumHours(arr, n) {
    var s = 0; 
    var count = Math.min(n, arr.length);
    for (var i = 0; i < count; i++) {
        var v = arr[i] && typeof arr[i].sunshine_hours === 'number' ? arr[i].sunshine_hours : 0;
        s += v;
    }
    return Math.round(s * 100) / 100;
}

function sumRadiation(arr, n) {
    var s = 0; 
    var count = Math.min(n, arr.length);
    for (var i = 0; i < count; i++) {
        var raw = arr[i] ? arr[i].shortwave_radiation_sum_Wh_m2 : null;
        var v = Number(raw);
        if (isFinite(v)) s += v;
    }
    return Math.round(s);
}

function calculatePVEnergy(radiationWh, pvKwp, pvFactor) {
    if (!isFinite(radiationWh) || !isFinite(pvKwp) || !isFinite(pvFactor)) return null;
    return (radiationWh / 1000) * pvKwp * pvFactor;
}
