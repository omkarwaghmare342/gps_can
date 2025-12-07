/*
 * ESP32 Bluetooth Low Energy (BLE) Receiver for GPS Navigation App
 * 
 * This code sets up an ESP32 as a BLE peripheral that receives
 * navigation instructions from the web application and displays
 * them on the Serial Monitor.
 * 
 * Hardware Required:
 * - ESP32 Development Board
 * 
 * Instructions:
 * 1. Install ESP32 board support in Arduino IDE:
 *    - File > Preferences > Additional Board Manager URLs
 *    - Add: https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
 *    - Tools > Board > Boards Manager > Search "ESP32" > Install
 * 2. Select Board: Tools > Board > ESP32 Arduino > Your ESP32 Board
 * 3. Select Port: Tools > Port > (Your ESP32 COM Port)
 * 4. Upload this code to ESP32
 * 5. Open Serial Monitor (115200 baud)
 * 
 * Connection:
 * - The web app will search for and connect to this ESP32 device
 * - Navigation instructions will appear on Serial Monitor in real-time
 */

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// Custom Service and Characteristic UUIDs for Navigation Data
// These match what the web app will use
#define SERVICE_UUID        "12345678-1234-1234-1234-123456789abc"
#define CHARACTERISTIC_UUID "12345678-1234-1234-1234-123456789abd"

// BLE Server and Characteristic objects
BLEServer* pServer = NULL;
BLECharacteristic* pCharacteristic = NULL;
bool deviceConnected = false;
bool oldDeviceConnected = false;

// Device name that will appear in Bluetooth scan
#define DEVICE_NAME "ESP32_Navigation"

// Callback class for server events
class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
      deviceConnected = true;
      Serial.println("✅ Device Connected!");
      Serial.println("Ready to receive navigation data...");
      Serial.println("-----------------------------------");
    }

    void onDisconnect(BLEServer* pServer) {
      deviceConnected = false;
      Serial.println("❌ Device Disconnected");
      Serial.println("Waiting for connection...");
      Serial.println("-----------------------------------");
    }
};

// Callback class for characteristic write events
class MyCallbacks: public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic *pCharacteristic) {
      std::string value = pCharacteristic->getValue();
      
      if (value.length() > 0) {
        Serial.print("📍 Navigation Instruction: ");
        
        // Print the received data
        for (int i = 0; i < value.length(); i++) {
          Serial.print((char)value[i]);
        }
        Serial.println();
        
        // Optional: Add timestamp
        Serial.print("⏰ Time: ");
        Serial.println(millis() / 1000); // Time in seconds since boot
        Serial.println("-----------------------------------");
      }
    }
};

void setup() {
  // Initialize Serial Monitor
  Serial.begin(115200);
  Serial.println();
  Serial.println("===================================");
  Serial.println("ESP32 BLE Navigation Receiver");
  Serial.println("===================================");
  Serial.println("Initializing BLE...");
  
  // Initialize BLE Device
  BLEDevice::init(DEVICE_NAME);
  
  // Create BLE Server
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());
  
  // Create BLE Service
  BLEService *pService = pServer->createService(SERVICE_UUID);
  
  // Create BLE Characteristic for receiving data
  pCharacteristic = pService->createCharacteristic(
                      CHARACTERISTIC_UUID,
                      BLECharacteristic::PROPERTY_READ   |
                      BLECharacteristic::PROPERTY_WRITE  |
                      BLECharacteristic::PROPERTY_WRITE_NR
                    );
  
  // Set callbacks for characteristic
  pCharacteristic->setCallbacks(new MyCallbacks());
  
  // Start the service
  pService->start();
  
  // Start advertising (make device discoverable)
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06);  // Functions that help with iPhone connections issue
  pAdvertising->setMinPreferred(0x12);
  BLEDevice::startAdvertising();
  
  Serial.println("✅ BLE Server Started!");
  Serial.print("📱 Device Name: ");
  Serial.println(DEVICE_NAME);
  Serial.print("🔵 Service UUID: ");
  Serial.println(SERVICE_UUID);
  Serial.println("-----------------------------------");
  Serial.println("Waiting for connection from web app...");
  Serial.println("(Make sure Bluetooth is enabled on your device)");
  Serial.println("===================================");
}

void loop() {
  // Handle disconnection
  if (!deviceConnected && oldDeviceConnected) {
    delay(500); // Give the bluetooth stack the chance to get things ready
    pServer->startAdvertising(); // Restart advertising
    Serial.println("🔄 Restarting advertising...");
    oldDeviceConnected = deviceConnected;
  }
  
  // Handle connection
  if (deviceConnected && !oldDeviceConnected) {
    oldDeviceConnected = deviceConnected;
  }
  
  // Small delay to prevent CPU spinning
  delay(100);
}

