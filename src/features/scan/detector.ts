export interface Detection {
  rawValue: string;
  format: string;
}

export interface Detector {
  detect(source: HTMLVideoElement): Promise<Detection[]>;
}

const FORMATS = ['ean_13', 'qr_code'];

interface NativeDetectorCtor {
  new (opts: { formats: string[] }): Detector;
  getSupportedFormats(): Promise<string[]>;
}

/**
 * Uses the browser's BarcodeDetector where it supports EAN-13 (Chrome on Android) and otherwise
 * the ZXing WebAssembly build, bundled locally so scanning works offline.
 */
export async function createDetector(): Promise<Detector> {
  const Native = (window as unknown as { BarcodeDetector?: NativeDetectorCtor }).BarcodeDetector;
  if (Native) {
    try {
      const supported = await Native.getSupportedFormats();
      if (FORMATS.every((f) => supported.includes(f))) return new Native({ formats: FORMATS });
    } catch {
      /* fall through to the WebAssembly build */
    }
  }
  const [{ BarcodeDetector, setZXingModuleOverrides }, { default: wasmUrl }] = await Promise.all([
    import('barcode-detector/ponyfill'),
    import('zxing-wasm/reader/zxing_reader.wasm?url'),
  ]);
  setZXingModuleOverrides({
    locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path),
  });
  return new BarcodeDetector({ formats: FORMATS as ('ean_13' | 'qr_code')[] }) as unknown as Detector;
}
