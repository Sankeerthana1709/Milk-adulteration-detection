"""
Serial-to-Web Bridge for ESP32 Milk Adulteration Detector
Reads real-time sensor packets from the ESP32 over USB Serial (COM port)
and forwards them to the local Flask web dashboard (http://127.0.0.1:5000/api/esp32/telemetry).
"""

import sys
import time
import json
import urllib.request
import re

try:
    import serial
    import serial.tools.list_ports
except ImportError:
    print("[ERROR] pyserial is required. Install it using: pip install pyserial")
    sys.exit(1)

SERVER_URL = "http://127.0.0.1:5000/api/esp32/telemetry"


def find_esp32_port():
    ports = list(serial.tools.list_ports.comports())
    for p in ports:
        desc = p.description.lower()
        if any(k in desc for k in ['cp210', 'ch340', 'ftdi', 'usb', 'uart', 'esp32']):
            return p.device
    if ports:
        return ports[0].device
    return None


def run_bridge(port_name=None, baud_rate=115200):
    if not port_name:
        port_name = find_esp32_port()
        if not port_name:
            print("[ERROR] No USB Serial port found! Plug in your ESP32 and try again.")
            return

    print(f"===========================================================")
    print(f"  ESP32 -> WEB DASHBOARD SERIAL BRIDGE                     ")
    print(f"  Listening on: {port_name} at {baud_rate} baud             ")
    print(f"  Forwarding to: {SERVER_URL}                              ")
    print(f"===========================================================\n")

    try:
        ser = serial.Serial(port_name, baud_rate, timeout=1)
        time.sleep(2)
        print("[CONNECTED] Serial port opened. Waiting for sensor readings...")
    except Exception as e:
        print(f"[ERROR] Could not open {port_name}: {e}")
        return

    temp, ph, fat, turb, col = 38.0, 6.8, 1, 1, 255

    while True:
        try:
            line = ser.readline().decode('utf-8', errors='ignore').strip()
            if not line:
                continue

            print(f"[ESP32] {line}")

            # Parse lines from ESP32 serial output
            m_temp = re.search(r'Temperature.*?:\s*([\d\.]+)', line)
            if m_temp:
                temp = float(m_temp.group(1))

            m_ph = re.search(r'pH.*?:\s*([\d\.]+)', line)
            if m_ph:
                ph = float(m_ph.group(1))

            m_fat = re.search(r'Fat.*?\(([\d]+)\)', line)
            if m_fat:
                fat = int(m_fat.group(1))

            m_turb = re.search(r'Turbidity.*?\(([\d]+)\)', line)
            if m_turb:
                turb = int(m_turb.group(1))

            m_col = re.search(r'Color.*?:\s*([\d]+)', line)
            if m_col:
                col = int(m_col.group(1))

            # When a full block finishes, post to Flask
            if "AI ADULTERATION VERDICT" in line or "PREDICTED QUALITY" in line:
                payload = {
                    "device_id": f"ESP32_USB_{port_name}",
                    "temperature": temp,
                    "ph": ph,
                    "fat": fat,
                    "turbidity": turb,
                    "color": col
                }
                req = urllib.request.Request(
                    SERVER_URL,
                    data=json.dumps(payload).encode('utf-8'),
                    headers={'Content-Type': 'application/json'}
                )
                try:
                    resp = urllib.request.urlopen(req, timeout=2)
                    print(f"  -> Forwarded to Dashboard! Status: {resp.status}")
                except Exception as ex:
                    print(f"  [WARN] Dashboard offline or unreachable: {ex}")

        except KeyboardInterrupt:
            print("\n[STOPPED] Serial bridge terminated by user.")
            break
        except Exception as e:
            time.sleep(0.5)


if __name__ == '__main__':
    port = sys.argv[1] if len(sys.argv) > 1 else None
    run_bridge(port)
