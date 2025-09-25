<?php

header('Content-Type: application/json');

$settingsFile = '../data/config/settings.json';
$minersFile = '../data/config/miners.json';
$weatherFile = '../data/config/weather.json';
$pvFile = '../data/config/pv.json';

function json_read_assoc(string $path, $default) {
    if (!is_file($path)) return $default;
    $content = file_get_contents($path);
    $decoded = json_decode($content, true);
    return is_array($decoded) || is_object($decoded) ? $decoded : $default;
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'method not allowed']);
    exit;
}

$settings = json_read_assoc($settingsFile, []);
$miners = json_read_assoc($minersFile, []);
$weather = json_read_assoc($weatherFile, []);
$pv = json_read_assoc($pvFile, []);

// fetch dummy calculation
$calculation = [];
try {
    // Simple local include via HTTP would be expensive; instead, replicate logic here or request file.
    // For now, read calculation through direct include if desired; we keep it simple and avoid includes.
    $calculation = [
        'pv_forecast_kwh_next_hours' => [1.2, 1.8, 2.5, 2.9, 2.0, 1.1],
        'pv_forecast_kwh_total' => 11.5,
        'notes' => 'Dummy values; see calculation.php for endpoint version.'
    ];
} catch (Throwable $e) {
    $calculation = ['error' => 'calculation unavailable'];
}

$mtimes = [
    'settings' => is_file($settingsFile) ? filemtime($settingsFile) : null,
    'miners' => is_file($minersFile) ? filemtime($minersFile) : null,
    'weather' => is_file($weatherFile) ? filemtime($weatherFile) : null,
    'pv' => is_file($pvFile) ? filemtime($pvFile) : null,
];

$result = [
    'settings' => $settings,
    'miners' => $miners,
    'weather' => $weather,
    'pv' => $pv,
    'calculation' => $calculation,
    'mtimes' => $mtimes,
];

echo json_encode($result, JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES);
exit;

?>

