<?php

header('Content-Type: application/json');

// Configuration (defaults mirror fetch_bonn_sunshine.sh)
$lat = 50.7374;
$lon = 7.0982;
$days = 14;
$timezone = 'Europe/Berlin';
$dailyDataFile = '../data/config/weather-daily.json';
$hourlyDataFile = '../data/config/weather-hourly.json';

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

// Check freshness of existing files
$dailyAge = is_file($dailyDataFile) ? time() - filemtime($dailyDataFile) : PHP_INT_MAX;
$hourlyAge = is_file($hourlyDataFile) ? time() - filemtime($hourlyDataFile) : PHP_INT_MAX;

if (!$force && $dailyAge < ($maxAgeMinutes * 60) && $hourlyAge < ($maxAgeMinutes * 60)) {
    echo json_encode([
        'ok' => true,
        'skipped' => true,
        'reason' => 'cache_fresh',
        'daily_age_seconds' => $dailyAge,
        'hourly_age_seconds' => $hourlyAge,
        'max_age_seconds' => $maxAgeMinutes * 60
    ], JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES);
    exit;
}

// Build URLs for both daily and hourly data
$dailyUrl = sprintf(
    'https://api.open-meteo.com/v1/forecast?latitude=%s&longitude=%s&daily=sunshine_duration,shortwave_radiation_sum&timezone=%s&forecast_days=%d',
    rawurlencode((string)$lat),
    rawurlencode((string)$lon),
    rawurlencode($timezone),
    $days
);

$hourlyUrl = sprintf(
    'https://api.open-meteo.com/v1/forecast?latitude=%s&longitude=%s&hourly=global_tilted_irradiance&tilt=30&azimuth=0&timezone=%s&forecast_days=%d',
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

// Fetch daily data
[$dailyJson, $dailyCode, $dailyError] = http_get_json($dailyUrl);
if (!is_array($dailyJson) || $dailyCode !== 200) {
    http_response_code(502);
    echo json_encode(['error' => 'daily_fetch_failed', 'http_code' => $dailyCode, 'message' => $dailyError], JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES);
    exit;
}

// Fetch hourly data
[$hourlyJson, $hourlyCode, $hourlyError] = http_get_json($hourlyUrl);
if (!is_array($hourlyJson) || $hourlyCode !== 200) {
    http_response_code(502);
    echo json_encode(['error' => 'hourly_fetch_failed', 'http_code' => $hourlyCode, 'message' => $hourlyError], JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES);
    exit;
}

// Validate daily format
if (!isset($dailyJson['daily']['time']) || !is_array($dailyJson['daily']['time'])) {
    http_response_code(500);
    echo json_encode(['error' => 'unexpected_daily_format', 'details' => 'missing daily.time'], JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES);
    exit;
}

// Validate hourly format
if (!isset($hourlyJson['hourly']['time']) || !is_array($hourlyJson['hourly']['time'])) {
    http_response_code(500);
    echo json_encode(['error' => 'unexpected_hourly_format', 'details' => 'missing hourly.time'], JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES);
    exit;
}

// Transform daily data
$dailyTimes = $dailyJson['daily']['time'];
$dailySunshine = $dailyJson['daily']['sunshine_duration'] ?? [];
$dailyShortwave = $dailyJson['daily']['shortwave_radiation_sum'] ?? [];

$dailyOut = [];
for ($i = 0; $i < count($dailyTimes); $i++) {
    $date = $dailyTimes[$i] ?? null;
    $s = $dailySunshine[$i] ?? null; // seconds
    $r = $dailyShortwave[$i] ?? null; // Wh/m2
    $sunHours = null;
    if ($s !== null) {
        // Convert seconds to hours, round to 2 decimals similar to script
        $sunHours = round(($s / 3600), 2);
    }
    $dailyOut[] = [
        'date' => $date,
        'sunshine_hours' => $sunHours,
        'shortwave_radiation_sum_Wh_m2' => $r,
    ];
}

// Transform hourly data
$hourlyTimes = $hourlyJson['hourly']['time'];
$hourlyTiltedIrradiance = $hourlyJson['hourly']['global_tilted_irradiance'] ?? [];

$hourlyOut = [];
for ($i = 0; $i < count($hourlyTimes); $i++) {
    $datetime = $hourlyTimes[$i] ?? null;
    $tiltedIrradiance = $hourlyTiltedIrradiance[$i] ?? null;
    
    $hourlyOut[] = [
        'datetime' => $datetime,
        'global_tilted_irradiance' => $tiltedIrradiance,
    ];
}

// Write both files atomically
try {
    json_write_atomic($dailyDataFile, $dailyOut);
    json_write_atomic($hourlyDataFile, $hourlyOut);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'write_failed', 'message' => $e->getMessage()], JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES);
    exit;
}

echo json_encode([
    'ok' => true,
    'updated' => true,
    'daily_count' => count($dailyOut),
    'hourly_count' => count($hourlyOut),
    'daily_file' => basename($dailyDataFile),
    'hourly_file' => basename($hourlyDataFile),
    'max_age_minutes' => $maxAgeMinutes,
    'forced' => $force,
    'source' => 'open-meteo'
], JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES);
exit;

?>

