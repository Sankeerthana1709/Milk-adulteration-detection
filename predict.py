"""
Interactive Milk Adulteration & Quality Prediction Tool (CLI)
Allows testing custom physical sensor inputs, batch samples, or running automated test scenarios.
Provides actionable adulterant diagnosis based on chemical and physical thresholds.
"""

import sys
import os
import argparse
import joblib
import pandas as pd
import numpy as np

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(BASE_DIR, 'models')


def load_model(model_name: str = "calibration"):
    if model_name == "calibration":
        path = os.path.join(MODELS_DIR, 'esp32_milk_calibration_model_96pct.joblib')
    elif model_name == "benchmark":
        path = os.path.join(MODELS_DIR, 'esp32_milk_quality_model_96pct.joblib')
    else:
        path = os.path.join(MODELS_DIR, 'esp32_milk_calibration_model_96pct.joblib')

    if not os.path.exists(path):
        raise FileNotFoundError(f"Model file not found at: {path}")
    return joblib.load(path)


def diagnose_sample(temp: float, fat: int, turbidity: int, color: int, ph: float) -> list:
    """Analyzes physical-chemical sensor readings to identify specific adulterants."""
    warnings = []
    
    # 1. pH Diagnosis
    if ph < 4.8:
        warnings.append("Severe acidity: High bacterial lactic fermentation or mineral acid adulteration (e.g. boric/salicylic acid).")
    elif ph < 6.0:
        warnings.append("Mild souring: Bacterial proliferation; freshness compromised.")
    elif ph > 7.8:
        warnings.append("Strong alkaline neutralizer detected: Added washing soda, caustic soda, or detergent.")
    elif ph > 7.0:
        warnings.append("Mild alkaline buffer detected: Possible sodium bicarbonate or urea added to mask souring.")
        
    # 2. Temperature Diagnosis
    if temp > 63.0:
        warnings.append("High thermal exposure: Pasteurization / boiling temperature range.")
    elif temp > 45.0:
        warnings.append("Danger zone temperature: Accelerated microbial growth in warm holding.")
        
    # 3. Optical & Fat Dilution Diagnosis
    if fat == 0 and turbidity == 0:
        warnings.append("Severe water dilution: Both milkfat globules and colloidal solids-not-fat (SNF) are depleted.")
    elif fat == 0 and turbidity == 1:
        warnings.append("Skimmed milk or synthetic thickener: Normal opacity but deficient natural milkfat.")
    elif fat == 1 and turbidity == 0:
        warnings.append("Colloidal destabilization: Milk phase separation or curdling.")
        
    # 4. Color Sensor Diagnosis
    if color < 245:
        warnings.append("Abnormal color: TCS34725 clear reflectance is below normal pure milk whiteness (possible adulterant dilution).")
        
    if not warnings:
        warnings.append("All sensor parameters are within expected ranges for whole milk.")
        
    return warnings


def predict_milk(temp: float, fat: int, turbidity: int, color: int, ph: float, model_type: str = "calibration"):
    """Runs model inference on raw sensor inputs."""
    model = load_model(model_type)
    X_input = pd.DataFrame([{
        'Temperature_Celsius': float(temp),
        'Fat': int(fat),
        'Turbidity': int(turbidity),
        'Color': int(color),
        'pH': float(ph)
    }])
    
    pred_raw = model.predict(X_input)[0]
    grade = str(pred_raw)
    
    probs = None
    prob_dict = {}
    if hasattr(model, 'predict_proba'):
        probs = model.predict_proba(X_input)[0]
        classes = list(model.classes_)
        for cls, p in zip(classes, probs):
            prob_dict[cls] = round(float(p) * 100, 1)
        
    diagnostics = diagnose_sample(temp, fat, turbidity, color, ph)
    return grade, prob_dict, diagnostics


def print_prediction_report(temp, fat, turbidity, color, ph, grade, probs, diagnostics, model_type):
    print("\n========================================================")
    print("      MILK ADULTERATION & QUALITY PREDICTION REPORT     ")
    print("========================================================")
    engine_label = "96.70% Calibrated Random Forest Model" if model_type == "calibration" else "96.98% Benchmark Reference Model"
    print(f"Model Engine    : {engine_label}")
    print(f"\n--- Input Sensor Telemetry ---")
    print(f"  * Temperature : {temp:.1f} °C")
    print(f"  * pH Level    : {ph:.2f}")
    print(f"  * Fat Status  : {'Present (1)' if fat == 1 else 'Absent/Low (0)'}")
    print(f"  * Turbidity   : {'Optimal Milky (1)' if turbidity == 1 else 'Diluted/Clear (0)'}")
    print(f"  * Color Index : {color} (TCS34725 whiteness scale 240-255)")
    
    print(f"\n--- Classification Result ---")
    badge = "[MEDIUM QUALITY]" if grade == "Medium" else ("[LOW QUALITY / ADULTERATED]" if grade == "Low" else "[HIGH QUALITY]")
    print(f"  PREDICTED GRADE: {badge}  {grade.upper()}")
    
    if probs:
        print(f"  Confidence Breakdown:")
        for cls, pct in probs.items():
            print(f"    - Grade {cls:7s} : {pct:.1f}%")
        
    print(f"\n--- Sensory & Chemical Diagnosis ---")
    for diag in diagnostics:
        print(f"  [ALERT] {diag}")
    print("========================================================\n")


def interactive_mode():
    print("\n[INTERACTIVE MODE] Enter ESP32 Sensor Readings:")
    try:
        temp = float(input("Enter Temperature in °C (e.g. 38.0): ").strip())
        fat = int(input("Enter Fat [0 for low/absent, 1 for normal]: ").strip())
        turbidity = int(input("Enter Turbidity [0 for low, 1 for normal]: ").strip())
        color = int(input("Enter Color [240 to 255 from TCS34725]: ").strip())
        ph = float(input("Enter pH [3.0 to 9.5]: ").strip())
        
        grade, probs, diagnostics = predict_milk(temp, fat, turbidity, color, ph, model_type="calibration")
        print_prediction_report(temp, fat, turbidity, color, ph, grade, probs, diagnostics, "calibration")
    except ValueError as e:
        print(f"Invalid input format: {e}")


def main():
    parser = argparse.ArgumentParser(description="AI Milk Adulteration Detector Prediction CLI")
    parser.add_argument("--temp", type=float, help="Temperature in Celsius")
    parser.add_argument("--fat", type=int, choices=[0, 1], help="Fat sensor (0 or 1)")
    parser.add_argument("--turbidity", type=int, choices=[0, 1], help="Turbidity sensor (0 or 1)")
    parser.add_argument("--color", type=int, help="Color from TCS34725 (240-255)")
    parser.add_argument("--ph", type=float, help="pH reading (3.0-9.5)")
    parser.add_argument("--model", type=str, default="calibration", choices=["calibration", "benchmark"], help="Model to use")
    parser.add_argument("--interactive", action="store_true", help="Launch interactive prompt")
    
    args = parser.parse_args()
    
    if args.interactive:
        interactive_mode()
        return

    if args.temp is not None and args.ph is not None and args.fat is not None and args.turbidity is not None and args.color is not None:
        grade, probs, diagnostics = predict_milk(args.temp, args.fat, args.turbidity, args.color, args.ph, args.model)
        print_prediction_report(args.temp, args.fat, args.turbidity, args.color, args.ph, grade, probs, diagnostics, args.model)
    else:
        # Run test demonstration cases
        print("Running automated demonstration test cases on calibrated 96.70% model...\n")
        test_samples = [
            {"desc": "Standard Whole Milk (Intact Solids)", "temp": 38.0, "fat": 1, "turbidity": 1, "color": 255, "ph": 6.8},
            {"desc": "Alkaline Adulterated Milk (Detergent / Caustic Soda)", "temp": 42.0, "fat": 0, "turbidity": 0, "color": 246, "ph": 8.6},
            {"desc": "Water Diluted Milk (Added Water / Low Fat)", "temp": 36.0, "fat": 0, "turbidity": 0, "color": 240, "ph": 6.2},
            {"desc": "Soured / Curdled Spoiled Milk", "temp": 48.0, "fat": 1, "turbidity": 0, "color": 248, "ph": 4.6},
            {"desc": "Mild Alkaline Buffer (Urea / Bicarbonate)", "temp": 40.0, "fat": 1, "turbidity": 1, "color": 250, "ph": 7.4}
        ]
        
        for sample in test_samples:
            print(f"Testing Scenario: {sample['desc']}")
            grade, probs, diagnostics = predict_milk(
                sample['temp'], sample['fat'], sample['turbidity'], sample['color'], sample['ph'], "calibration"
            )
            print_prediction_report(
                sample['temp'], sample['fat'], sample['turbidity'], sample['color'], sample['ph'],
                grade, probs, diagnostics, "calibration"
            )


if __name__ == '__main__':
    main()
