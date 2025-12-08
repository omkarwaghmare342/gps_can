import { useState, useEffect } from 'react';
import { bluetoothService } from '../services/bluetooth';
import type { BluetoothDeviceInfo as BluetoothDevice } from '../services/bluetooth';
import './BluetoothConnection.css';

interface BluetoothConnectionProps {
  onConnected: (device: BluetoothDevice) => void;
  onDisconnected: () => void;
}

const BluetoothConnection = ({ onConnected, onDisconnected }: BluetoothConnectionProps) => {
  const [isSupported, setIsSupported] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [connectedDevice, setConnectedDevice] = useState<BluetoothDevice | null>(null);
  const [error, setError] = useState<string>('');
  const [showModal, setShowModal] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(true);

  useEffect(() => {
    const supported = bluetoothService.isSupported();
    setIsSupported(supported);
    
    if (supported) {
      // Check if already connected
      if (bluetoothService.isConnected()) {
        const device = bluetoothService.getConnectedDevice();
        if (device) {
          setConnectedDevice(device);
          setIsConnected(true);
          setShowModal(false);
          onConnected(device);
        }
      }
    } else {
      setError('Web Bluetooth is not supported in this browser. Please use Chrome, Edge, or Opera on a device with Bluetooth support.');
    }
  }, [onConnected]);

  const handleConnect = async () => {
    if (!isSupported) {
      setError('Bluetooth is not supported');
      return;
    }

    setIsConnecting(true);
    setError('');

    try {
      // Request device
      const device = await bluetoothService.requestDevice();
      
      if (!device) {
        setError('No device selected');
        setIsConnecting(false);
        return;
      }

      // Connect to device
      const connected = await bluetoothService.connect(device);
      
      if (connected) {
        setConnectedDevice(device);
        setIsConnected(true);
        setShowModal(false);
        onConnected(device);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to connect to Bluetooth device');
      console.error('Bluetooth connection error:', err);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await bluetoothService.disconnect();
      setConnectedDevice(null);
      setIsConnected(false);
      setShowModal(true);
      onDisconnected();
    } catch (err: any) {
      setError(err.message || 'Failed to disconnect');
    }
  };

  if (!showModal && isConnected) {
    return (
      <div className={`bluetooth-status ${isCollapsed ? 'collapsed' : ''}`}>
        {isCollapsed ? (
          <button
            className="bluetooth-pill"
            onClick={(e) => {
              e.stopPropagation();
              setIsCollapsed(false);
            }}
            title="Bluetooth connected - tap to expand"
          >
            <span className="bluetooth-indicator connected">●</span>
            <span className="bluetooth-pill-text">
              {connectedDevice?.name || 'Connected'}
            </span>
          </button>
        ) : (
          <div className="bluetooth-status-content">
            <span className="bluetooth-indicator connected">●</span>
            <span className="bluetooth-device-name">
              {connectedDevice?.name || 'Connected Device'}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsCollapsed(true);
              }}
              className="bluetooth-collapse-btn"
              title="Hide status"
            >
              ✕
            </button>
            <button onClick={handleDisconnect} className="bluetooth-disconnect-btn" title="Disconnect">
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  if (!showModal) {
    return null;
  }

  return (
    <div className="bluetooth-modal-overlay">
      <div className="bluetooth-modal">
        <div className="bluetooth-modal-header">
          <h2>🔵 Bluetooth Connection</h2>
        </div>
        
        <div className="bluetooth-modal-content">
          {!isSupported ? (
            <div className="bluetooth-error">
              <p>⚠️ Web Bluetooth is not supported in this browser.</p>
              <p>Please use:</p>
              <ul>
                <li>Chrome (Desktop/Android)</li>
                <li>Edge (Desktop)</li>
                <li>Opera (Desktop)</li>
              </ul>
              <p>Note: Bluetooth must be enabled on your device.</p>
            </div>
          ) : error ? (
            <div className="bluetooth-error">
              <p>❌ {error}</p>
              <button onClick={handleConnect} className="bluetooth-retry-btn">
                Try Again
              </button>
            </div>
          ) : (
            <>
              <p>Connect to a Bluetooth device to send navigation instructions.</p>
              <p className="bluetooth-hint">
                Make sure your Bluetooth device is turned on and discoverable.
              </p>
              
              <button
                onClick={handleConnect}
                disabled={isConnecting}
                className="bluetooth-connect-btn"
              >
                {isConnecting ? (
                  <>
                    <span className="spinner"></span>
                    Connecting...
                  </>
                ) : (
                  <>
                    🔵 Connect Bluetooth Device
                  </>
                )}
              </button>

              <div className="bluetooth-info">
                <h3>How it works:</h3>
                <ol>
                  <li>Click "Connect Bluetooth Device"</li>
                  <li>Select your device from the list</li>
                  <li>Pair with your device if prompted</li>
                  <li>Navigation instructions will be sent via Bluetooth</li>
                </ol>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default BluetoothConnection;

