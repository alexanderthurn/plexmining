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

document.getElementById('api-button').addEventListener('click', function() {
    fetchData(apiUrl);
});