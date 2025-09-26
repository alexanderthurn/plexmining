<?php

header('Content-Type: application/json');

function json_read(string $path, array $default = []): array {
    if (!is_file($path)) return $default;
    $content = file_get_contents($path);
    $decoded = json_decode($content, true);
    return is_array($decoded) ? $decoded : $default;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $type = $_GET['type'] ?? 'daily';
    
    if ($type === 'hourly') {
        $dataFile = '../data/config/weather-hourly.json';
        $data = json_read($dataFile);
    } else {
        $dataFile = '../data/config/weather-daily.json';
        $data = json_read($dataFile);
    }
    
    echo json_encode($data, JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'method not allowed']);

?>

