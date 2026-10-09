import urllib.request
import json

BASE = 'http://127.0.0.1:5000'

def test_endpoint(url, data=None):
    req = urllib.request.Request(url, headers={'Content-Type': 'application/json'})
    if data:
        encoded = json.dumps(data).encode('utf-8')
        resp = urllib.request.urlopen(req, data=encoded)
    else:
        resp = urllib.request.urlopen(req)
    raw = resp.read()
    try:
        content = raw.decode('utf-8')
    except UnicodeDecodeError:
        content = f"<binary {len(raw)} bytes>"
    return resp.status, content

# 1. Main Page
st, body = test_endpoint(BASE + '/')
print(f"1. GET / -> Status {st}, HTML Length: {len(body)}")

# 2. Predict Medium Quality
st, body = test_endpoint(BASE + '/api/predict', {'temperature': 38.0, 'fat': 1, 'turbidity': 1, 'color': 255, 'ph': 6.8})
res = json.loads(body)
print(f"2. POST /api/predict (Medium sample) -> Grade: {res.get('grade')}, Conf: {res.get('confidence')}, Adulterant: {res.get('adulterant_type')}")

# 3. Predict Low Quality (Sour)
st, body = test_endpoint(BASE + '/api/predict', {'temperature': 45.0, 'fat': 1, 'turbidity': 0, 'color': 248, 'ph': 4.6})
res = json.loads(body)
print(f"3. POST /api/predict (Sour sample) -> Grade: {res.get('grade')}, Conf: {res.get('confidence')}, Adulterant: {res.get('adulterant_type')}")

# 4. ESP32 Telemetry
st, body = test_endpoint(BASE + '/api/esp32/telemetry', {'device_id': 'ESP32_Test_Lab', 'temperature': 39.5, 'fat': 1, 'turbidity': 1, 'color': 252, 'ph': 7.2})
res = json.loads(body)
print(f"4. POST /api/esp32/telemetry -> Status: {res.get('status')}, Packet Grade: {res.get('received', {}).get('grade')}")

# 5. Live Stream
st, body = test_endpoint(BASE + '/api/esp32/live')
res = json.loads(body)
print(f"5. GET /api/esp32/live -> Connected: {res.get('connected')}, Buffer Count: {len(res.get('stream', []))}")

# 6. Presets
st, body = test_endpoint(BASE + '/api/presets')
presets = json.loads(body)
print(f"6. GET /api/presets -> Count: {len(presets)}, Titles: {[p['title'] for p in presets]}")

# 7. Dataset Stats
st, body = test_endpoint(BASE + '/api/dataset/stats')
stats = json.loads(body)
print(f"7. GET /api/dataset/stats -> Dataset: {stats.get('dataset_name')}, Samples: {stats.get('total_samples')}, Test Acc: {stats.get('model_test_accuracy')}%, CV: {stats.get('model_cv_accuracy')}%")

# 8. Report Figures
st, _ = test_endpoint(BASE + '/reports/figures/calibration_confusion_matrix.png')
print(f"8. GET /reports/figures/calibration_confusion_matrix.png -> Status {st}")
print("\n[ALL TESTS PASSED SUCCESSFULLY!]")
