/*
  VITALIS reference sensor board: ESP32 + MAX30102 (+ optional MLX90614)
  Streams the VITALIS JSON-lines telemetry protocol over USB serial (115200 baud).

  Libraries (Arduino Library Manager):
    - SparkFun MAX3010x Pulse and Proximity Sensor Library
    - Adafruit MLX90614 Library
  Wiring (shared I2C): 3V3->VIN, GND->GND, GPIO21->SDA, GPIO22->SCL

  Prototype only. Not a medical device. Untested on hardware: verify before use.
*/
#include <Wire.h>
#include "MAX30105.h"
#include "spo2_algorithm.h"
#include <Adafruit_MLX90614.h>

MAX30105 pox;
Adafruit_MLX90614 mlx;
bool haveMlx = false;

const int N = 100;          // 4 s window at 25 samples/s
uint32_t irBuf[N], redBuf[N];

void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22);
  if (!pox.begin(Wire, I2C_SPEED_FAST)) {
    Serial.println("{\"error\":\"MAX30102 not found\"}");
    while (true) delay(1000);
  }
  // ledBrightness, sampleAverage, ledMode(2=red+IR), sampleRate, pulseWidth, adcRange
  pox.setup(60, 4, 2, 100, 411, 4096);
  haveMlx = mlx.begin();
}

void loop() {
  // Collect one window of samples.
  for (int i = 0; i < N; i++) {
    while (!pox.available()) pox.check();
    redBuf[i] = pox.getRed();
    irBuf[i] = pox.getIR();
    pox.nextSample();
  }
  int32_t spo2, hr;
  int8_t spo2Valid, hrValid;
  maxim_heart_rate_and_oxygen_saturation(irBuf, N, redBuf, &spo2, &spo2Valid, &hr, &hrValid);

  // Finger detection: very low IR means no finger on the sensor.
  bool finger = irBuf[N - 1] > 50000;

  Serial.print("{");
  bool first = true;
  if (finger && hrValid && hr > 25 && hr < 240) { Serial.print("\"hr\":"); Serial.print(hr); first = false; }
  if (finger && spo2Valid && spo2 > 50 && spo2 <= 100) { if (!first) Serial.print(","); Serial.print("\"spo2\":"); Serial.print(spo2); first = false; }
  if (haveMlx) {
    float t = mlx.readObjectTempC();  // skin temperature (lower than core)
    if (t > 30 && t < 43) { if (!first) Serial.print(","); Serial.print("\"temp\":"); Serial.print(t, 1); first = false; }
  }
  Serial.println("}");  // "{}" lines are ignored by VITALIS
}
