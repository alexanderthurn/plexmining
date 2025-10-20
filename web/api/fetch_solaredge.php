<?php
// Konfiguration
$siteId  = "DEINE_SITE_ID";
$apiKey  = "DEIN_API_KEY";
$batteryCapacityKwh = 69.0; // Anpassen an deine Batteriegröße

// API abrufen
$url = "https://monitoringapi.solaredge.com/site/{$siteId}/currentPowerFlow.json?api_key={$apiKey}";
$response = file_get_contents($url);
if ($response === false) {
    http_response_code(500);
    echo json_encode(["error" => "API request failed"]);
    exit;
}

$data = json_decode($response, true);

// PV-Leistung (kW)
$solarPowerKw = $data["siteCurrentPowerFlow"]["PV"]["currentPower"] ?? null;

// Batteriestand (%)
$batteryPercent = $data["siteCurrentPowerFlow"]["STORAGE"]["chargeLevel"] ?? null;

// kWh berechnen
$batteryKwh = null;
if ($batteryPercent !== null) {
    $batteryKwh = $batteryCapacityKwh * ($batteryPercent / 100.0);
}

// Ausgabe
header("Content-Type: application/json");
echo json_encode([
    "battery_kwh"    => $batteryKwh,
    "solar_power_kw" => $solarPowerKw
]);
