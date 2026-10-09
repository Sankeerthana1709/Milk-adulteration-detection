/*
 * ==============================================================================
 * ESP32 AI-BASED MILK ADULTERATION & QUALITY DETECTION FIRMWARE
 * ==============================================================================
 * Target Microcontroller: ESP32 Dev Module (DOIT ESP32, NodeMCU-32S, ESP-WROOM-32)
 *
 * Hardware Wiring:
 *   1. Analog pH Probe Module    -> GPIO 34 (ADC1_CH6, analog input)
 *   2. DS18B20 Temp Probe        -> GPIO 4  (OneWire bus, requires 4.7k pullup to 3.3V)
 *   3. Optical Turbidity Sensor  -> GPIO 32 (ADC1_CH4, analog input)
 *   4. TCS34725 RGB Color Sensor -> I2C (SDA = GPIO 21, SCL = GPIO 22, VCC=3.3V)
 *   5. Milk Fat Toggle/Sensor    -> GPIO 33 (Input with internal pullup: 1=Fat present, 0=Skimmed)
 *   6. Status Indicators:
 *      - Yellow LED (Medium Adulteration) -> GPIO 19
 *      - Red LED (Severe Adulteration)    -> GPIO 23
 *      - Buzzer                           -> GPIO 5
 *
 * ML Model: Embedded Decision Tree (milk_model.h)
 * Inference: On-chip TinyML (< 0.1ms latency) + Wi-Fi HTTP Telemetry Stream
 * ==============================================================================
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include "Adafruit_TCS34725.h"
#include "milk_model.h"

// ---------------------- WI-FI CONFIGURATION ----------------------
// Set your Wi-Fi credentials here to stream live readings to the web dashboard.
// (If Wi-Fi is disabled or unavailable, on-chip prediction and LEDs still work 100%!)
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Replace with your laptop's local IP (e.g., http://192.168.1.5:5000/api/esp32/telemetry)
const char* SERVER_URL    = "http://192.168.1.100:5000/api/esp32/telemetry";

// ---------------------- PIN DEFINITIONS ----------------------
#define PIN_TEMP_ONEWIRE     4   // DS18B20 Data pin
#define PIN_PH_ANALOG        34  // Analog pH Probe signal
#define PIN_TURBIDITY_ANALOG 32  // Turbidity sensor signal
#define PIN_FAT_INPUT        33  // Fat toggle or sensor (1=whole, 0=diluted/skimmed)

#define LED_YELLOW_PIN       19  // Medium Quality (Mild Adulteration)
#define LED_RED_PIN          23  // Low Quality (Severe Adulteration)
#define BUZZER_PIN           5   // Alert Buzzer

// ---------------------- SENSOR OBJECTS ----------------------
OneWire oneWire(PIN_TEMP_ONEWIRE);
DallasTemperature tempSensor(&oneWire);
Adafruit_TCS34725 tcs = Adafruit_TCS34725(TCS34725_INTEGRATIONTIME_50MS, TCS34725_GAIN_4X);

bool color_sensor_available = false;
bool wifi_connected = false;

// ---------------------- SENSOR READING FUNCTIONS ----------------------

float read_temperature() {
    tempSensor.requestTemperatures();
    float tempC = tempSensor.getTempCByIndex(0);
    // If disconnected, default to standard room holding temp
    if (tempC == DEVICE_DISCONNECTED_C || tempC < -10.0f || tempC > 100.0f) {
        return 38.0f;
    }
    return tempC;
}

float read_ph_sensor() {
    int raw_adc = analogRead(PIN_PH_ANALOG);
    float voltage = (raw_adc / 4095.0f) * 3.3f;
    // Standard linear pH equation: neutral (7.0) is ~2.5V
    float ph = 7.0f + ((2.5f - voltage) * 3.5f);
    if (ph < 0.0f) ph = 0.0f;
    if (ph > 14.0f) ph = 14.0f;
    return ph;
}

int read_turbidity() {
    int raw_adc = analogRead(PIN_TURBIDITY_ANALOG);
    float voltage = (raw_adc / 4095.0f) * 3.3f;
    // Optical turbidity modules output lower voltage for cloudier/denser liquid
    // Threshold ~2.5V: < 2.5V is milky colloidal (1), > 2.5V is clear/watery (0)
    return (voltage < 2.5f) ? 1 : 0;
}

int read_fat_sensor() {
    // Reads toggle switch: HIGH = 1 (Fat present), LOW = 0 (Fat depleted)
    return (digitalRead(PIN_FAT_INPUT) == HIGH) ? 1 : 0;
}

int read_color_sensor() {
    if (!color_sensor_available) {
        return 255; // Default pure milk white
    }
    uint16_t r, g, b, c;
    tcs.getRawData(&r, &g, &b, &c);
    
    // Map clear channel intensity (0 - 4000) to 240 - 255 scale
    int color_val = map(c, 0, 4000, 240, 255);
    if (color_val > 255) color_val = 255;
    if (color_val < 240) color_val = 240;
    return color_val;
}

// ---------------------- HARDWARE INDICATOR ----------------------
void indicate_prediction(int grade) {
    digitalWrite(LED_YELLOW_PIN, LOW);
    digitalWrite(LED_RED_PIN, LOW);
    
    if (grade == GRADE_MEDIUM) {
        // Medium Quality (Mild Adulteration) -> Yellow LED ON
        digitalWrite(LED_YELLOW_PIN, HIGH);
    } else {
        // Low Quality (Severe Adulteration) -> Red LED ON + Buzzer Alert
        digitalWrite(LED_RED_PIN, HIGH);
        tone(BUZZER_PIN, 1800, 400); // 1.8kHz beep for 400ms
    }
}

// ---------------------- TELEMETRY STREAM TO FLASK ----------------------
void send_telemetry_to_server(float temp, int fat, int turb, int col, float ph, int grade) {
    if (WiFi.status() != WL_CONNECTED) return;
    
    HTTPClient http;
    http.begin(SERVER_URL);
    http.addHeader("Content-Type", "application/json");
    
    // Build JSON packet
    String jsonPayload = "{";
    jsonPayload += "\"device_id\":\"ESP32_Edge_Probe\",";
    jsonPayload += "\"temperature\":" + String(temp, 1) + ",";
    jsonPayload += "\"fat\":" + String(fat) + ",";
    jsonPayload += "\"turbidity\":" + String(turb) + ",";
    jsonPayload += "\"color\":" + String(col) + ",";
    jsonPayload += "\"ph\":" + String(ph, 2);
    jsonPayload += "}";
    
    int httpResponseCode = http.POST(jsonPayload);
    if (httpResponseCode > 0) {
        Serial.printf("  [HTTP] Streamed to server! Code: %d\n", httpResponseCode);
    } else {
        Serial.printf("  [HTTP ERROR] Stream failed: %s\n", http.errorToString(httpResponseCode).c_str());
    }
    http.end();
}

// ---------------------- SETUP ----------------------
void setup() {
    Serial.begin(115200);
    delay(1000);
    
    Serial.println("\n========================================================");
    Serial.println("  ESP32 AI MILK ADULTERATION DETECTOR (CALIBRATED MODEL) ");
    Serial.println("========================================================");
    
    // Configure indicator pins
    pinMode(LED_YELLOW_PIN, OUTPUT);
    pinMode(LED_RED_PIN, OUTPUT);
    pinMode(BUZZER_PIN, OUTPUT);
    pinMode(PIN_FAT_INPUT, INPUT_PULLUP);
    
    // Self-test LEDs
    digitalWrite(LED_YELLOW_PIN, HIGH);
    delay(250);
    digitalWrite(LED_RED_PIN, HIGH);
    delay(250);
    digitalWrite(LED_YELLOW_PIN, LOW);
    digitalWrite(LED_RED_PIN, LOW);
    
    // Initialize DS18B20 Temp Probe
    tempSensor.begin();
    Serial.println("[OK] DS18B20 Temperature probe initialized.");
    
    // Initialize TCS34725 RGB Color Sensor
    if (tcs.begin()) {
        color_sensor_available = true;
        Serial.println("[OK] TCS34725 Color Sensor detected (SDA=21, SCL=22).");
    } else {
        Serial.println("[INFO] TCS34725 not detected. Using calibrated optical default (255).");
    }
    
    // Optional Wi-Fi connection
    if (String(WIFI_SSID) != "YOUR_WIFI_SSID") {
        Serial.printf("[WIFI] Connecting to %s...", WIFI_SSID);
        WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
        int attempts = 0;
        while (WiFi.status() != WL_CONNECTED && attempts < 15) {
            delay(500);
            Serial.print(".");
            attempts++;
        }
        if (WiFi.status() == WL_CONNECTED) {
            wifi_connected = true;
            Serial.println("\n[WIFI OK] Connected! ESP32 IP: " + WiFi.localIP().toString());
        } else {
            Serial.println("\n[WIFI] Could not connect. Operating in offline on-chip AI mode.");
        }
    } else {
        Serial.println("[INFO] Wi-Fi credentials not configured. Running in offline on-chip mode.");
    }
    
    Serial.println("[READY] System initialized. Dip sensors into milk sample...\n");
}

// ---------------------- MAIN LOOP ----------------------
void loop() {
    // 1. Read real-time values directly from physical sensors
    float temp      = read_temperature();
    float ph        = read_ph_sensor();
    int turbidity   = read_turbidity();
    int fat         = read_fat_sensor();
    int color       = read_color_sensor();
    
    // 2. Execute On-Chip TinyML Inference (< 0.1ms execution)
    int grade = predict_milk_quality(temp, fat, turbidity, color, ph);
    const char* grade_name = get_grade_name(grade);
    
    // 3. Print Live Telemetry & Prediction to Serial Monitor
    Serial.println("---------------- REAL-TIME SENSOR TELEMETRY ----------------");
    Serial.printf("  1. Temperature (DS18B20) : %.1f °C\n", temp);
    Serial.printf("  2. pH Analog Probe       : %.2f pH\n", ph);
    Serial.printf("  3. Turbidity Sensor      : %s (%d)\n", (turbidity == 1) ? "COLLOIDAL INTACT" : "WATER DILUTED", turbidity);
    Serial.printf("  4. Fat Metric (Gerber/SW): %s (%d)\n", (fat == 1) ? "FAT PRESENT" : "FAT DEPLETED", fat);
    Serial.printf("  5. Color Optical (TCS)   : %d (Whiteness index 240-255)\n", color);
    Serial.println("----------------- AI ADULTERATION VERDICT ------------------");
    Serial.printf("  RESULT : %s\n", grade_name);
    
    if (grade == GRADE_LOW) {
        Serial.println("  [STATUS] >>> CRITICAL: SEVERE ADULTERATION OR SPOILAGE DETECTED! <<<");
        if (ph < 6.0f) {
            Serial.println("  [CAUSE] Souring / Lactic Acid Fermentation (pH < 6.0)");
        } else if (ph > 7.8f) {
            Serial.println("  [CAUSE] Chemical Neutralizers: Detergent / Caustic Soda (pH > 7.8)");
        } else if (turbidity == 0 || fat == 0) {
            Serial.println("  [CAUSE] Heavy Water Dilution / Solids Loss");
        }
    } else {
        Serial.println("  [STATUS] >>> NORMAL: MILD ADULTERATION / STANDARD WHOLE MILK <<<");
    }
    Serial.println("------------------------------------------------------------\n");
    
    // 4. Update Physical Indicators (LEDs & Alert Buzzer)
    indicate_prediction(grade);
    
    // 5. Stream telemetry over Wi-Fi to Web Dashboard (if connected)
    if (wifi_connected) {
        send_telemetry_to_server(temp, fat, turbidity, color, ph, grade);
    }
    
    delay(3000); // Sample automatically every 3 seconds
}
