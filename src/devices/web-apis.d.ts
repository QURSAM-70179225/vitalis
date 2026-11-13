/** Minimal typings for Web Bluetooth and Web Serial (not yet in lib.dom). */
interface BluetoothRemoteGATTCharacteristic extends EventTarget {
  value?: DataView;
  startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
}
interface BluetoothRemoteGATTService {
  getCharacteristic(uuid: number | string): Promise<BluetoothRemoteGATTCharacteristic>;
}
interface BluetoothRemoteGATTServer {
  connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryService(uuid: number | string): Promise<BluetoothRemoteGATTService>;
}
interface BluetoothDevice extends EventTarget {
  id: string;
  name?: string;
  gatt?: BluetoothRemoteGATTServer;
}
interface Bluetooth {
  requestDevice(opts: { filters: { services: (number | string)[] }[]; optionalServices?: (number | string)[] }): Promise<BluetoothDevice>;
}
interface SerialPort {
  open(opts: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  getInfo(): { usbVendorId?: number; usbProductId?: number };
}
interface Serial {
  requestPort(opts?: { filters?: { usbVendorId?: number }[] }): Promise<SerialPort>;
}
interface Navigator {
  bluetooth?: Bluetooth;
  serial?: Serial;
}
