<?php

header('Content-Type: application/json');

// Dummy/simple calculation for now.
// In the future, this can read weather + pv data and produce realistic forecasts.

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'method not allowed']);
    exit;
}

// Return very simple dummy forecast values.
$result = [
    'pv_forecast_kwh_next_hours' => [1.2, 1.8, 2.5, 2.9, 2.0, 1.1],
    'pv_forecast_kwh_total' => 11.5,
    'notes' => 'Dummy values; replace with real calculation later.'
];

echo json_encode($result, JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES);
exit;

?>

