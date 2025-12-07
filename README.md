# Real-time Map Navigation App with Bluetooth Support

A single-page web application that provides real-time navigation with turn-by-turn instructions sent via Bluetooth to ESP32 devices.

## Features

- 🗺️ **Full-screen Google Maps** with real-time location tracking
- 🔍 **Destination Search** using Google Places Autocomplete
- 🧭 **Turn-by-turn Navigation** with live route tracking
- 🔵 **Bluetooth Low Energy (BLE)** integration for sending instructions to ESP32
- 📱 **Mobile-responsive** design
- 🎯 **Live Instruction Updates** - Current navigation instruction is sent via Bluetooth in real-time
- 📡 **ESP32 Compatible** - Works with ESP32 boards for receiving navigation data

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Google Maps API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the following APIs:
   - Maps JavaScript API
   - Places API
   - Directions API
   - Geocoding API
4. Create an API key and restrict it to your domain
5. Copy the API key

### 3. Environment Variables

1. Create a `.env` file in the project root:
   ```bash
   # On Windows, create .env file manually
   ```

2. Add your Google Maps API key:
   ```env
   VITE_GOOGLE_MAPS_API_KEY=your-actual-google-maps-api-key
   ```

### 4. ESP32 Setup (Optional)

If you want to receive navigation data on an ESP32 board:

1. **📖 See [ESP32_SETUP.md](./ESP32_SETUP.md) for complete ESP32 setup instructions**

2. Upload the Arduino code to your ESP32
3. Connect from the web app to your ESP32 device
4. Navigation instructions will appear on ESP32 Serial Monitor

### 5. Run the Application

```bash
npm run dev
```

The app will be available at `http://localhost:5173` (or the port shown in the terminal).

## How It Works

1. **On Load**: The app requests Bluetooth connection and location permission
2. **Connect Bluetooth**: Select your ESP32 device from the Bluetooth device list
3. **Search Destination**: Use the search bar to find and select a destination
4. **Calculate Route**: The app calculates the route from your current location to the destination
5. **Start Navigation**: Click "Start Navigation" to begin live tracking
6. **Real-time Updates**: As you move, the app:
   - Tracks your current position
   - Determines which turn-by-turn step you're on
   - Formats the instruction (e.g., "In 500m, turn left on Main St.")
   - Sends the instruction via Bluetooth to your ESP32 device

## Bluetooth Data Transmission

The app sends navigation instructions via Bluetooth Low Energy (BLE):
- **Service UUID**: `12345678-1234-1234-1234-123456789abc`
- **Characteristic UUID**: `12345678-1234-1234-1234-123456789abd`
- **Data Format**: Plain text navigation instructions
- **Real-time**: Updates sent continuously as you navigate

## Building for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

## Deployment

**📖 See [VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md) for complete deployment instructions to Vercel**

Quick deploy:
1. Push code to GitHub
2. Import to Vercel
3. Add `VITE_GOOGLE_MAPS_API_KEY` environment variable
4. Deploy!

## Technologies Used

- **React 19** with TypeScript
- **Vite** - Build tool and dev server
- **Google Maps JavaScript API** - Maps and navigation
- **Web Bluetooth API** - Bluetooth Low Energy communication
- **Geolocation API** - Location tracking
- **ESP32** - Bluetooth receiver (Arduino)

## Browser Compatibility

### Web App
- ✅ Chrome/Edge (recommended for Bluetooth)
- ✅ Opera (Bluetooth supported)
- ⚠️ Firefox (Bluetooth not supported)
- ⚠️ Safari (Bluetooth not supported)
- Requires HTTPS for Bluetooth (or localhost for development)

### ESP32
- Any ESP32 development board
- Arduino IDE for programming

## License

MIT


