import { BarcodeDetector, prepareZXingModule } from "barcode-detector/ponyfill";

const WASM_URL = "/zxing/zxing_reader.wasm";

let detectorPromise: Promise<BarcodeDetector> | null = null;

/** The one shared decoder. Loads the self-hosted wasm; never the library's CDN default. */
export function getDetector(): Promise<BarcodeDetector> {
  detectorPromise ??= (async () => {
    await prepareZXingModule({
      overrides: {
        locateFile: (path, prefix) =>
          path.endsWith(".wasm") ? WASM_URL : prefix + path,
      },
      fireImmediately: true,
    });
    return new BarcodeDetector({ formats: ["qr_code"] });
  })().catch((error) => {
    detectorPromise = null;
    throw error;
  });
  return detectorPromise;
}
