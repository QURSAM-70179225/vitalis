/**
 * Read text from a photo (OCR), fully on this device.
 * 1. The browser's built-in TextDetector when it exists (fast, no download).
 * 2. Otherwise Tesseract.js, loaded only when needed from this app's own files
 *    (/tesseract/…, see vite.config.ts). No CDN; works offline after the first use.
 */
interface DetectedText {
  rawValue: string;
}
interface TextDetectorLike {
  detect(src: ImageBitmapSource): Promise<DetectedText[]>;
}
declare global {
  interface Window {
    TextDetector?: new () => TextDetectorLike;
  }
}

export type OcrProgress = (stage: string, fraction: number | null) => void;

const STAGES: Record<string, string> = {
  'loading tesseract core': 'Loading the text reader',
  'initializing tesseract': 'Starting the text reader',
  'loading language traineddata': 'Loading English',
  'initializing api': 'Getting ready',
  'recognizing text': 'Reading the photo',
};

/** Scale large phone photos down (OCR is faster and just as accurate at ~2000 px). */
async function prepare(file: Blob): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const max = 2000;
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (scale === 1) return file;
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext('2d')?.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise<Blob>((r) => c.toBlob((b) => r(b ?? file), 'image/png'));
  } catch {
    return file;
  }
}

export async function readTextFromImage(file: Blob, onProgress?: OcrProgress): Promise<string> {
  if (window.TextDetector) {
    try {
      const lines = await new window.TextDetector().detect(await createImageBitmap(file));
      const t = lines.map((l) => l.rawValue).join('\n');
      if (t.trim()) return t;
    } catch {
      /* fall through to Tesseract */
    }
  }
  onProgress?.('Loading the text reader', null);
  const { createWorker, OEM } = await import('tesseract.js');
  const worker = await createWorker('eng', OEM.LSTM_ONLY, {
    workerPath: '/tesseract/worker.min.js',
    corePath: '/tesseract/core',
    langPath: '/tesseract/lang',
    gzip: true,
    workerBlobURL: false,
    logger: (m: { status: string; progress: number }) => onProgress?.(STAGES[m.status] ?? 'Working', typeof m.progress === 'number' ? m.progress : null),
  });
  try {
    const { data } = await worker.recognize(await prepare(file));
    return data.text;
  } finally {
    await worker.terminate();
  }
}
