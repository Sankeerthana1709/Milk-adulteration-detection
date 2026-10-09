"""
Flask Backend Web Application for AI-Based Milk Adulteration Detection
Serves the modern frontend dashboard, provides REST API for model predictions,
and receives real-time IoT telemetry from ESP32 microcontrollers.
"""

import os
import json
import joblib
import numpy as np
import pandas as pd
from datetime import datetime
from flask import Flask, render_template, request, jsonify, send_from_directory
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, 'models', 'esp32_milk_calibration_model_96pct.joblib')
DATASET_PATH = os.path.join(BASE_DIR, 'data', 'milk_calibration_final.csv')
FEATURE_COLS = ['Temperature_Celsius', 'Fat', 'Turbidity', 'Color', 'pH']

@app.route('/reports/<path:filename>')
def serve_reports(filename):
    return send_from_directory(os.path.join(BASE_DIR, 'reports'), filename)

# Load Trained Calibrated Model
print(f"[BACKEND] Loading calibrated model from {MODEL_PATH}...")
try:
    model = joblib.load(MODEL_PATH)
    print(f"[BACKEND] Calibrated Model ({type(model).__name__}) loaded successfully! Classes: {model.classes_}")
except Exception as e:
    print(f"[BACKEND ERROR] Failed to load model: {e}")
    model = None

# In-memory circular buffer for live ESP32 telemetry
live_telemetry_stream = []
MAX_TELEMETRY_HISTORY = 50


def diagnose_milk(temp: float, fat: int, turbidity: int, color: int, ph: float):
    """Generates dairy-science diagnostic warnings based on physical thresholds."""
    warnings = []
    adulterant_type = "None (Standard Baseline)"
    severity = "normal"  # normal, warning, danger
    
    # 1. pH Chemical Analysis
    if ph < 4.8:
        warnings.append({
            "type": "Severe Acidity / Souring",
            "desc": "High lactic acid buildup from microbial decay or added acidic preservative (boric/salicylic acid).",
            "level": "danger"
        })
        adulterant_type = "Lactic Acid Fermentation / Acid Preservative"
        severity = "danger"
    elif ph < 6.0:
        warnings.append({
            "type": "Mild Acidity / Early Souring",
            "desc": "Milk has begun bacterial proliferation; freshness compromised.",
            "level": "warning"
        })
        if severity != "danger":
            severity = "warning"
            adulterant_type = "Bacterial Souring"
    elif ph > 7.8:
        warnings.append({
            "type": "Strong Alkaline Neutralizer Detected",
            "desc": "Chemical adulteration: Caustic soda, washing soda, or detergent added to mask souring.",
            "level": "danger"
        })
        adulterant_type = "Detergent / Soda / Neutralizer Adulteration"
        severity = "danger"
    elif ph > 7.0:
        warnings.append({
            "type": "Mild Alkaline Buffer Detected",
            "desc": "Possible sodium bicarbonate or urea added to adjust pH buffer.",
            "level": "warning"
        })
        if severity != "danger":
            severity = "warning"
            adulterant_type = "Added Neutralizer (Soda/Urea)"

    # 2. Temperature Safety
    if temp > 63.0:
        warnings.append({
            "type": "High Thermal Exposure",
            "desc": "Milk is in pasteurization or boiling temperature range.",
            "level": "warning"
        })
    elif temp > 45.0:
        warnings.append({
            "type": "Danger Zone Temperature",
            "desc": "Warm storage accelerates microbial doubling and spoilage.",
            "level": "danger"
        })
        if severity != "danger":
            severity = "danger"

    # 3. Optical & Fat Dilution Analysis
    if fat == 0 and turbidity == 0:
        warnings.append({
            "type": "Severe Water Dilution",
            "desc": "Both milkfat globules and colloidal solids-not-fat (SNF) are depleted.",
            "level": "danger"
        })
        adulterant_type = "Water Dilution (Added Water)"
        severity = "danger"
    elif fat == 0 and turbidity == 1:
        warnings.append({
            "type": "Skimmed Milk / Synthetic Thickener",
            "desc": "Milkfat is depleted despite milky opacity (possible starch or skimmed base).",
            "level": "warning"
        })
        if severity != "danger":
            severity = "warning"
            adulterant_type = "Skimmed / Synthetic Thickener"
    elif fat == 1 and turbidity == 0:
        warnings.append({
            "type": "Colloidal Destabilization",
            "desc": "Turbidity depleted while fat is present; indicates phase separation or curdling.",
            "level": "warning"
        })
        if severity != "danger":
            severity = "warning"
            adulterant_type = "Colloidal Destabilization"

    # 4. Color Check
    if color < 245:
        warnings.append({
            "type": "Abnormal Color Reflectance",
            "desc": "TCS34725 clear channel indicates reduced whiteness, consistent with dilution.",
            "level": "warning"
        })

    if not warnings:
        warnings.append({
            "type": "Physical Sensor Baseline",
            "desc": "All 5 sensor metrics are within expected parameters for whole milk.",
            "level": "normal"
        })

    return warnings, adulterant_type, severity


@app.route('/')
def index():
    """Serves the main web dashboard."""
    return render_template('index.html')


@app.route('/api/predict', methods=['POST'])
def api_predict():
    """Predicts milk adulteration grade from sensor inputs."""
    data = request.get_json() or {}
    try:
        temp = float(data.get('temperature', 38.0))
        fat = int(data.get('fat', 1))
        turbidity = int(data.get('turbidity', 1))
        color = int(data.get('color', 255))
        ph = float(data.get('ph', 6.8))
    except (ValueError, TypeError) as e:
        return jsonify({'error': f'Invalid sensor parameters: {e}'}), 400

    if model is None:
        return jsonify({'error': 'Model weights not loaded on server.'}), 500

    # Model input vector: [Temperature_Celsius, Fat, Turbidity, Color, pH]
    X_input = pd.DataFrame([[temp, fat, turbidity, color, ph]], columns=FEATURE_COLS)
    pred_raw = model.predict(X_input)[0]
    grade = str(pred_raw)

    # Probabilities
    probs = model.predict_proba(X_input)[0]
    classes = list(model.classes_)
    
    # Map probabilities to low / medium
    prob_dict = {}
    for cls, p in zip(classes, probs):
        prob_dict[cls.lower()] = round(float(p) * 100, 1)
        
    # Ensure both low and medium exist in dict
    if 'low' not in prob_dict:
        prob_dict['low'] = 0.0
    if 'medium' not in prob_dict:
        prob_dict['medium'] = 0.0

    warnings, adulterant_type, severity = diagnose_milk(temp, fat, turbidity, color, ph)

    response = {
        'grade': grade,
        'confidence': prob_dict,
        'adulterant_type': adulterant_type,
        'severity': severity,
        'warnings': warnings,
        'inputs': {
            'temperature': temp,
            'fat': fat,
            'turbidity': turbidity,
            'color': color,
            'ph': ph
        },
        'timestamp': datetime.now().strftime('%H:%M:%S')
    }
    return jsonify(response)


@app.route('/api/esp32/telemetry', methods=['POST'])
def receive_esp32_telemetry():
    """
    Endpoint for ESP32 microcontrollers to push live sensor packets over WiFi.
    Payload: {"temperature": 38.0, "fat": 1, "turbidity": 1, "color": 255, "ph": 6.8}
    """
    data = request.get_json() or {}
    try:
        temp = float(data.get('temperature', 38.0))
        fat = int(data.get('fat', 1))
        turbidity = int(data.get('turbidity', 1))
        color = int(data.get('color', 255))
        ph = float(data.get('ph', 6.8))
    except (ValueError, TypeError) as e:
        return jsonify({'error': f'Invalid ESP32 telemetry packet: {e}'}), 400

    X_input = pd.DataFrame([[temp, fat, turbidity, color, ph]], columns=FEATURE_COLS)
    grade = str(model.predict(X_input)[0]) if model else "Medium"
    probs = model.predict_proba(X_input)[0] if model else [0.5, 0.5]
    classes = list(model.classes_) if model else ['Low', 'Medium']
    
    conf_dict = {cls.lower(): round(float(p) * 100, 1) for cls, p in zip(classes, probs)}

    warnings, adulterant_type, severity = diagnose_milk(temp, fat, turbidity, color, ph)

    packet = {
        'device_id': data.get('device_id', 'ESP32_Node_1'),
        'timestamp': datetime.now().strftime('%H:%M:%S'),
        'temperature': temp,
        'fat': fat,
        'turbidity': turbidity,
        'color': color,
        'ph': ph,
        'grade': grade,
        'adulterant_type': adulterant_type,
        'severity': severity,
        'confidence': conf_dict
    }

    live_telemetry_stream.insert(0, packet)
    if len(live_telemetry_stream) > MAX_TELEMETRY_HISTORY:
        live_telemetry_stream.pop()

    return jsonify({'status': 'success', 'received': packet})


@app.route('/api/esp32/live', methods=['GET'])
def get_live_esp32_stream():
    """Returns the recent live incoming stream from the physical ESP32."""
    return jsonify({
        'stream': live_telemetry_stream,
        'connected': len(live_telemetry_stream) > 0,
        'last_reading': live_telemetry_stream[0] if live_telemetry_stream else None
    })


@app.route('/api/presets', methods=['GET'])
def get_presets():
    """Returns pre-configured real-world dairy adulteration samples for testing."""
    presets = [
        {
            'id': 'standard_whole',
            'title': 'Standard Whole Milk (Intact Solids)',
            'description': 'Normal colloidal opacity, natural fat present, rich color reflectance, neutral pH.',
            'values': {'temperature': 38.0, 'fat': 1, 'turbidity': 1, 'color': 255, 'ph': 6.8},
            'expected': 'Medium (Mild / Standard Quality)'
        },
        {
            'id': 'mild_alkaline',
            'title': 'Mild Alkaline Buffer (Urea / Sodium Bicarbonate)',
            'description': 'Added buffer raises pH to 7.4 with intact fat and turbidity.',
            'values': {'temperature': 40.0, 'fat': 1, 'turbidity': 1, 'color': 250, 'ph': 7.4},
            'expected': 'Medium (Mild Adulteration)'
        },
        {
            'id': 'detergent_soda',
            'title': 'Severe Detergent / Caustic Soda Adulteration',
            'description': 'Chemical neutralizers push pH to 8.6 with depleted fat and turbidity.',
            'values': {'temperature': 42.0, 'fat': 0, 'turbidity': 0, 'color': 246, 'ph': 8.6},
            'expected': 'Low (Severe Adulteration)'
        },
        {
            'id': 'soured_bacterial',
            'title': 'Soured / Curdled Spoiled Milk',
            'description': 'Lactic acid bacterial fermentation drops pH to 4.6 with broken emulsion.',
            'values': {'temperature': 48.0, 'fat': 1, 'turbidity': 0, 'color': 248, 'ph': 4.6},
            'expected': 'Low (Severe Spoilage)'
        },
        {
            'id': 'water_diluted',
            'title': 'Heavy Water Dilution Adulteration',
            'description': 'Significant water added: milkfat globules depleted, watery turbidity, low color.',
            'values': {'temperature': 36.0, 'fat': 0, 'turbidity': 0, 'color': 240, 'ph': 6.2},
            'expected': 'Low (Severe Dilution)'
        }
    ]
    return jsonify(presets)


@app.route('/api/dataset/stats', methods=['GET'])
def get_dataset_stats():
    """Returns statistics from the milk calibration dataset."""
    if not os.path.exists(DATASET_PATH):
        return jsonify({'error': 'Dataset not found'}), 404
        
    df = pd.read_csv(DATASET_PATH)
    counts = df['Grade'].value_counts().to_dict()
    total = len(df)
    
    stats = {
        'dataset_name': 'milk_calibration_final.csv',
        'total_samples': total,
        'features': ['Temperature_Celsius', 'Fat', 'Turbidity', 'Color', 'pH'],
        'class_distribution': counts,
        'percentages': {k: round(v / total * 100, 1) for k, v in counts.items()},
        'model_cv_accuracy': 94.81,
        'model_test_accuracy': 96.70,
        'macro_f1': 0.9525,
        'model_architecture': 'Regularized Random Forest (max_depth=3, min_samples_leaf=20)'
    }
    return jsonify(stats)


if __name__ == '__main__':
    print("==================================================================")
    print("  AI-BASED MILK ADULTERATION DETECTION WEB SERVER                 ")
    print("  Running on http://127.0.0.1:5000                                ")
    print("==================================================================")
    app.run(host='0.0.0.0', port=5000, debug=False)
