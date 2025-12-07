# ESP32 Bluetooth Setup Guide

This guide will help you set up your ESP32 board to receive navigation data from the web application via Bluetooth.

## Hardware Required

- ESP32 Development Board (any variant)
- USB cable for programming
- Computer with Arduino IDE

## Step 1: Install ESP32 Board Support in Arduino IDE

1. Open Arduino IDE
2. Go to **File > Preferences**
3. In "Additional Board Manager URLs", add:
   ```
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
4. Click **OK**
5. Go to **Tools > Board > Boards Manager**
6. Search for **"ESP32"**
7. Install **"esp32 by Espressif Systems"**
8. Wait for installation to complete

## Step 2: Install Required Library

The ESP32 BLE functionality is built-in, so no additional libraries are needed!

## Step 3: Upload Code to ESP32

1. Open `ESP32_Bluetooth_Receiver.ino` in Arduino IDE
2. Select your board:
   - **Tools > Board > ESP32 Arduino > ESP32 Dev Module** (or your specific board)
3. Select the port:
   - **Tools > Port > (Your ESP32 COM Port)**
   - If you don't see a port, install the ESP32 USB drivers
4. Click **Upload** (or press `Ctrl+U`)
5. Wait for "Done uploading" message

## Step 4: Open Serial Monitor

1. Go to **Tools > Serial Monitor** (or press `Ctrl+Shift+M`)
2. Set baud rate to **115200**
3. You should see:
   ```
   ===================================
   ESP32 BLE Navigation Receiver
   ===================================
   Initializing BLE...
   ✅ BLE Server Started!
   📱 Device Name: ESP32_Navigation
   🔵 Service UUID: 12345678-1234-1234-1234-123456789abc
   -----------------------------------
   Waiting for connection from web app...
   ```

## Step 5: Connect from Web App

1. Open the web application in Chrome/Edge/Opera
2. When prompted, click **"Connect Bluetooth Device"**
3. Look for **"ESP32_Navigation"** in the device list
4. Select it and pair
5. Once connected, you'll see on Serial Monitor:
   ```
   ✅ Device Connected!
   Ready to receive navigation data...
   ```

## Step 6: Test Navigation

1. In the web app, enter a destination
2. Click **"Start Navigation"**
3. Watch the Serial Monitor - you'll see navigation instructions appear in real-time:
   ```
   📍 Navigation Instruction: In 200m, Turn right onto Main Street
   ⏰ Time: 45
   -----------------------------------
   📍 Navigation Instruction: Turn right onto Main Street
   ⏰ Time: 47
   -----------------------------------
   ```

## Troubleshooting

### ESP32 Not Appearing in Bluetooth Scan

- **Check Serial Monitor**: Make sure ESP32 shows "BLE Server Started"
- **Restart ESP32**: Unplug and replug the USB cable
- **Check Bluetooth**: Ensure Bluetooth is enabled on your computer/phone
- **Try different browser**: Use Chrome or Edge (Opera also works)

### Connection Fails

- **Check UUIDs match**: The web app and ESP32 must use the same Service UUID
- **Restart both**: Restart ESP32 and refresh the web page
- **Check Serial Monitor**: Look for error messages

### No Data Received

- **Verify connection**: Serial Monitor should show "Device Connected"
- **Check web app**: Make sure navigation is started
- **Serial Monitor baud rate**: Must be set to 115200

### Upload Errors

- **Wrong board selected**: Make sure you selected an ESP32 board
- **Wrong port**: Select the correct COM port
- **Drivers missing**: Install ESP32 USB drivers (CP2102 or CH340)

## Customization

### Change Device Name

In `ESP32_Bluetooth_Receiver.ino`, change:
```cpp
#define DEVICE_NAME "ESP32_Navigation"
```
to your preferred name.

### Change Service UUIDs

If you need custom UUIDs, update both:
1. **ESP32 code**: Change `SERVICE_UUID` and `CHARACTERISTIC_UUID`
2. **Web app**: Update `NAVIGATION_SERVICE_UUID` and `NAVIGATION_CHARACTERISTIC_UUID` in `src/services/bluetooth.ts`

## Features

- ✅ Real-time navigation instruction display
- ✅ Connection status monitoring
- ✅ Automatic reconnection support
- ✅ Timestamp for each instruction
- ✅ Clean, formatted Serial Monitor output

## Example Serial Monitor Output

```
===================================
ESP32 BLE Navigation Receiver
===================================
Initializing BLE...
✅ BLE Server Started!
📱 Device Name: ESP32_Navigation
🔵 Service UUID: 12345678-1234-1234-1234-123456789abc
-----------------------------------
Waiting for connection from web app...
✅ Device Connected!
Ready to receive navigation data...
-----------------------------------
📍 Navigation Instruction: start
⏰ Time: 5
-----------------------------------
📍 Navigation Instruction: In 500m, Turn left onto Oak Avenue
⏰ Time: 8
-----------------------------------
📍 Navigation Instruction: Turn left onto Oak Avenue
⏰ Time: 12
-----------------------------------
📍 Navigation Instruction: In 200m, Turn right onto Main Street
⏰ Time: 15
-----------------------------------
📍 Navigation Instruction: You have arrived at your destination
⏰ Time: 20
-----------------------------------
```

Enjoy receiving navigation data on your ESP32! 🚀

