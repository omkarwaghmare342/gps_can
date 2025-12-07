// Bluetooth service for sending navigation data via Web Bluetooth API

// Web Bluetooth API type definitions
interface BluetoothRemoteGATTServer {
  device: BluetoothDevice;
  connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryService(service: BluetoothServiceUUID): Promise<BluetoothRemoteGATTService>;
}

interface BluetoothRemoteGATTService {
  device: BluetoothDevice;
  uuid: string;
  isPrimary: boolean;
  getCharacteristic(characteristic: BluetoothCharacteristicUUID): Promise<BluetoothRemoteGATTCharacteristic>;
  getCharacteristics(): Promise<BluetoothRemoteGATTCharacteristic[]>;
}

interface BluetoothRemoteGATTCharacteristic {
  service: BluetoothRemoteGATTService;
  uuid: string;
  properties: BluetoothCharacteristicProperties;
  value?: DataView;
  readValue(): Promise<DataView>;
  writeValue(value: BufferSource): Promise<void>;
  writeValueWithoutResponse(value: BufferSource): Promise<void>;
}

interface BluetoothCharacteristicProperties {
  broadcast: boolean;
  read: boolean;
  write: boolean;
  writeWithoutResponse: boolean;
  notify: boolean;
  indicate: boolean;
  authenticatedSignedWrites: boolean;
  reliableWrite: boolean;
  writableAuxiliaries: boolean;
}

type BluetoothServiceUUID = number | string;
type BluetoothCharacteristicUUID = number | string;

interface BluetoothDevice extends EventTarget {
  id: string;
  name?: string;
  gatt?: BluetoothRemoteGATTServer;
  watchingAdvertisements?: boolean;
}

export interface BluetoothDeviceInfo {
  id: string;
  name: string;
  device: BluetoothDevice;
}

export interface BluetoothService {
  isSupported: () => boolean;
  requestDevice: () => Promise<BluetoothDeviceInfo | null>;
  connect: (device: BluetoothDeviceInfo) => Promise<boolean>;
  disconnect: () => Promise<void>;
  sendData: (data: string) => Promise<boolean>;
  isConnected: () => boolean;
  getConnectedDevice: () => BluetoothDeviceInfo | null;
}

// UUIDs for BLE service and characteristics
// Custom UUIDs that match the ESP32 code
const NAVIGATION_SERVICE_UUID = '12345678-1234-1234-1234-123456789abc';
const NAVIGATION_CHARACTERISTIC_UUID = '12345678-1234-1234-1234-123456789abd';

// Fallback UUIDs (for compatibility with other devices)
// const NAVIGATION_SERVICE_UUID = '0000180f-0000-1000-8000-00805f9b34fb'; // Battery Service
// const NAVIGATION_CHARACTERISTIC_UUID = '00002a19-0000-1000-8000-00805f9b34fb'; // Battery Level

class BluetoothServiceImpl implements BluetoothService {
  private device: BluetoothDeviceInfo | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private service: BluetoothRemoteGATTService | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private isConnecting: boolean = false;

  isSupported(): boolean {
    return 'bluetooth' in navigator;
  }

  async requestDevice(): Promise<BluetoothDeviceInfo | null> {
    if (!this.isSupported()) {
      throw new Error('Web Bluetooth API is not supported in this browser. Please use Chrome, Edge, or Opera.');
    }

    try {
      // Request a Bluetooth device
      // Filter for devices with our navigation service
      const bluetooth = (navigator as any).bluetooth;
      const device = await bluetooth.requestDevice({
        filters: [
          { services: [NAVIGATION_SERVICE_UUID] },
          { namePrefix: 'ESP32' } // Also accept any ESP32 device
        ],
        optionalServices: [NAVIGATION_SERVICE_UUID]
      }) as BluetoothDevice;

      return {
        id: device.id,
        name: device.name || 'Unknown Device',
        device: device
      };
    } catch (error: any) {
      if (error.name === 'NotFoundError') {
        throw new Error('No Bluetooth device selected.');
      } else if (error.name === 'SecurityError') {
        throw new Error('Bluetooth permission denied. Please allow Bluetooth access.');
      } else {
        throw new Error(`Failed to request device: ${error.message}`);
      }
    }
  }

  async connect(device: BluetoothDeviceInfo): Promise<boolean> {
    if (this.isConnecting) {
      throw new Error('Connection already in progress');
    }

    if (this.isConnected()) {
      await this.disconnect();
    }

    this.isConnecting = true;

    try {
      this.device = device;
      const bluetoothDevice = device.device;

      // Connect to GATT server
      if (!bluetoothDevice.gatt) {
        throw new Error('Device does not support GATT');
      }

      this.server = await bluetoothDevice.gatt.connect();
      
      // Try to get the navigation service
      try {
        this.service = await this.server.getPrimaryService(NAVIGATION_SERVICE_UUID);
      } catch (error) {
        throw new Error(`Navigation service not found. Please ensure your ESP32 is running the correct firmware and the service UUID matches.`);
      }

      // Get characteristic for writing data
      try {
        this.characteristic = await this.service.getCharacteristic(NAVIGATION_CHARACTERISTIC_UUID);
      } catch (error) {
        throw new Error(`Navigation characteristic not found. Please ensure your ESP32 firmware matches the web app configuration.`);
      }

      // Listen for disconnection
      bluetoothDevice.addEventListener('gattserverdisconnected', () => {
        this.handleDisconnection();
      });

      this.isConnecting = false;
      return true;
    } catch (error: any) {
      this.isConnecting = false;
      this.device = null;
      this.server = null;
      this.service = null;
      this.characteristic = null;
      throw new Error(`Failed to connect: ${error.message}`);
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.server && this.device) {
        const bluetoothDevice = this.device.device as any;
        if (bluetoothDevice.gatt && bluetoothDevice.gatt.connected) {
          bluetoothDevice.gatt.disconnect();
        }
      }
    } catch (error) {
      console.error('Error disconnecting:', error);
    } finally {
      this.device = null;
      this.server = null;
      this.service = null;
      this.characteristic = null;
    }
  }

  async sendData(data: string): Promise<boolean> {
    if (!this.isConnected()) {
      throw new Error('Not connected to a Bluetooth device');
    }

    if (!this.characteristic) {
      throw new Error('Characteristic not available');
    }

    try {
      // Convert string to ArrayBuffer
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(data);

      // Send data
      if (this.characteristic.properties.write) {
        await this.characteristic.writeValue(dataBuffer);
      } else if (this.characteristic.properties.writeWithoutResponse) {
        await this.characteristic.writeValueWithoutResponse(dataBuffer);
      } else {
        throw new Error('Characteristic does not support writing');
      }

      return true;
    } catch (error: any) {
      if (error.message.includes('not connected')) {
        this.handleDisconnection();
      }
      throw new Error(`Failed to send data: ${error.message}`);
    }
  }

  isConnected(): boolean {
    if (!this.server || !this.device) {
      return false;
    }

    const bluetoothDevice = this.device.device as any;
    return bluetoothDevice.gatt && bluetoothDevice.gatt.connected;
  }

  getConnectedDevice(): BluetoothDeviceInfo | null {
    return this.isConnected() ? this.device : null;
  }

  private handleDisconnection(): void {
    console.log('Bluetooth device disconnected');
    this.device = null;
    this.server = null;
    this.service = null;
    this.characteristic = null;
  }
}

// Export type for use in components
export type { BluetoothDeviceInfo as BluetoothDevice };

// Export singleton instance
export const bluetoothService = new BluetoothServiceImpl();

