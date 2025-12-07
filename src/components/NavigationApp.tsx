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
}

const NavigationApp = () => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const directionsServiceRef = useRef<google.maps.DirectionsService | null>(null);
  const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
  const originAutocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const destinationAutocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const routeStepsRef = useRef<RouteStep[]>([]);
  const currentStepIndexRef = useRef<number>(0);
  const userMarkerRef = useRef<google.maps.Marker | null>(null);
  const routeInfoRef = useRef<{ distance: string; duration: string } | null>(null);

  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<google.maps.LatLng | null>(null);
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
  const [bluetoothDevice, setBluetoothDevice] = useState<BluetoothDevice | null>(null);

  // Load Google Maps script
  useEffect(() => {
    console.log('NavigationApp: Component mounted');
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
    console.log('NavigationApp: API Key loaded:', apiKey ? 'Yes' : 'No');
    
    if (!apiKey || apiKey === 'your-google-maps-api-key') {
      console.error('NavigationApp: API key not configured');
      setLocationError('Please configure your Google Maps API key in .env file');
      setIsMapLoaded(true); // Show UI even if API key is missing
      return;
    }

    // Check if script is already loaded
    if (window.google && window.google.maps) {
      console.log('NavigationApp: Google Maps already loaded');
      setTimeout(() => initializeMap(), 100);
      return;
    }

    // Create a unique callback name
    const callbackName = `initMap_${Date.now()}`;
    console.log('NavigationApp: Setting up callback:', callbackName);
    
    (window as any)[callbackName] = () => {
      console.log('NavigationApp: Google Maps callback triggered');
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
    script.onerror = (error) => {
      console.error('NavigationApp: Script load error:', error);
      setLocationError('Failed to load Google Maps. Please check your API key and internet connection.');
      setIsMapLoaded(true);
    };
    script.onload = () => {
      console.log('NavigationApp: Script loaded successfully');
    };
    
    document.head.appendChild(script);

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  const initializeMap = () => {
    console.log('initializeMap: Starting map initialization');
    try {
      if (!mapRef.current) {
        console.error('initializeMap: Map container not found');
        setLocationError('Map container not found');
        setIsMapLoaded(true);
        return;
      }

      if (!window.google || !window.google.maps) {
        console.error('initializeMap: Google Maps API not loaded');
        setLocationError('Google Maps API failed to load');
        setIsMapLoaded(true);
        return;
      }

      console.log('initializeMap: Creating map instance');
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

      // Initialize Directions Service and Renderer
      directionsServiceRef.current = new window.google.maps.DirectionsService();
      directionsRendererRef.current = new window.google.maps.DirectionsRenderer({
        map: map,
        suppressMarkers: false,
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
      setIsMapLoaded(true);
      requestLocationPermission();
    } catch (error) {
      console.error('initializeMap: Error initializing map:', error);
      setLocationError(`Error initializing map: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsMapLoaded(true);
    }
  };

  // Initialize Places Autocomplete for both origin and destination
  useEffect(() => {
    if (!isMapLoaded || !window.google || !window.google.maps || !window.google.maps.places) {
      return;
    }

    // Wait a bit for the DOM to be ready
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
                const originInput = document.getElementById('origin-input') as HTMLInputElement;
                if (originInput) {
                  originInput.value = address;
                }
                // Recalculate route if destination is already set
                if (destinationLocation) {
                  calculateRoute(location, destinationLocation);
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
                // Calculate route with current origin
                const originLoc = useMyLocation ? currentLocation : originLocation;
                if (originLoc) {
                  calculateRoute(originLoc, location);
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

  // Calculate route when both origin and destination are available
  useEffect(() => {
    const origin = useMyLocation ? currentLocation : originLocation;
    if (origin && destinationLocation && !hasRoute) {
      console.log('Both locations available, calculating route');
      calculateRoute(origin, destinationLocation);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLocation, originLocation, destinationLocation, hasRoute, useMyLocation]);

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
        setCurrentLocation(location);
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
        
        // Extract route steps
        const route = result.routes[0];
        const legs = route.legs[0];
        routeStepsRef.current = legs.steps.map((step: google.maps.DirectionsStep) => ({
          distance: step.distance!,
          duration: step.duration!,
          instructions: step.instructions.replace(/<[^>]*>/g, ''), // Remove HTML tags
          start_location: step.start_location,
          end_location: step.end_location,
          maneuver: step.maneuver,
        }));
        
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

  const updateCurrentInstruction = () => {
    if (routeStepsRef.current.length === 0 || !currentLocation) return;

    const steps = routeStepsRef.current;
    let currentStep = currentStepIndexRef.current;
    
    // Check if user has passed the current step
    if (currentStep < steps.length) {
      const distanceToCurrentStepEnd = window.google.maps.geometry.spherical.computeDistanceBetween(
        currentLocation,
        steps[currentStep].end_location
      );
      
      // If within 50m of step end and not the last step, advance to next step
      if (distanceToCurrentStepEnd < 50 && currentStep < steps.length - 1) {
        currentStep = currentStep + 1;
        currentStepIndexRef.current = currentStep;
      }
    }

    // Find the step the user should be on based on proximity
    // This handles cases where GPS jumps or user deviates
    for (let i = Math.max(0, currentStep - 2); i < Math.min(steps.length, currentStep + 3); i++) {
      const step = steps[i];
      const distanceToStepStart = window.google.maps.geometry.spherical.computeDistanceBetween(
        currentLocation,
        step.start_location
      );
      const distanceToStepEnd = window.google.maps.geometry.spherical.computeDistanceBetween(
        currentLocation,
        step.end_location
      );
      const stepLength = window.google.maps.geometry.spherical.computeDistanceBetween(
        step.start_location,
        step.end_location
      );

      // If user is closer to this step's end than current step, and hasn't passed it
      if (distanceToStepEnd < distanceToStepStart && distanceToStepEnd < stepLength * 1.2) {
        if (i > currentStep) {
          currentStep = i;
          currentStepIndexRef.current = currentStep;
          break;
        }
      }
    }

    if (currentStep < steps.length) {
      const step = steps[currentStep];
      const distanceToNextTurn = window.google.maps.geometry.spherical.computeDistanceBetween(
        currentLocation,
        step.end_location
      );

      // Format instruction based on distance
      let instruction = '';
      if (distanceToNextTurn < 50) {
        instruction = step.instructions;
      } else if (distanceToNextTurn < 1000) {
        instruction = `In ${Math.round(distanceToNextTurn)}m, ${step.instructions}`;
      } else {
        const km = (distanceToNextTurn / 1000).toFixed(1);
        instruction = `In ${km}km, ${step.instructions}`;
      }

      setCurrentInstruction(instruction);
      
      // Send instruction via Bluetooth
      if (bluetoothDevice && bluetoothService.isConnected()) {
        bluetoothService.sendData(instruction).catch((error) => {
          console.error('Error sending data via Bluetooth:', error);
        });
      } else {
        console.log('Bluetooth not connected. Instruction:', instruction);
      }
    } else {
      // Reached destination
      const finalInstruction = 'You have arrived at your destination';
      setCurrentInstruction(finalInstruction);
      if (bluetoothDevice && bluetoothService.isConnected()) {
        bluetoothService.sendData(finalInstruction).catch((error) => {
          console.error('Error sending data via Bluetooth:', error);
        });
      }
      stopNavigation();
    }
  };

  const startNavigation = () => {
    if (routeStepsRef.current.length === 0) {
      setLocationError('No route available. Please select a destination first.');
      return;
    }

    // If using custom origin (not my location), we can still navigate but won't track GPS
    if (!useMyLocation && !navigator.geolocation) {
      setLocationError('GPS tracking requires location access. Please enable "My Location" for live navigation.');
      return;
    }

    setIsNavigating(true);
    setLocationError('');

    // Send "start" signal via Bluetooth when navigation begins
    if (bluetoothDevice && bluetoothService.isConnected()) {
      bluetoothService.sendData('start').catch((error) => {
        console.error('Error sending start signal via Bluetooth:', error);
      });
      console.log('Bluetooth updated with "start" - Navigation started');
    }

    // Adjust map view for navigation (will be handled by fitBounds when needed)
    // The map will center on user location during navigation

    // Watch position for live updates (only if using my location)
    if (useMyLocation && navigator.geolocation) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          const location = new window.google.maps.LatLng(
            position.coords.latitude,
            position.coords.longitude
          );
          setCurrentLocation(location);
          setOriginLocation(location);

          // Update marker position and rotation
          if (userMarkerRef.current) {
            userMarkerRef.current.setPosition(location);
            
            // Update heading if available
            if (position.coords.heading !== null && position.coords.heading !== undefined) {
              // Rotate the marker based on heading
              userMarkerRef.current.setIcon({
                path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                scale: 5,
                fillColor: '#4285F4',
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 2,
                rotation: position.coords.heading,
                anchor: new window.google.maps.Point(0, 0),
              });
            }
          } else if (mapInstanceRef.current) {
            // Create navigation arrow marker
            const heading = position.coords.heading || 0;
            userMarkerRef.current = new window.google.maps.Marker({
              position: location,
              map: mapInstanceRef.current,
              icon: {
                path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                scale: 5,
                fillColor: '#4285F4',
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 2,
                rotation: heading,
                anchor: new window.google.maps.Point(0, 0),
              },
              title: 'Your Location',
              zIndex: 1000,
              animation: window.google.maps.Animation.DROP,
            });
          }

          // Update map center during navigation with smooth transition
          if (mapInstanceRef.current) {
            mapInstanceRef.current.setCenter(location);
            // Keep zoom level appropriate for navigation (not too zoomed out)
            if (mapInstanceRef.current.getZoom() && mapInstanceRef.current.getZoom()! < 14) {
              mapInstanceRef.current.setZoom(15);
            }
          }

          // Update instruction
          updateCurrentInstruction();
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

  const stopNavigation = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsNavigating(false);
    
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

  const centerOnMyLocation = () => {
    if (currentLocation && mapInstanceRef.current) {
      mapInstanceRef.current.setCenter(currentLocation);
      mapInstanceRef.current.setZoom(15);
      
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
    stopNavigation();
    
    // Clear input values
    const originInput = document.getElementById('origin-input') as HTMLInputElement;
    const destInput = document.getElementById('destination-input') as HTMLInputElement;
    if (originInput) originInput.value = '';
    if (destInput) destInput.value = '';
    
    // Clear Bluetooth data
    if (bluetoothDevice && bluetoothService.isConnected()) {
      bluetoothService.sendData('').catch((error) => {
        console.error('Error clearing Bluetooth data:', error);
      });
    }
  };

  const handleBluetoothConnected = (device: BluetoothDevice) => {
    setBluetoothDevice(device);
    console.log('Bluetooth device connected:', device.name);
  };

  const handleBluetoothDisconnected = () => {
    setBluetoothDevice(null);
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
            <div className="instruction-text">{currentInstruction}</div>
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
    </div>
  );
};

export default NavigationApp;

