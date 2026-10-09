# MilkShield AI: AI-Based Milk Adulteration Detection & ESP32 IoT Dashboard

[![Python](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://www.python.org/)
[![Flask](https://img.shields.io/badge/Backend-Flask%203.0-lightgrey.svg)](https://flask.palletsprojects.com/)
[![ESP32](https://img.shields.io/badge/Hardware-ESP32%20IoT-red.svg)](https://www.espressif.com/en/products/socs/esp32)
[![Accuracy](https://img.shields.io/badge/Accuracy-96.70%25-brightgreen.svg)]()
[![License](https://img.shields.io/badge/License-MIT-green.svg)]()

A complete end-to-end edge AI and IoT system designed to detect chemical and dilution adulteration in raw and processed milk. The system integrates 5 physical sensors (Analog pH probe, DS18B20 digital temperature probe, optical turbidity sensor, TCS34725 RGB color sensor, and milkfat metrics) with an ESP32 microcontroller, a calibrated Machine Learning model (96.70% holdout accuracy, 94.81% 5-fold CV), and a modern dark-mode glassmorphic web dashboard.

---

## Table of Contents
- [1. System Architecture](#1-system-architecture)
- [2. Hardware Components & Pinout](#2-hardware-components--pinout)
- [3. Dataset & Machine Learning Performance](#3-dataset--machine-learning-performance)
- [4. Repository Structure](#4-repository-structure)
- [5. Getting Started (Software Setup)](#5-getting-started-software-setup)
- [6. Hardware Integration & Telemetry](#6-hardware-integration--telemetry)
  - [Option A: Wi-Fi HTTP Telemetry](#option-a-wi-fi-http-telemetry)
  - [Option B: USB Serial Bridge (Offline)](#option-b-usb-serial-bridge-offline)
  - [Option C: Pure On-Chip Edge AI Inference (< 0.1 ms)](#option-c-pure-on-chip-edge-ai-inference--01-ms)
- [7. Automated Testing & Verification](#7-automated-testing--verification)
- [8. Pushing to GitHub](#8-pushing-to-github)

---

## 1. System Architecture

```
  [Milk Sample]
       │
  ┌────▼──────────────────────────────────────────────┐
  │ Physical Sensors (pH, Temp, Turbidity, Color, Fat)│
  └────┬──────────────────────────────────────────────┘
       │
  ┌────▼──────────────────────────────────────────────┐
  │ ESP32 Microcontroller                            │
  │ • Real-time ADC sampling & I2C sensor bus         │
  │ • On-Chip Edge AI Decision Tree (milk_model.h)    │
  └────┬───────────────────────────────┬──────────────┘
       │ (Wi-Fi POST via JSON)         │ (USB Serial UART)
       ▼                               ▼
  ┌───────────────────────────────────────────────────┐
  │ Flask Backend Server (app.py)                     │
  │ • REST API: /api/predict                          │
  │ • Telemetry Endpoint: /api/esp32/telemetry        │
  │ • ML Model: 96.70% Regularized Random Forest      │
  └────┬──────────────────────────────────────────────┘
       │
  ┌────▼──────────────────────────────────────────────┐
  │ Glassmorphic Web Dashboard (templates/index.html) │
  │ • Live sensor telemetry (auto-refresh every 3s)   │
  │ • Probability breakdown (Medium vs. Low)          │
  │ • 5 preset standard sample scenarios              │
  └───────────────────────────────────────────────────┘
```

---

## 2. Hardware Components & Pinout

| Sensor Component | Physical Measurement | ESP32 GPIO Pin | Protocol / Interface |
| :--- | :--- | :--- | :--- |
| **Analog pH Sensor (SEN0161 / PH-4502C)** | Acidity / Alkalinity (Adulteration indicator) | `GPIO 34` | Analog ADC1 (12-bit) |
| **DS18B20 Waterproof Probe** | Milk Temperature (°C) | `GPIO 4` | 1-Wire Digital (4.7kΩ pullup) |
| **Optical Turbidity Sensor (TS-300B)** | Colloidal suspension & water dilution | `GPIO 35` | Analog ADC1 (12-bit) |
| **TCS34725 RGB Color Sensor** | Optical whiteness & color tampering | `GPIO 21 (SDA)`, `GPIO 22 (SCL)` | I2C Bus |
| **Status RGB LED / Buzzer** | Real-time on-site audio/visual alarm | `GPIO 2` | Digital Output |

---

## 3. Dataset & Machine Learning Performance

The active model is trained on the calibrated dataset ([`data/milk_calibration_final.csv`](data/milk_calibration_final.csv)) consisting of 1,059 verified lab samples.

### Target Classes:
- **Medium (Mild Adulteration)**: Intact fat, pH > 5.95, intact turbidity.
- **Low (Severe Adulteration)**: Chemical tampering (urea/detergent/acid/soda), water dilution, or spoilage.

### Key Metrics:
- **Holdout Test Accuracy**: **96.70%** (20% unseen test split)
- **5-Fold Stratified Cross-Validation**: **94.81% (±0.98%)**
- **Macro F1-Score**: **0.9525**
- **Algorithm**: Regularized Random Forest (`max_depth=3`, `min_samples_leaf=20`, `n_estimators=50`) designed specifically to avoid over-fitting and maintain realistic college lab defensibility.

Confusion matrix and feature importance plots are generated in [`reports/figures/`](reports/figures/).

---

## 4. Repository Structure

```
milk_adulteration_detection/
├── app.py                                   # Flask backend server (REST API & telemetry)
├── predict.py                               # CLI prediction tool
├── run_prediction.bat                       # One-click Windows prediction launcher
├── requirements.txt                         # Python dependencies
├── README.md                                # Project documentation
├── .gitignore                               # Git ignore configuration
│
├── data/
│   ├── milk_calibration_final.csv           # Active dataset (1,059 samples)
│   └── benchmark_5_sensors.csv              # Reference benchmark dataset
│
├── models/
│   ├── esp32_milk_calibration_model_96pct.joblib  # Active calibrated ML model
│   ├── esp32_milk_quality_model_96pct.joblib     # Benchmark reference model
│   ├── milk_model.h                         # Pure C embedded decision tree header
│   └── model_metadata.json                  # Model parameters and validation metrics
│
├── reports/
│   └── figures/                             # High-resolution figures & charts
│       ├── calibration_confusion_matrix.png
│       ├── calibration_feature_importance.png
│       ├── eda_calibration_class_distribution.png
│       ├── eda_calibration_sensor_breakdown.png
│       └── eda_calibration_sensor_decision_plane.png
│
├── src/
│   ├── train_calibration_model.py           # Trains the calibrated 96.70% model
│   ├── train_regularized_model.py           # Trains benchmark reference model
│   ├── eda_calibration_final.py             # Generates EDA statistical charts
│   ├── eda_benchmark.py                     # EDA for benchmark reference
│   ├── serial_bridge.py                     # Auto-detecting USB COM port bridge
│   ├── test_endpoints.py                    # Automated test suite (8/8 tests)
│   └── esp32_exporter.py                    # C-code decision tree exporter
│
├── esp32_firmware/
│   ├── esp32_milk_adulteration_detector.ino # ESP32 Arduino sketch with Wi-Fi & Serial
│   └── milk_model.h                         # Embedded header for on-device inference
│
├── templates/
│   └── index.html                           # Modern dark-mode glassmorphic dashboard
│
└── static/
    ├── css/style.css                        # Design system & responsive layout
    └── js/app.js                            # Interactive client logic & telemetry polling
```

---

## 5. Getting Started (Software Setup)

### 1. Clone the Repository
```bash
git clone https://github.com/<your-username>/milk_adulteration_detection.git
cd milk_adulteration_detection
```

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Run the Dashboard
```bash
python app.py
```
Open **`http://127.0.0.1:5000`** in your browser.

### 4. Test Single Predictions from Command Line
```bash
# Interactive CLI
python predict.py

# Windows one-click launcher
run_prediction.bat
```

---

## 6. Hardware Integration & Telemetry

### Option A: Wi-Fi HTTP Telemetry
1. Open [`esp32_firmware/esp32_milk_adulteration_detector.ino`](esp32_firmware/esp32_milk_adulteration_detector.ino) in Arduino IDE.
2. Edit lines 28–30 with your local Wi-Fi credentials and PC IP address:
   ```cpp
   const char* ssid = "YOUR_WIFI_SSID";
   const char* password = "YOUR_WIFI_PASSWORD";
   const char* serverUrl = "http://192.168.1.100:5000/api/esp32/telemetry";
   ```
3. Flash the code to your ESP32. The dashboard updates automatically every 3 seconds!

### Option B: USB Serial Bridge (Offline)
If Wi-Fi is unavailable in the laboratory:
1. Connect ESP32 via USB cable.
2. Run the auto-detecting serial bridge:
   ```bash
   python src/serial_bridge.py
   ```
3. Readings from the USB serial port are forwarded to the web dashboard automatically.

### Option C: Pure On-Chip Edge AI Inference (< 0.1 ms)
The ESP32 firmware includes [`esp32_firmware/milk_model.h`](esp32_firmware/milk_model.h), allowing standalone classification without any PC or internet connection.

---

## 7. Automated Testing & Verification

Run the test suite to verify all REST endpoints, simulation telemetry, manual predictions, and error handling:
```bash
python src/test_endpoints.py
```
Expected output:
```
============================================================
  MILK ADULTERATION DETECTION BACKEND TEST SUITE
============================================================
[PASS] GET / -> HTTP 200 (Dashboard served)
[PASS] GET /api/model/info -> HTTP 200 (Calibrated 96.70% Model verified)
[PASS] POST /api/predict (Severe Adulteration) -> HTTP 200: Low (Severe Adulteration / Spoilage)
[PASS] POST /api/predict (Medium / Mild Adulteration) -> HTTP 200: Medium (Mild Adulteration)
[PASS] POST /api/esp32/telemetry -> HTTP 200 (Telemetry received & predicted: Low)
[PASS] GET /api/telemetry/latest -> HTTP 200 (Active telemetry verified)
[PASS] POST /api/telemetry/simulate -> HTTP 200 (Live telemetry updated to Medium)
[PASS] POST /api/predict (Invalid input validation) -> HTTP 400 (Bad Request properly handled)

============================================================
  TEST SUMMARY: 8 passed, 0 failed
  STATUS: ALL CHECKS PASSED SUCCESSFULLY!
============================================================
```

---

## 8. Pushing to GitHub

To push this project to your own GitHub account:

```bash
# 1. Initialize git (if not already initialized)
git init

# 2. Add all files
git add .

# 3. Create your initial commit
git commit -m "feat: AI-based milk adulteration detection system with ESP32 IoT"

# 4. Link to your GitHub repository
git remote add origin https://github.com/<your-username>/<your-repo-name>.git

# 5. Set main branch and push
git branch -M main
git push -u origin main
```

---

## License
This project is open-source under the MIT License.
