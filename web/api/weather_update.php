<?php

header('Content-Type: application/json');

// Configuration (defaults mirror fetch_bonn_sunshine.sh)
$lat = 50.7374;
$lon = 7.0982;
$days = 14;
$timezone = 'Europe/Berlin';
$dataFile = '../data/config/weather.json';

// Controls
$force = isset($_GET['force']) && ($_GET['force'] === 'true' || $_GET['force'] === '1');
$maxAgeMinutes = isset($_GET['max_age_min']) ? max(0, (int)$_GET['max_age_min']) : 60; // default 60 minutes
if (isset($_GET['max_age_hours'])) {
    $h = max(0, (int)$_GET['max_age_hours']);
    // Prefer hours if provided
    $maxAgeMinutes = $h * 60;
}

// Helper: atomic write
function json_write_atomic(string $path, $data): void {
    $tmp = $path . '.' . bin2hex(random_bytes(4)) . '.tmp';
    file_put_contents($tmp, json_encode($data, JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES), LOCK_EX);
    rename($tmp, $path);
}

// Check freshness of existing file
if (!$force && is_file($dataFile)) {
    $ageSeconds = time() - filemtime($dataFile);
    if ($ageSeconds < ($maxAgeMinutes * 60)) {
        echo json_encode([
            'ok' => true,
            'skipped' => true,
            'reason' => 'cache_fresh',
            'age_seconds' => $ageSeconds,
            'max_age_seconds' => $maxAgeMinutes * 60
        ], JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES);
        exit;
    }
}

// Build URL
$url = sprintf(
    'https://api.open-meteo.com/v1/forecast?latitude=%s&longitude=%s&daily=sunshine_duration,shortwave_radiation_sum&timezone=%s&forecast_days=%d',
    rawurlencode((string)$lat),
    rawurlencode((string)$lon),
    rawurlencode($timezone),
    $days
);

// Fetch function using cURL, fallback to file_get_contents
function http_get_json(string $url) {
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 20);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        $body = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($body === false || $httpCode !== 200) {
            return [null, $httpCode ?: 0, $err ?: 'http error'];
        }
        $decoded = json_decode($body, true);
        return [$decoded, $httpCode, null];
    }
    $body = @file_get_contents($url);
    if ($body === false) return [null, 0, 'fetch failed'];
    $decoded = json_decode($body, true);
    return [$decoded, 200, null];
}

[$json, $code, $error] = http_get_json($url);
if (!is_array($json) || $code !== 200) {
    http_response_code(502);
    echo json_encode(['error' => 'fetch_failed', 'http_code' => $code, 'message' => $error], JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES);
    exit;
}

// Validate format
if (!isset($json['daily']['time']) || !is_array($json['daily']['time'])) {
    http_response_code(500);
    echo json_encode(['error' => 'unexpected_format', 'details' => 'missing daily.time'], JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES);
    exit;
}

// Transform to compact array like CSV headings from the bash script
$times = $json['daily']['time'];
$sunshine = $json['daily']['sunshine_duration'] ?? [];
$shortwave = $json['daily']['shortwave_radiation_sum'] ?? [];

$out = [];
for ($i = 0; $i < count($times); $i++) {
    $date = $times[$i] ?? null;
    $s = $sunshine[$i] ?? null; // seconds
    $r = $shortwave[$i] ?? null; // Wh/m2
    $sunHours = null;
    if ($s !== null) {
        // Convert seconds to hours, round to 2 decimals similar to script
        $sunHours = round(($s / 3600), 2);
    }
    $out[] = [
        'date' => $date,
        'sunshine_hours' => $sunHours,
        'shortwave_radiation_sum_Wh_m2' => $r,
    ];
}

// Write atomically
try {
    json_write_atomic($dataFile, $out);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'write_failed', 'message' => $e->getMessage()], JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES);
    exit;
}

echo json_encode([
    'ok' => true,
    'updated' => true,
    'count' => count($out),
    'file' => basename($dataFile),
    'max_age_minutes' => $maxAgeMinutes,
    'forced' => $force,
    'source' => 'open-meteo'
], JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES);
exit;

?>

