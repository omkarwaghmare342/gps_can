# Real-time Map Navigation App with Firebase Instruction Sync

A single-page web application that provides real-time navigation with turn-by-turn instructions synced to Firebase Realtime Database.

## Features

- 🗺️ **Full-screen Google Maps** with real-time location tracking
- 🔍 **Destination Search** using Google Places Autocomplete
- 🧭 **Turn-by-turn Navigation** with live route tracking
- 🔥 **Firebase Realtime Database** integration for instruction sync
- 📱 **Mobile-responsive** design
- 🎯 **Live Instruction Updates** - Current navigation instruction is pushed to Firebase in real-time

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

### 3. Configure Firebase

**📖 For detailed Firebase setup instructions, see [FIREBASE_SETUP.md](./FIREBASE_SETUP.md)**

Quick setup:
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or select an existing one
3. Enable **Realtime Database**
4. Set up database rules (for development):
   ```json
   {
     "rules": {
       "current_instruction": {
         ".read": true,
         ".write": true
       }
     }
   }
   ```
5. Copy your Firebase configuration values from Project Settings → Your apps → Web app

### 4. Environment Variables

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   (On Windows, you can manually create `.env` file)

2. Fill in your API keys and Firebase configuration in `.env`:
   ```env
   VITE_GOOGLE_MAPS_API_KEY=your-actual-google-maps-api-key
   VITE_FIREBASE_API_KEY=your-actual-firebase-api-key
   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   VITE_FIREBASE_DATABASE_URL=https://your-project-default-rtdb.firebaseio.com
   VITE_FIREBASE_PROJECT_ID=your-project-id
   VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
   VITE_FIREBASE_APP_ID=your-app-id
   ```

### 5. Run the Application

```bash
npm run dev
```

The app will be available at `http://localhost:5173` (or the port shown in the terminal).

## How It Works

1. **On Load**: The app requests location permission and centers the map on your current location
2. **Search Destination**: Use the search bar to find and select a destination
3. **Calculate Route**: The app calculates the route from your current location to the destination
4. **Start Navigation**: Click "Start Navigation" to begin live tracking
5. **Real-time Updates**: As you move, the app:
   - Tracks your current position
   - Determines which turn-by-turn step you're on
   - Formats the instruction (e.g., "In 500m, turn left on Main St.")
   - Updates the `/current_instruction` field in Firebase Realtime Database

## Firebase Database Structure

The app writes to a single field in Firebase Realtime Database:

```
/current_instruction: "In 500m, turn left on Main St."
```

This field is continuously updated as you navigate, always showing the next instruction you need to follow.

## Building for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

## Technologies Used

- **React 19** with TypeScript
- **Vite** - Build tool and dev server
- **Google Maps JavaScript API** - Maps and navigation
- **Firebase Realtime Database** - Instruction sync
- **Geolocation API** - Location tracking

## Browser Compatibility

- Chrome/Edge (recommended)
- Firefox
- Safari (iOS 13+)
- Requires HTTPS for geolocation (or localhost for development)

## License

MIT


