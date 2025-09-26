<?php
header('Content-Type: application/json');

$use_fake_data = $_GET['fake'] ?? false; // Check for GET parameter

if ($use_fake_data) {
    $data = ['message' => 'Hello from the fake API!'];
} else {
    // Hier würde die Logik stehen, um die echten Daten von den Minern abzurufen
    $data = ['message' => 'Hello from the real API! (Miner data would be here)'];
}

echo json_encode($data);
?>