import { useEffect, useRef, useState } from 'react';
import { bluetoothService } from '../services/bluetooth';
import type { BluetoothDeviceInfo as BluetoothDevice } from '../services/bluetooth';
import BluetoothConnection from './BluetoothConnection';
import './NavigationApp.css';

// Declare window.google for Google Maps
declare global {
  interface Window {
    google: any;
    initMap: () => void;
  }
}

interface RouteStep {
  distance: google.maps.Distance;
  duration: google.maps.Duration;
  instructions: string;
  start_location: google.maps.LatLng;
  end_location: google.maps.LatLng;
  maneuver?: string;
  /** Detailed polyline points for this step — used for accurate distance snapping */
  path: google.maps.LatLng[];
}

const NavigationApp = () => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const directionsServiceRef = useRef<google.maps.DirectionsService | null>(null);
  const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
  const routePathRef = useRef<google.maps.Polyline | null>(null);
  const originMarkerRef = useRef<google.maps.Marker | null>(null);
  const destinationMarkerRef = useRef<google.maps.Marker | null>(null);
  const userManuallyZoomedRef = useRef<boolean>(false);
  const markerAnimationFrameRef = useRef<number | null>(null);
  const lastMarkerPositionRef = useRef<google.maps.LatLng | null>(null);
  const originAutocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const destinationAutocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const routeStepsRef = useRef<RouteStep[]>([]);
  const currentStepIndexRef = useRef<number>(0);
  const userMarkerRef = useRef<google.maps.Marker | null>(null);
  const routeInfoRef = useRef<{ distance: string; duration: string } | null>(null);
  const traveledPathCoordinatesRef = useRef<google.maps.LatLng[]>([]);
  // Ref mirror of currentLocation so updateCurrentInstruction never captures a stale closure value
  const currentLocationRef = useRef<google.maps.LatLng | null>(null);
  // Tracks which step index has already had its TURN command sent to avoid flooding ESP32
  const turnSentForStepRef = useRef<number>(-1);

  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<google.maps.LatLng | null>(null);
  // Helper that keeps both state and ref in sync – avoids stale closure in callbacks
  const setCurrentLocationSync = (loc: google.maps.LatLng | null) => {
    currentLocationRef.current = loc;
    setCurrentLocation(loc);
  };
  const [origin, setOrigin] = useState<string>('');
  const [originLocation, setOriginLocation] = useState<google.maps.LatLng | null>(null);
  const [destination, setDestination] = useState<string>('');
  const [destinationLocation, setDestinationLocation] = useState<google.maps.LatLng | null>(null);
  const [currentInstruction, setCurrentInstruction] = useState<string>('');
  const [locationError, setLocationError] = useState<string>('');
  const [hasRoute, setHasRoute] = useState(false);
  const [travelMode, setTravelMode] = useState<google.maps.TravelMode | string>('DRIVING');
  const [routeInfo, setRouteInfo] = useState<{ distance: string; duration: string } | null>(null);
  const [useMyLocation, setUseMyLocation] = useState(true);
  const [previousLocation, setPreviousLocation] = useState<google.maps.LatLng | null>(null);
  const [actualHeading, setActualHeading] = useState<number>(0);
  const [traveledPathRef, setTraveledPathRef] = useState<google.maps.Polyline | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  
  // Logging function
  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] ${message}`;
    setLogs(prev => [...prev.slice(-99), logMessage]); // Keep last 100 logs
    console.log(logMessage);
  };

  // Copy logs to clipboard
  const copyLogs = () => {
    const logsText = logs.join('\n');
    navigator.clipboard.writeText(logsText).then(() => {
      addLog('Logs copied to clipboard');
    }).catch(err => {
      addLog('Failed to copy logs: ' + err);
    });
  };
  // GPS smoothing and filtering refs
  const smoothedLocationRef = useRef<google.maps.LatLng | null>(null);
  const lastLocationUpdateRef = useRef<number>(0);
  const LOCATION_UPDATE_THRESHOLD = 10; // meters
  const LOCATION_UPDATE_INTERVAL = 1000; // ms
  const KALMAN_PROCESS_NOISE = 0.01;
  const KALMAN_MEASUREMENT_NOISE = 5;
  const kalmanStateRef = useRef<{ lat: number; lng: number; variance: number } | null>(null);

  const loadGoogleMapsScript = (apiKey: string) => {
    addLog('Loading Google Maps with API key: ' + (apiKey ? 'configured' : 'missing'));
    if (!apiKey || apiKey === 'your-google-maps-api-key') {
      console.error('NavigationApp: API key not configured');
      addLog('ERROR: Google Maps API key not configured');
      setLocationError('Please configure your Google Maps API key in .env file');
      setIsMapLoaded(true);
      return;
    }

    // Check if script is already loaded
    if (window.google && window.google.maps) {
      console.log('NavigationApp: Google Maps already loaded');
      addLog('Google Maps already loaded');
      setTimeout(() => initializeMap(), 100);
      return;
    }

    // Create a unique callback name
    const callbackName = `initMap_${Date.now()}`;
    console.log('NavigationApp: Setting up callback:', callbackName);
    
    (window as any)[callbackName] = () => {
      console.log('NavigationApp: Google Maps callback triggered');
      addLog('Google Maps loaded successfully');
      setTimeout(() => {
        initializeMap();
        delete (window as any)[callbackName];
      }, 100);
    };

    const script = document.createElement('script');
    const scriptUrl = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry&callback=${callbackName}`;
    console.log('NavigationApp: Loading script:', scriptUrl);
    script.src = scriptUrl;
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';
    script.onerror = (error) => {
      console.error('NavigationApp: Script load error:', error);
      addLog('ERROR: Failed to load Google Maps script');
      setLocationError('Failed to load Google Maps. Please check your internet connection and API key.');
      setIsMapLoaded(true);
      // Retry once after delay
      setTimeout(() => {
        if (!window.google || !window.google.maps) {
          console.log('NavigationApp: Retrying Google Maps load...');
          addLog('Retrying Google Maps load...');
          loadGoogleMapsScript(apiKey);
        }
      }, 3000);
    };
    script.onload = () => {
      console.log('NavigationApp: Script loaded successfully');
      addLog('Google Maps script loaded');
    };
    
    document.head.appendChild(script);
  };

  useEffect(() => {
    console.log('NavigationApp: Component mounted');
    addLog('Navigation component mounted');
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
    console.log('NavigationApp: API Key loaded:', apiKey ? 'Yes' : 'No');
    addLog('API Key status: ' + (apiKey ? 'configured' : 'missing'));
    
    loadGoogleMapsScript(apiKey);

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  // Initialize traveled path when navigation starts
  useEffect(() => {
    if (isNavigating && currentLocation) {
      traveledPathCoordinatesRef.current = [currentLocation];
      // Clear previous traveled path
      if (traveledPathRef) {
        traveledPathRef.setMap(null);
        setTraveledPathRef(null);
      }
    }
  }, [isNavigating, currentLocation]);

  // Control custom markers visibility based on navigation state
  useEffect(() => {
    if (originMarkerRef.current) {
      originMarkerRef.current.setVisible(!isNavigating);
    }
    if (destinationMarkerRef.current) {
      destinationMarkerRef.current.setVisible(!isNavigating);
    }
  }, [isNavigating]);

  // Update directions renderer markers based on navigation state
  useEffect(() => {
    if (directionsRendererRef.current) {
      directionsRendererRef.current.setOptions({
        suppressMarkers: isNavigating,
        markerOptions: {
          visible: !isNavigating,
        },
      });
    }
  }, [isNavigating]);

  // NOTE: updateCurrentInstruction is called directly inside the watchPosition callback
  // using currentLocationRef so it always has the live position. No separate effect needed.

  const calculateHeadingFromPoints = (from: google.maps.LatLng, to: google.maps.LatLng): number => {
    const spherical = window.google.maps.geometry.spherical;
    return spherical.computeHeading(from, to);
  };

  // Listen to device compass and rotate map/arrow accordingly
  useEffect(() => {
    const handleOrientation = (event: DeviceOrientationEvent) => {
      const compassHeading = (event as any).webkitCompassHeading;
      const alpha = typeof compassHeading === 'number' ? compassHeading : event.alpha;
      if (typeof alpha === 'number') {
        // Convert compass heading to map heading (compass points to magnetic north, maps use true north)
        const normalized = (360 - alpha + 90) % 360;

        if (mapInstanceRef.current && !isNavigating) {
          try {
            mapInstanceRef.current.setHeading(normalized);
            mapInstanceRef.current.setTilt(45);
          } catch {
            // Some map types do not support heading/tilt; ignore
          }
        }

        // Only use compass for marker rotation when not navigating (GPS heading is more accurate)
        if (userMarkerRef.current && !isNavigating) {
          const currentIcon = userMarkerRef.current.getIcon() as google.maps.Symbol;
          if (currentIcon) {
            userMarkerRef.current.setIcon({
              ...currentIcon,
              rotation: normalized
            });
          }
        }
      }
    };

    const addListeners = async () => {
      if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return;

      // iOS requires permission
      const anyDO = DeviceOrientationEvent as any;
      if (typeof anyDO?.requestPermission === 'function') {
        try {
          const response = await anyDO.requestPermission();
          if (response === 'granted') {
            window.addEventListener('deviceorientation', handleOrientation, true);
          }
        } catch (err) {
          console.warn('Device orientation permission denied or unavailable:', err);
        }
      } else {
        window.addEventListener('deviceorientationabsolute', handleOrientation, true);
        window.addEventListener('deviceorientation', handleOrientation, true);
      }
    };

    addListeners();

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation, true);
      window.removeEventListener('deviceorientationabsolute', handleOrientation, true);
    };
  }, []);

  const initializeMap = () => {
    console.log('initializeMap: Starting map initialization');
    addLog('Initializing map...');
    try {
      if (!mapRef.current) {
        console.error('initializeMap: Map container not found');
        addLog('ERROR: Map container not found');
        setLocationError('Map container not found');
        setIsMapLoaded(true);
        return;
      }

      if (!window.google || !window.google.maps) {
        console.error('initializeMap: Google Maps API not loaded');
        addLog('ERROR: Google Maps API not loaded');
        setLocationError('Google Maps API failed to load. Please refresh the page.');
        setIsMapLoaded(true);
        return;
      }

      console.log('initializeMap: Creating map instance');
      addLog('Creating map instance');
      // Initialize map
      const map = new window.google.maps.Map(mapRef.current, {
        zoom: 15,
        center: { lat: 0, lng: 0 },
        mapTypeControl: false,
        fullscreenControl: true,
        streetViewControl: false,
        rotateControl: true,
        rotateControlOptions: {
          position: window.google.maps.ControlPosition.TOP_RIGHT,
        },
        gestureHandling: 'cooperative',
      });

      mapInstanceRef.current = map;
      console.log('initializeMap: Map instance created');
      addLog('Map instance created successfully');

      // Add zoom change listener to detect manual zoom
      map.addListener('zoom_changed', () => {
        userManuallyZoomedRef.current = true;
        // Reset manual zoom flag after 10 seconds of no zoom changes
        setTimeout(() => {
          userManuallyZoomedRef.current = false;
        }, 10000);
      });

      // Initialize Directions Service and Renderer
      directionsServiceRef.current = new window.google.maps.DirectionsService();
      directionsRendererRef.current = new window.google.maps.DirectionsRenderer({
        map: map,
        suppressMarkers: false, // We'll control markers manually
        polylineOptions: {
          strokeColor: '#4285F4',
          strokeWeight: 5,
          strokeOpacity: 0.8,
        },
        markerOptions: {
          visible: true,
        },
      });

      console.log('initializeMap: Directions service initialized');
      addLog('Directions service initialized');
      setIsMapLoaded(true);
      requestLocationPermission();
    } catch (error) {
      console.error('initializeMap: Error initializing map:', error);
      addLog('ERROR: Map initialization failed - ' + error);
      setLocationError(`Error initializing map: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsMapLoaded(true);
    }
  };

  // Initialize Places Autocomplete for both origin and destination
  useEffect(() => {
    if (!isMapLoaded || !window.google || !window.google.maps || !window.google.maps.places) {
      return;
    }

    // Clear previous autocomplete instances
    if (originAutocompleteRef.current) {
      window.google.maps.event.clearInstanceListeners(originAutocompleteRef.current);
      originAutocompleteRef.current = null;
    }
    if (destinationAutocompleteRef.current) {
      window.google.maps.event.clearInstanceListeners(destinationAutocompleteRef.current);
      destinationAutocompleteRef.current = null;
    }

    // Wait a bit for DOM to be ready
    const timer = setTimeout(() => {
      // Initialize origin autocomplete
      const originInput = document.getElementById('origin-input') as HTMLInputElement;
      if (originInput && !originAutocompleteRef.current) {
        try {
          const autocomplete = new window.google.maps.places.Autocomplete(originInput, {
            fields: ['geometry', 'formatted_address'],
          });
          originAutocompleteRef.current = autocomplete;

          autocomplete.addListener('place_changed', () => {
            if (originAutocompleteRef.current) {
              const place = originAutocompleteRef.current.getPlace();
              if (place?.geometry?.location) {
                const location = place.geometry.location;
                const address = place.formatted_address || '';
                setOrigin(address);
                setOriginLocation(location);
                setUseMyLocation(false);
                // Update input value
                if (originInput) {
                  originInput.value = address;
                }
                // Reset hasRoute to allow new route calculation
                setHasRoute(false);
                // Recalculate route if destination is already set
                if (destinationLocation) {
                  setTimeout(() => calculateRoute(location, destinationLocation), 100);
                }
              }
            }
          });
          console.log('Origin Autocomplete initialized');
        } catch (error) {
          console.error('Error initializing Origin Autocomplete:', error);
        }
      }

      // Initialize destination autocomplete
      const destInput = document.getElementById('destination-input') as HTMLInputElement;
      if (destInput && !destinationAutocompleteRef.current) {
        try {
          const autocomplete = new window.google.maps.places.Autocomplete(destInput, {
            fields: ['geometry', 'formatted_address'],
          });
          destinationAutocompleteRef.current = autocomplete;

          autocomplete.addListener('place_changed', () => {
            if (destinationAutocompleteRef.current) {
              const place = destinationAutocompleteRef.current.getPlace();
              if (place?.geometry?.location) {
                const location = place.geometry.location;
                setDestination(place.formatted_address || '');
                setDestinationLocation(location);
                // Reset hasRoute to allow new route calculation
                setHasRoute(false);
                // Calculate route with current origin
                const originLoc = useMyLocation ? currentLocation : originLocation;
                if (originLoc) {
                  setTimeout(() => calculateRoute(originLoc, location), 100);
                }
              }
            }
          });
          console.log('Destination Autocomplete initialized');
        } catch (error) {
          console.error('Error initializing Destination Autocomplete:', error);
        }
      }
    }, 200);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMapLoaded]);

  // Calculate route when both origin and destination are available, but NOT while actively navigating
  useEffect(() => {
    if (isNavigating) return; // Never recalculate mid-navigation
    const origin = useMyLocation ? currentLocation : originLocation;
    if (origin && destinationLocation) {
      console.log('Both locations available, calculating route');
      calculateRoute(origin, destinationLocation);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLocation, originLocation, destinationLocation, useMyLocation]);

  const requestLocationPermission = () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser');
      return;
    }

    // Try to get location with better options
    const options = {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = new window.google.maps.LatLng(
          position.coords.latitude,
          position.coords.longitude
        );
        setCurrentLocationSync(location);
        console.log('Current location obtained:', location.toString(), 'Accuracy:', position.coords.accuracy);
        
        if (mapInstanceRef.current) {
          // Zoom to current location with appropriate zoom level
          mapInstanceRef.current.setCenter(location);
          mapInstanceRef.current.setZoom(15);
          
          // Add marker for current location
          if (userMarkerRef.current) {
            userMarkerRef.current.setPosition(location);
          } else {
            userMarkerRef.current = new window.google.maps.Marker({
              position: location,
              map: mapInstanceRef.current,
              icon: {
                path: window.google.maps.SymbolPath.CIRCLE,
                scale: 8,
                fillColor: '#4285F4',
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 2,
              },
              title: 'Your Location',
              animation: window.google.maps.Animation.DROP,
              zIndex: 1000,
            });
          }
        }
        setLocationError('');
        
        // If using my location and destination is set, calculate route
        if (useMyLocation && destinationLocation) {
          calculateRoute(location, destinationLocation);
        }
      },
      (error) => {
        console.error('Location error:', error);
        let errorMessage = 'Unable to get your location. ';
        switch(error.code) {
          case error.PERMISSION_DENIED:
            errorMessage += 'Please allow location access in your browser settings.';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage += 'Location information is unavailable.';
            break;
          case error.TIMEOUT:
            errorMessage += 'Location request timed out. Please try again.';
            // Retry once
            setTimeout(() => requestLocationPermission(), 2000);
            break;
          default:
            errorMessage += error.message;
            break;
        }
        setLocationError(errorMessage);
      },
      options
    );
  };

  // Kalman filter for GPS smoothing
  const kalmanFilter = (measurement: google.maps.LatLng): google.maps.LatLng => {
    if (!kalmanStateRef.current) {
      // Initialize with first measurement
      kalmanStateRef.current = {
        lat: measurement.lat(),
        lng: measurement.lng(),
        variance: KALMAN_MEASUREMENT_NOISE
      };
      return measurement;
    }

    const state = kalmanStateRef.current;
    
    // Prediction step (assuming constant velocity)
    const predictedLat = state.lat;
    const predictedLng = state.lng;
    const predictedVariance = state.variance + KALMAN_PROCESS_NOISE;
    
    // Update step
    const kalmanGain = predictedVariance / (predictedVariance + KALMAN_MEASUREMENT_NOISE);
    
    const newLat = predictedLat + kalmanGain * (measurement.lat() - predictedLat);
    const newLng = predictedLng + kalmanGain * (measurement.lng() - predictedLng);
    const newVariance = (1 - kalmanGain) * predictedVariance;
    
    kalmanStateRef.current = {
      lat: newLat,
      lng: newLng,
      variance: newVariance
    };
    
    return new window.google.maps.LatLng(newLat, newLng);
  };

  // Throttled and filtered location update
  const shouldUpdateLocation = (newLocation: google.maps.LatLng): boolean => {
    const now = Date.now();
    
    // Time-based throttling
    if (now - lastLocationUpdateRef.current < LOCATION_UPDATE_INTERVAL) {
      return false;
    }
    
    // Distance-based filtering
    if (smoothedLocationRef.current) {
      const distance = window.google.maps.geometry.spherical.computeDistanceBetween(
        smoothedLocationRef.current,
        newLocation
      );
      if (distance < LOCATION_UPDATE_THRESHOLD) {
        return false;
      }
    }
    
    return true;
  };

  const processLocationUpdate = (rawLocation: google.maps.LatLng) => {
    // Apply Kalman filter
    const smoothedLocation = kalmanFilter(rawLocation);
    
    // Check if we should update based on filtering criteria
    if (shouldUpdateLocation(smoothedLocation)) {
      smoothedLocationRef.current = smoothedLocation;
      lastLocationUpdateRef.current = Date.now();
      addLog(`Location update: ${smoothedLocation.lat().toFixed(6)}, ${smoothedLocation.lng().toFixed(6)}`);
      return smoothedLocation;
    }
    
    return smoothedLocationRef.current; // Return last known good position
  };

  // Smoothly animate marker between two points
  const animateMarkerMove = (
    from: google.maps.LatLng,
    to: google.maps.LatLng,
    duration = 320
  ) => {
    if (!userMarkerRef.current || !mapInstanceRef.current) {
      return;
    }
    if (markerAnimationFrameRef.current) {
      cancelAnimationFrame(markerAnimationFrameRef.current);
    }

    const start = performance.now();
    const startLat = from.lat();
    const startLng = from.lng();
    const endLat = to.lat();
    const endLng = to.lng();

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const lat = startLat + (endLat - startLat) * t;
      const lng = startLng + (endLng - startLng) * t;
      const pos = new window.google.maps.LatLng(lat, lng);
      userMarkerRef.current?.setPosition(pos);
      if (t < 1) {
        markerAnimationFrameRef.current = requestAnimationFrame(step);
      }
    };

    markerAnimationFrameRef.current = requestAnimationFrame(step);
  };

  const calculateRoute = (originLoc: google.maps.LatLng | null, destLoc: google.maps.LatLng) => {
    if (!directionsServiceRef.current || !directionsRendererRef.current) {
      console.log('calculateRoute: Directions service not available');
      return;
    }

    if (!originLoc) {
      console.log('calculateRoute: Origin location not available yet');
      setLocationError('Please set a starting point or wait for your current location...');
      return;
    }

    if (!window.google || !window.google.maps) {
      console.log('calculateRoute: Google Maps not loaded');
      return;
    }

    console.log('calculateRoute: Calculating route from', originLoc.toString(), 'to', destLoc.toString());

    // Ensure travelMode is a valid Google Maps TravelMode
    const mode = typeof travelMode === 'string' 
      ? (window.google.maps.TravelMode[travelMode as keyof typeof window.google.maps.TravelMode] || window.google.maps.TravelMode.DRIVING)
      : travelMode;

    const request: google.maps.DirectionsRequest = {
      origin: originLoc,
      destination: destLoc,
      travelMode: mode,
      provideRouteAlternatives: false,
    };

    directionsServiceRef.current.route(request, (result: google.maps.DirectionsResult | null, status: google.maps.DirectionsStatus) => {
      console.log('calculateRoute: Route calculation result', status);
      if (status === window.google.maps.DirectionsStatus.OK && result) {
        directionsRendererRef.current?.setDirections(result);
        
        // Extract route steps — keep the raw instructions (with HTML) so maneuver lookup works,
        // but also store the detailed path array per step for accurate distance snapping.
        const route = result.routes[0];
        const legs = route.legs[0];
        routeStepsRef.current = legs.steps.map((step: google.maps.DirectionsStep) => ({
          distance: step.distance!,
          duration: step.duration!,
          instructions: step.instructions, // keep HTML; we strip it at display time
          start_location: step.start_location,
          end_location: step.end_location,
          maneuver: step.maneuver,
          // Store the detailed polyline path so updateCurrentInstruction can snap to it
          path: step.path && step.path.length > 0 ? step.path : [step.start_location, step.end_location],
        }));
        
        // Build a visible path for the route that follows user movement
        if (routePathRef.current) {
          routePathRef.current.setMap(null);
        }
        const path: google.maps.MVCArray<google.maps.LatLng> = new window.google.maps.MVCArray();
        result.routes[0].legs.forEach((leg: google.maps.DirectionsLeg) => {
          leg.steps.forEach((step: google.maps.DirectionsStep) => {
            if (step.path) {
              // Use the detailed path from Google Maps
              for (let i = 0; i < step.path.length; i++) {
                path.push(step.path[i]);
              }
            } else {
              // Fallback to start/end points
              path.push(step.start_location);
              path.push(step.end_location);
            }
          });
        });
        routePathRef.current = new window.google.maps.Polyline({
          path,
          strokeColor: '#4285F4',
          strokeWeight: 5,
          strokeOpacity: 0.8,
          map: mapInstanceRef.current || undefined,
        });

        // Create custom origin and destination markers
        if (originLoc && destLoc) {
          // Clear previous markers
          if (originMarkerRef.current) {
            originMarkerRef.current.setMap(null);
          }
          if (destinationMarkerRef.current) {
            destinationMarkerRef.current.setMap(null);
          }

          // Create origin marker
          originMarkerRef.current = new window.google.maps.Marker({
            position: originLoc,
            map: mapInstanceRef.current || undefined,
            icon: {
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: '#4285F4',
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 2,
            },
            label: 'A',
            title: 'Origin',
          });

          // Create destination marker
          destinationMarkerRef.current = new window.google.maps.Marker({
            position: destLoc,
            map: mapInstanceRef.current || undefined,
            icon: {
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: '#EA4335',
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 2,
            },
            label: 'B',
            title: 'Destination',
          });
        }

        // Store route info
        const routeDistance = legs.distance?.text || '';
        const routeDuration = legs.duration?.text || '';
        setRouteInfo({ distance: routeDistance, duration: routeDuration });
        routeInfoRef.current = { distance: routeDistance, duration: routeDuration };
        
        // Auto-zoom to fit the entire route
        if (mapInstanceRef.current && result.routes[0]) {
          const bounds = new window.google.maps.LatLngBounds();
          result.routes[0].legs.forEach((leg: google.maps.DirectionsLeg) => {
            bounds.extend(leg.start_location);
            bounds.extend(leg.end_location);
            leg.steps.forEach((step: google.maps.DirectionsStep) => {
              bounds.extend(step.start_location);
              bounds.extend(step.end_location);
            });
          });
          // Add padding to ensure route is not cut off
          mapInstanceRef.current.fitBounds(bounds, {
            top: 100,
            right: 50,
            bottom: 50,
            left: 50
          });
        }
        
        currentStepIndexRef.current = 0;
        setHasRoute(true); // Mark that a route has been calculated
        setLocationError(''); // Clear any errors
        console.log('calculateRoute: Route calculated successfully, hasRoute set to true');
        updateCurrentInstruction();
      } else {
        const errorMsg = `Route calculation failed: ${status}`;
        setLocationError(errorMsg);
        setHasRoute(false);
        setRouteInfo(null);
        console.error('calculateRoute:', errorMsg);
      }
    });
  };

  /**
   * Derive turn direction from a route step.
   * Priority: maneuver field (authoritative from Google) → text fallback.
   * The maneuver field is the ground truth – text matching was causing LEFT/RIGHT
   * swaps because instructions like "Keep left" or "Slight right" didn't match
   * the old "turn left / turn right" patterns.
   */
  const extractTurnDirection = (instructions: string, maneuver?: string): string => {
    // --- 1. Use Google Maps maneuver field when available ---
    if (maneuver) {
      const m = maneuver.toLowerCase();
      if (m.includes('uturn'))                          return 'U_TURN';
      if (m === 'turn-left' || m === 'sharp-left' || m === 'slight-left' || m === 'ramp-left' || m === 'fork-left')  return 'LEFT';
      if (m === 'turn-right' || m === 'sharp-right' || m === 'slight-right' || m === 'ramp-right' || m === 'fork-right') return 'RIGHT';
      if (m.includes('roundabout'))                     return 'ROUNDABOUT';
      if (m === 'merge' || m === 'straight')            return 'STRAIGHT';
      if (m.includes('keep-left'))                      return 'LEFT';
      if (m.includes('keep-right'))                     return 'RIGHT';
    }

    // --- 2. Text fallback (strip HTML tags first) ---
    const text = instructions.replace(/<[^>]*>/g, '').toLowerCase();

    if (text.includes('u-turn') || text.includes('make a u'))          return 'U_TURN';
    if (text.includes('roundabout') || text.includes('traffic circle')) return 'ROUNDABOUT';
    // Check right BEFORE generic "left/right" to avoid partial matches
    if (
      text.includes('turn right') || text.includes('right turn') ||
      text.includes('keep right') || text.includes('slight right') ||
      text.includes('sharp right') || text.includes('bear right')
    ) return 'RIGHT';
    if (
      text.includes('turn left') || text.includes('left turn') ||
      text.includes('keep left')  || text.includes('slight left') ||
      text.includes('sharp left')  || text.includes('bear left')
    ) return 'LEFT';
    if (text.includes('merge') || text.includes('ramp'))               return 'MERGE';
    if (text.includes('exit'))                                          return 'EXIT';
    if (text.includes('straight') || text.includes('continue'))        return 'STRAIGHT';

    return 'STRAIGHT'; // safe default
  };

  // Debounce Bluetooth data sending to avoid spam
  const lastSentDataRef = useRef<{ distance: number; direction: string } | null>(null);
  const MIN_DISTANCE_CHANGE = 10; // Minimum meters change before sending new data
  const MIN_TIME_INTERVAL = 2000; // Minimum time between updates (ms)
  const lastSentTimeRef = useRef<number>(0);
  const lastInstructionUpdateRef = useRef<number>(0);
  const lastStepIndexRef = useRef<number>(-1); // Track step changes

  const sendNavigationData = (distance: number, turnDirection: string) => {
    const now = Date.now();
    const distanceChanged = !lastSentDataRef.current ||
      Math.abs(distance - lastSentDataRef.current.distance) >= MIN_DISTANCE_CHANGE;
    const directionChanged = !lastSentDataRef.current ||
      lastSentDataRef.current.direction !== turnDirection;
    const timeElapsed = now - lastSentTimeRef.current;

    addLog(`Nav data: ${Math.round(distance)}m, ${turnDirection}`);

    const isDistanceDecreasing = !lastSentDataRef.current || distance <= lastSentDataRef.current.distance;
    const isCriticalEvent = turnDirection === 'ARRIVED' || turnDirection === 'START';
    const shouldSend = isCriticalEvent ||
      ((directionChanged || (distanceChanged && isDistanceDecreasing)) && timeElapsed >= MIN_TIME_INTERVAL);

    if (shouldSend) {
      const data = `${Math.round(distance)}:${turnDirection}`;
      addLog(`BT send: ${data}`);

      // Use bluetoothService directly — avoids stale bluetoothDevice state closure
      if (bluetoothService.isConnected()) {
        bluetoothService.sendData(data).catch(err => {
          addLog('ERROR: BT send failed - ' + err);
        });
      } else {
        addLog(`BT not connected. Data: ${data}`);
      }

      lastSentDataRef.current = { distance, direction: turnDirection };
      lastSentTimeRef.current = now;
    } else {
      addLog(`BT throttled: ${Math.round(distance)}m, ${turnDirection}`);
    }
  };

  // Helper: perpendicular distance from a point to a route segment (metres)
  const distanceToSegmentMeters = (
    point: google.maps.LatLng,
    start: google.maps.LatLng,
    end: google.maps.LatLng
  ): number => {
    const spherical = window.google.maps.geometry.spherical;
    const aToB = spherical.computeDistanceBetween(start, end);
    if (aToB === 0) return spherical.computeDistanceBetween(point, start);
    const aToP = spherical.computeDistanceBetween(start, point);
    const bToP = spherical.computeDistanceBetween(end, point);
    const t = Math.max(0, Math.min(1,
      (aToP * aToP - bToP * bToP + aToB * aToB) / (2 * aToB * aToB)
    ));
    const projection = spherical.interpolate(start, end, t);
    return spherical.computeDistanceBetween(point, projection);
  };

  const updateCurrentInstruction = () => {
    // Always read live position from ref — never from stale closure
    const liveLocation = currentLocationRef.current;
    if (routeStepsRef.current.length === 0 || !liveLocation) return;

    const now = Date.now();
    const steps = routeStepsRef.current;
    let currentStep = currentStepIndexRef.current;

    // Throttle: max once per 800ms UNLESS the step index changed
    if (now - lastInstructionUpdateRef.current < 800) {
      if (currentStep === lastStepIndexRef.current) return;
    }
    lastInstructionUpdateRef.current = now;

    // ── Step advance check ─────────────────────────────────────────────────
    // Use 30m threshold for advancing so we move to the next step before
    // the TURN command fires at 20m. This prevents the "at the turn but
    // still showing distance" bug.
    if (currentStep < steps.length) {
      const distToEnd = window.google.maps.geometry.spherical.computeDistanceBetween(
        liveLocation,
        steps[currentStep].end_location
      );
      if (distToEnd < 30 && currentStep < steps.length - 1) {
        currentStep += 1;
        currentStepIndexRef.current = currentStep;
        lastStepIndexRef.current = currentStep;
        // Tell ESP32 the turn is done — once per step transition
        if (turnSentForStepRef.current < currentStep && bluetoothService.isConnected()) {
          bluetoothService.sendData('STRAIGHT').catch(console.error);
          addLog(`Post-turn STRAIGHT sent (now on step ${currentStep})`);
        }
        console.log('Advanced to step:', currentStep);
      }
    }

    // ── Proximity-based step correction ───────────────────────────────────
    // Look ±2 steps around current to handle GPS jumps / deviations
    for (let i = Math.max(0, currentStep - 2); i < Math.min(steps.length, currentStep + 3); i++) {
      const step = steps[i];
      const dStart = window.google.maps.geometry.spherical.computeDistanceBetween(liveLocation, step.start_location);
      const dEnd   = window.google.maps.geometry.spherical.computeDistanceBetween(liveLocation, step.end_location);
      const stepLen = window.google.maps.geometry.spherical.computeDistanceBetween(step.start_location, step.end_location);
      if (dEnd < dStart && dEnd < stepLen * 1.2 && i > currentStep) {
        currentStep = i;
        currentStepIndexRef.current = currentStep;
        lastStepIndexRef.current = currentStep;
        console.log('Corrected to step:', currentStep);
        break;
      }
    }

    // ── Destination reached ───────────────────────────────────────────────
    if (currentStep >= steps.length) {
      setCurrentInstruction('You have arrived at your destination');
      sendNavigationData(0, 'ARRIVED');
      setTimeout(() => {
        alert('🎯 Destination Reached! You have successfully arrived at your destination.');
      }, 500);
      stopNavigation();
      return;
    }

    // ── Compute accurate distance ─────────────────────────────────────────
    // Snap the user position to the nearest point on the CURRENT step path
    // so the displayed distance tracks the road, not a straight-line to the
    // turn point. This fixes the "showing 200m when turn is 100m" issue.
    const step = steps[currentStep];

    // Build the step's detailed path if available; else use start→end
    const stepPath: google.maps.LatLng[] = [];
    if ((step as any).path && (step as any).path.length > 0) {
      stepPath.push(...(step as any).path);
    } else {
      stepPath.push(step.start_location, step.end_location);
    }

    // Find the segment the user is closest to, then compute remaining distance
    // along the path from that projection point to the turn (end_location)
    let minSegDist = Infinity;
    let bestSegIdx = 0;
    for (let s = 0; s < stepPath.length - 1; s++) {
      const segDist = distanceToSegmentMeters(liveLocation, stepPath[s], stepPath[s + 1]);
      if (segDist < minSegDist) {
        minSegDist = segDist;
        bestSegIdx = s;
      }
    }

    // Remaining road distance = distance from projection on best segment → end of step
    let remainingDist = 0;
    // Projection parameter along the best segment
    const segStart = stepPath[bestSegIdx];
    const segEnd   = stepPath[bestSegIdx + 1];
    const aToB = window.google.maps.geometry.spherical.computeDistanceBetween(segStart, segEnd);
    const aToP = window.google.maps.geometry.spherical.computeDistanceBetween(segStart, liveLocation);
    const bToP = window.google.maps.geometry.spherical.computeDistanceBetween(segEnd, liveLocation);
    const t = aToB > 0
      ? Math.max(0, Math.min(1, (aToP * aToP - bToP * bToP + aToB * aToB) / (2 * aToB * aToB)))
      : 0;
    // Distance from projected point to end of this segment
    remainingDist += aToB * (1 - t);
    // Add full lengths of remaining segments in this step
    for (let s = bestSegIdx + 1; s < stepPath.length - 1; s++) {
      remainingDist += window.google.maps.geometry.spherical.computeDistanceBetween(stepPath[s], stepPath[s + 1]);
    }

    // Clamp: never show negative or impossibly large values
    remainingDist = Math.max(0, remainingDist);

    const turnDirection = extractTurnDirection(step.instructions, step.maneuver);

    // ── Send BT data (debounced) ──────────────────────────────────────────
    sendNavigationData(remainingDist, turnDirection);

    // ── Build display instruction ─────────────────────────────────────────
    let instruction: string;
    const roundedDist = Math.round(remainingDist);

    if (remainingDist < 20) {
      // Right at the turn — just show the maneuver text, no distance prefix
      instruction = step.instructions.replace(/<[^>]*>/g, '');

      // One-shot TURN command per step
      if (turnSentForStepRef.current !== currentStep) {
        turnSentForStepRef.current = currentStep;
        if (bluetoothService.isConnected()) {
          bluetoothService.sendData(`TURN:${turnDirection}`).catch(err => addLog('ERROR: Turn cmd - ' + err));
          addLog(`TURN:${turnDirection} fired at step ${currentStep} (${roundedDist}m)`);
        } else {
          addLog(`Turn cmd (BT off): ${turnDirection} at ${roundedDist}m`);
        }
      }
    } else if (remainingDist < 1000) {
      instruction = `In ${roundedDist}m, ${step.instructions.replace(/<[^>]*>/g, '')}`;
    } else {
      const km = (remainingDist / 1000).toFixed(1);
      instruction = `In ${km}km, ${step.instructions.replace(/<[^>]*>/g, '')}`;
    }

    // Only call setCurrentInstruction when the text actually changes — prevents
    // React re-renders on every GPS tick that cause the panel to "flash"
    setCurrentInstruction(prev => {
      if (prev === instruction) return prev;
      return instruction;
    });

    addLog(`Step ${currentStep}: ${roundedDist}m → ${turnDirection}`);
  };

  const startNavigation = () => {
    setIsNavigating(true);
    setLocationError('');
    setPreviousLocation(null);
    userManuallyZoomedRef.current = false;
    turnSentForStepRef.current = -1; // Reset per-step turn guard
    lastSentDataRef.current = null;  // Reset BT throttle
    lastSentTimeRef.current = 0;
    addLog('Navigation started');

    // Send "start" signal via Bluetooth when navigation begins
    if (bluetoothService.isConnected()) {
      sendNavigationData(0, 'START');
      addLog('Bluetooth: START sent');
    } else {
      addLog('Navigation started without Bluetooth connection');
    }

    // Adjust map view for navigation (will be handled by fitBounds when needed)
    // The map will center on user location during navigation

    // Watch position for live updates (only if using my location)
    if (useMyLocation && navigator.geolocation) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          const rawLocation = new window.google.maps.LatLng(
            position.coords.latitude,
            position.coords.longitude
          );

          // Process location through Kalman filter and throttling
          const processedLocation = processLocationUpdate(rawLocation);
          if (!processedLocation) return; // Skip if no update needed

          const previous =
            userMarkerRef.current?.getPosition() ||
            lastMarkerPositionRef.current ||
            processedLocation;
          lastMarkerPositionRef.current = processedLocation;

          setCurrentLocationSync(processedLocation);
          setOriginLocation(processedLocation);

          // Calculate heading from movement for more accurate direction
          let calculatedHeading = actualHeading;
          if (previousLocation) {
            calculatedHeading = calculateHeadingFromPoints(previousLocation, processedLocation);
            setActualHeading(calculatedHeading);
          }
          setPreviousLocation(processedLocation);

          // Update marker position and rotation with smooth slide
          if (userMarkerRef.current) {
            animateMarkerMove(previous, processedLocation);
            
            // Use GPS-calculated heading for navigation, fallback to compass or device heading
            const headingValue = position.coords.heading !== null && position.coords.heading !== undefined 
              ? position.coords.heading 
              : calculatedHeading;
            
            if (headingValue !== null && headingValue !== undefined) {
              // Rotate the marker based on heading (corrected for Google Maps arrow orientation)
              const correctedHeading = (headingValue + 90) % 360;
              userMarkerRef.current.setIcon({
                path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                scale: 8,
                fillColor: '#4285F4',
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 2,
                rotation: correctedHeading,
                anchor: new window.google.maps.Point(0, 2),
              });
            }
          } else if (mapInstanceRef.current) {
            // Create navigation arrow marker
            const headingVal = position.coords.heading !== null && position.coords.heading !== undefined 
              ? position.coords.heading 
              : calculatedHeading;
            const correctedHeading = (headingVal + 90) % 360;
            userMarkerRef.current = new window.google.maps.Marker({
              position: processedLocation,
              map: mapInstanceRef.current,
              icon: {
                path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                scale: 8,
                fillColor: '#4285F4',
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 2,
                rotation: correctedHeading,
                anchor: new window.google.maps.Point(0, 2),
              },
              title: 'Your Location',
              zIndex: 1000,
              animation: window.google.maps.Animation.DROP,
            });
            userMarkerRef.current?.setAnimation(null);
          }

          // Add current location to traveled path (only if moved significantly)
          if (previousLocation) {
            const distanceMoved = window.google.maps.geometry.spherical.computeDistanceBetween(previousLocation, processedLocation);
            if (distanceMoved > 5) { // Only add if moved more than 5 meters
              traveledPathCoordinatesRef.current.push(processedLocation);
              updateTraveledPath();
            }
          } else {
            traveledPathCoordinatesRef.current.push(processedLocation);
          }

          // Keep map centered toward current location while navigating (only if user hasn't manually zoomed)
          if (mapInstanceRef.current && !userManuallyZoomedRef.current) {
            mapInstanceRef.current.panTo(processedLocation);
          }

          // Update instruction
          updateCurrentInstruction();
          // Detect off-route
          handleOffRouteCheck(processedLocation);
        },
        (error) => {
          setLocationError(`Location tracking error: ${error.message}`);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 1000,
        }
      );
    } else {
      // If not using my location, just center on origin and show route
      if (mapInstanceRef.current && originLocation) {
        mapInstanceRef.current.setCenter(originLocation);
        mapInstanceRef.current.setZoom(15);
      }
    }
  };

  const handleTravelModeChange = (mode: google.maps.TravelMode) => {
    setTravelMode(mode);
    const originLoc = useMyLocation ? currentLocation : originLocation;
    if (originLoc && destinationLocation) {
      calculateRoute(originLoc, destinationLocation);
    }
  };

  const updateTraveledPath = () => {
    if (!mapInstanceRef.current || traveledPathCoordinatesRef.current.length < 2) return;

    // Remove old traveled path
    if (traveledPathRef) {
      traveledPathRef.setMap(null);
    }

    // Create new traveled path with user's actual movement
    const traveledPath = new window.google.maps.Polyline({
      path: traveledPathCoordinatesRef.current,
      strokeColor: '#34A853', // Green color for traveled path
      strokeWeight: 6,
      strokeOpacity: 0.9,
      map: mapInstanceRef.current,
      zIndex: 2, // Below original route but above map
      geodesic: true, // Follow Earth's curvature
    });

    setTraveledPathRef(traveledPath);
  };

  // Clear error messages after 5 seconds
  useEffect(() => {
    if (locationError) {
      const timer = setTimeout(() => {
        setLocationError('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [locationError]);

  const stopNavigation = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsNavigating(false);
    
    // Reset Bluetooth send state so next navigation session is not throttled
    lastSentDataRef.current = null;
    lastSentTimeRef.current = 0;
    turnSentForStepRef.current = -1;
    
    // Clear traveled path
    if (traveledPathRef) {
      traveledPathRef.setMap(null);
      setTraveledPathRef(null);
    }
    traveledPathCoordinatesRef.current = [];
    
    // Reset marker to regular circle icon
    if (userMarkerRef.current && mapInstanceRef.current) {
      userMarkerRef.current.setIcon({
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: 8,
        fillColor: '#4285F4',
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 2,
      });
    }
    
    // Reset route state to allow new searches
    setHasRoute(false);
    setCurrentInstruction('');
    setPreviousLocation(null);
    setActualHeading(0);
    currentStepIndexRef.current = 0;
    routeStepsRef.current = [];
    
    // Clear route path and directions
    if (routePathRef.current) {
      routePathRef.current.setMap(null);
      routePathRef.current = null;
    }
    if (directionsRendererRef.current) {
      directionsRendererRef.current.setDirections({ routes: [] } as unknown as google.maps.DirectionsResult);
    }
    
    // Clear custom markers
    if (originMarkerRef.current) {
      originMarkerRef.current.setMap(null);
      originMarkerRef.current = null;
    }
    if (destinationMarkerRef.current) {
      destinationMarkerRef.current.setMap(null);
      destinationMarkerRef.current = null;
    }
    
    // Reset map padding after navigation stops
    if (mapInstanceRef.current && hasRoute && destinationLocation) {
      // Re-fit bounds to show the full route
      const bounds = new window.google.maps.LatLngBounds();
      if (useMyLocation && currentLocation) {
        bounds.extend(currentLocation);
      } else if (originLocation) {
        bounds.extend(originLocation);
      }
      if (destinationLocation) {
        bounds.extend(destinationLocation);
      }
      mapInstanceRef.current.fitBounds(bounds, {
        top: 100,
        right: 50,
        bottom: 50,
        left: 50
      });
    }
  };

  const swapOriginDestination = () => {
    const tempOrigin = origin;
    const tempOriginLoc = originLocation;
    const tempUseMyLocation = useMyLocation;
    const tempDest = destination;
    const tempDestLoc = destinationLocation;

    // Get the actual origin location (current location if using my location)
    const actualOriginLoc = tempUseMyLocation ? currentLocation : tempOriginLoc;

    // Swap values - destination becomes origin
    setOrigin(tempDest);
    setOriginLocation(tempDestLoc);
    setUseMyLocation(false);

    // Origin (old destination) becomes new destination
    if (tempUseMyLocation && currentLocation) {
      // If origin was "My Location", we can't set destination to "My Location"
      // So we'll set it to the current location's address if available, or keep it empty
      setDestination('');
      setDestinationLocation(currentLocation);
    } else {
      setDestination(tempOrigin);
      setDestinationLocation(actualOriginLoc);
    }

    // Update input values
    const originInput = document.getElementById('origin-input') as HTMLInputElement;
    const destInput = document.getElementById('destination-input') as HTMLInputElement;
    if (originInput) originInput.value = tempDest;
    if (destInput) {
      if (tempUseMyLocation) {
        destInput.value = '';
      } else {
        destInput.value = tempOrigin;
      }
    }

    // Recalculate route
    if (tempDestLoc && actualOriginLoc) {
      calculateRoute(tempDestLoc, actualOriginLoc);
    }
  };

  const useMyLocationForOrigin = () => {
    if (currentLocation) {
      setOrigin('My Location');
      setOriginLocation(currentLocation);
      setUseMyLocation(true);
      // Recalculate route if destination is set
      if (destinationLocation) {
        calculateRoute(currentLocation, destinationLocation);
      }
    } else {
      setLocationError('Current location not available. Please allow location access.');
      requestLocationPermission();
    }
  };

  const computeMinDistanceToRoute = (location: google.maps.LatLng): number | null => {
    if (!routePathRef.current) return null;
    const path = routePathRef.current.getPath();
    if (!path || path.getLength() < 2) return null;

    let minDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < path.getLength() - 1; i++) {
      const start = path.getAt(i);
      const end = path.getAt(i + 1);
      const segmentDistance = distanceToSegmentMeters(location, start, end);
      minDistance = Math.min(minDistance, segmentDistance);
    }
    return minDistance;
  };

  const handleOffRouteCheck = (location: google.maps.LatLng) => {
    const minDistance = computeMinDistanceToRoute(location);
    const offRouteThreshold = 100; // Increased threshold for better tolerance

    // Only check off-route if we have traveled some distance
    if (hasRoute && minDistance !== null && traveledPathCoordinatesRef.current.length > 5) {
      if (minDistance > offRouteThreshold) {
        console.log(`Off route detected: ${minDistance.toFixed(2)}m from route`);
        setLocationError(`You're ${Math.round(minDistance)}m off route. Recalculating...`);
        
        // Recalculate route from current location to destination
        if (destinationLocation) {
          calculateRoute(location, destinationLocation);
        }
      }
    }
  };

  const centerOnMyLocation = () => {
    if (currentLocation && mapInstanceRef.current) {
      mapInstanceRef.current.setCenter(currentLocation);
      mapInstanceRef.current.setZoom(15);
      
      setOrigin('My Location');
      setOriginLocation(currentLocation);
      setUseMyLocation(true);
      const originInput = document.getElementById('origin-input') as HTMLInputElement;
      if (originInput) {
        originInput.value = 'My Location';
      }
      
      // Add animation
      if (userMarkerRef.current) {
        userMarkerRef.current.setAnimation(window.google.maps.Animation.BOUNCE);
        setTimeout(() => {
          if (userMarkerRef.current) {
            userMarkerRef.current.setAnimation(null);
          }
        }, 2000);
      }
    } else {
      // Request location if not available
      requestLocationPermission();
    }
  };

  // clearRoute function is available for future use (e.g., clear button)
  // @ts-ignore - Function is defined for potential future use
  const _clearRoute = () => {
    if (directionsRendererRef.current) {
      directionsRendererRef.current.setDirections({ routes: [] } as unknown as google.maps.DirectionsResult);
    }
    routeStepsRef.current = [];
    currentStepIndexRef.current = 0;
    setDestination('');
    setDestinationLocation(null);
    setOrigin('');
    setOriginLocation(null);
    setUseMyLocation(true);
    setCurrentInstruction('');
    setHasRoute(false);
    setRouteInfo(null);
    // Clear traveled path
    if (traveledPathRef) {
      traveledPathRef.setMap(null);
      setTraveledPathRef(null);
    }
    traveledPathCoordinatesRef.current = [];
    
    if (routePathRef.current) {
      routePathRef.current.setMap(null);
      routePathRef.current = null;
    }
    stopNavigation();
    
    // Clear input values
    const originInput = document.getElementById('origin-input') as HTMLInputElement;
    const destInput = document.getElementById('destination-input') as HTMLInputElement;
    if (originInput) originInput.value = '';
    if (destInput) destInput.value = '';
    
    // Clear Bluetooth data
    if (bluetoothService.isConnected()) {
      bluetoothService.sendData('').catch((error) => {
        console.error('Error clearing Bluetooth data:', error);
      });
    }
  };

  const handleBluetoothConnected = (device: BluetoothDevice) => {
    console.log('Bluetooth device connected:', device.name);
  };

  const handleBluetoothDisconnected = () => {
    console.log('Bluetooth device disconnected');
  };

  console.log('NavigationApp: Rendering component', { 
    isMapLoaded, 
    locationError, 
    destination, 
    hasRoute, 
    hasDestination: !!destinationLocation,
    hasCurrentLocation: !!currentLocation 
  });

  const currentOrigin = useMyLocation ? currentLocation : originLocation;

  return (
    <div className="navigation-container">
      <BluetoothConnection 
        onConnected={handleBluetoothConnected}
        onDisconnected={handleBluetoothDisconnected}
      />
      <div ref={mapRef} className="map-container" style={{ width: '100%', height: '100%' }} />
      
      <div className={`controls-overlay ${isNavigating ? 'navigating' : ''}`}>
        {!isNavigating && (
          <div className="search-panel">
          <div className="search-row">
            <div className="search-input-wrapper">
              <div className="location-icon origin-icon">A</div>
              <input
                id="origin-input"
                type="text"
                placeholder="Choose starting point"
                className="search-input"
                value={useMyLocation ? 'My Location' : origin}
                onChange={(e) => {
                  if (!useMyLocation) {
                    setOrigin(e.target.value);
                  }
                }}
                readOnly={useMyLocation}
              />
              {origin && !useMyLocation && (
                <button onClick={() => { setOrigin(''); setOriginLocation(null); setHasRoute(false); }} className="clear-input-button">
                  ✕
                </button>
              )}
              <button 
                onClick={useMyLocationForOrigin} 
                className={`my-location-button ${useMyLocation ? 'active' : ''}`} 
                title="Use my location"
              >
                📍
              </button>
            </div>
          </div>

          <button onClick={swapOriginDestination} className="swap-button" title="Swap origin and destination">
            ⇅
          </button>

          <div className="search-row">
            <div className="search-input-wrapper">
              <div className="location-icon destination-icon">B</div>
              <input
                id="destination-input"
                type="text"
                placeholder="Choose destination"
                className="search-input"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
              />
              {destination && (
                <button onClick={() => { setDestination(''); setDestinationLocation(null); setHasRoute(false); }} className="clear-input-button">
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>
        )}

        {!isNavigating && routeInfo && hasRoute && (
          <div className="route-info-panel">
            <div className="route-info-item">
              <span className="route-info-label">Distance:</span>
              <span className="route-info-value">{routeInfo.distance}</span>
            </div>
            <div className="route-info-item">
              <span className="route-info-label">Duration:</span>
              <span className="route-info-value">{routeInfo.duration}</span>
            </div>
          </div>
        )}

        {!isNavigating && (currentOrigin || destinationLocation) && window.google?.maps && (
          <div className="travel-mode-selector">
            <button
              onClick={() => handleTravelModeChange(window.google.maps.TravelMode.DRIVING)}
              className={`travel-mode-button ${(travelMode === window.google.maps.TravelMode.DRIVING || travelMode === 'DRIVING') ? 'active' : ''}`}
              title="Driving"
            >
              🚗
            </button>
            <button
              onClick={() => handleTravelModeChange(window.google.maps.TravelMode.BICYCLING)}
              className={`travel-mode-button ${(travelMode === window.google.maps.TravelMode.BICYCLING || travelMode === 'BICYCLING') ? 'active' : ''}`}
              title="Bicycling"
            >
              🚴
            </button>
            <button
              onClick={() => handleTravelModeChange(window.google.maps.TravelMode.WALKING)}
              className={`travel-mode-button ${(travelMode === window.google.maps.TravelMode.WALKING || travelMode === 'WALKING') ? 'active' : ''}`}
              title="Walking"
            >
              🚶
            </button>
            <button
              onClick={() => handleTravelModeChange(window.google.maps.TravelMode.TRANSIT)}
              className={`travel-mode-button ${(travelMode === window.google.maps.TravelMode.TRANSIT || travelMode === 'TRANSIT') ? 'active' : ''}`}
              title="Transit"
            >
              🚌
            </button>
          </div>
        )}

        {currentInstruction && (
          <div className="instruction-panel">
            <div className="instruction-arrow">
              {currentInstruction.toLowerCase().includes('right') ? '→' :
               currentInstruction.toLowerCase().includes('left') ? '←' :
               currentInstruction.toLowerCase().includes('u-turn') ? '↩' :
               currentInstruction.toLowerCase().includes('arrived') ? '🎯' : '↑'}
            </div>
            <div className="instruction-text">
              {currentInstruction.replace(/<[^>]*>/g, '')}
            </div>
          </div>
        )}

        {destinationLocation && !isNavigating && (
          <div className="action-buttons">
            {!hasRoute && currentOrigin && (
              <button 
                onClick={() => currentOrigin && destinationLocation && calculateRoute(currentOrigin, destinationLocation)} 
                className="get-directions-button"
              >
                Get Directions
              </button>
            )}
            {hasRoute && (
              <button onClick={startNavigation} className="start-navigation-button">
                Start Navigation
              </button>
            )}
          </div>
        )}

        {isNavigating && (
          <div className="navigation-controls">
            <button onClick={stopNavigation} className="stop-navigation-button">
              <span className="stop-icon">⏹</span>
              <span className="stop-text">Stop Navigation</span>
            </button>
          </div>
        )}

        {locationError && (
          <div className="error-message">{locationError}</div>
        )}
      </div>

      {/* My Location Button - Floating on right side */}
      {isMapLoaded && (
        <button 
          onClick={centerOnMyLocation} 
          className="my-location-fab"
          title="Center on my location"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 8C9.79 8 8 9.79 8 12C8 14.21 9.79 16 12 16C14.21 16 16 14.21 16 12C16 9.79 14.21 8 12 8ZM20.94 11C20.48 6.83 17.17 3.52 13 3.06V1H11V3.06C6.83 3.52 3.52 6.83 3.06 11H1V13H3.06C3.52 17.17 6.83 20.48 11 20.94V23H13V20.94C17.17 20.48 20.48 17.17 20.94 13H23V11H20.94ZM12 19C8.13 19 5 15.87 5 12C5 8.13 8.13 5 12 5C15.87 5 19 8.13 19 12C19 15.87 15.87 19 12 19Z" fill="currentColor"/>
          </svg>
        </button>
      )}

      {/* Debug Log Toggle Button */}
      {isMapLoaded && (
        <button 
          onClick={() => setShowLogs(!showLogs)} 
          className="log-toggle-fab"
          title="Toggle Debug Logs"
        >
          📋
        </button>
      )}

      {!isMapLoaded && (
        <div className="loading-overlay">
          <div className="loading-spinner">Loading map...</div>
          {locationError && (
            <div style={{ marginTop: '10px', color: '#f44336', padding: '10px', background: 'white', borderRadius: '8px' }}>
              {locationError}
            </div>
          )}
        </div>
      )}

      {/* Debug Log Window */}
      <div className={`log-window ${showLogs ? 'show' : 'hide'}`}>
        <div className="log-header">
          <h3>Debug Logs</h3>
          <div className="log-controls">
            <button onClick={copyLogs} className="log-button copy-button" title="Copy all logs">
              📋 Copy
            </button>
            <button onClick={() => setShowLogs(!showLogs)} className="log-button toggle-button" title="Toggle logs">
              {showLogs ? '👁️ Hide' : '👁️ Show'}
            </button>
            <button onClick={() => setLogs([])} className="log-button clear-button" title="Clear logs">
              🗑️ Clear
            </button>
          </div>
        </div>
        <div className="log-content">
          {logs.map((log, index) => (
            <div key={index} className="log-entry">
              {log}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default NavigationApp;

