# Camera QR scanning for the kiosk: library comparison

Date: 2026-11-18. Scope: the kiosk scanner for mbmc-qrawb (Next.js 16.4.6, React 19, Turbopack).
Constraints: offline LAN, no CDN at runtime, Chrome on Windows in kiosk mode, low-end PC, cheap USB webcam, QR payload is an employee ID only.

Status: this is a desk study. No library was installed and no camera test was run. Decode reliability on the real webcam and worn cards is unverified and must be checked in a spike (see Risks).

## 1. What the old app does

- Old package: `../mbmc-qras/package.json:15` depends on `html5-qrcode@^2.3.8`.
- The camera code is dead. The `<section>` holding `<div id="reader">` is wrapped in a JSX comment, `client/src/pages/Scanner.jsx:687-793` in the working tree. The committed HEAD has the same comment at lines 786-892. The camera never starts.
- The live code still runs `new Html5Qrcode("reader")` inside `startScanner` (`Scanner.jsx:479-512`). The element does not exist, so the constructor throws (`node_modules/html5-qrcode/esm/html5-qrcode.js:89`, `HTML Element with id=... not found`). The `try` catches it and only sets an error that nothing displays. This is harmless but wasteful.
- Old camera settings, had they been live: `facingMode: "environment"`, `fps: 10`, `qrbox 240`, `aspectRatio 1` (`Scanner.jsx:486-493`). No device selection and no permission-specific messages.
- `client/src/main.jsx:4` turns StrictMode off because "its double-mount in dev would start the camera twice." The new app has StrictMode on by default in the App Router (`node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/reactStrictMode.md:8`), so the scanner must survive a double mount.
- The stop path races with start. `started` is only set after `start()` resolves (`Scanner.jsx:554-575`), so an unmount during start calls `stop()` on a scanner that is still starting.

### USB HID (keyboard-wedge) input: the old app supports it

- `Scanner.jsx:523-552` (approximately; the handler is defined just above the `addEventListener` at line 546) adds a capture-phase `keydown` listener on `document`.
- It ignores events whose target is `INPUT`, `TEXTAREA`, `SELECT` or contentEditable.
- It buffers printable keys. A gap of more than 300 ms resets the buffer. `Enter` submits the buffer through `submit(code)`.
- So a HID scanner typing the ID and pressing Enter works today. This is the only live input path.

### Server-side duplicate handling

- `server.js:16`: `COOLDOWN_MIN = 180`.
- `server.js:570-583`: a scan within the cooldown returns HTTP 429 with `status: "duplicate"` and a message. The client reads the JSON body regardless of status.
- The client has its own gate: `submit` returns early while `busy.current` is set, released 2500 ms later (`Scanner.jsx`, `releaseTimer`). Both HID and any future camera path go through this same `submit`.

### Visible problem in the same scan path (not a scanner library issue)

- `server.js:632-637`: `/api/attendance/today` defaults `date` to `new Date().toISOString().slice(0, 10)`, which is the UTC date. That conflicts with the `APP_TIMEZONE` rule in `CLAUDE.md`. Flag it for the backend plan.

## 2. Native BarcodeDetector on Windows Chrome

- MDN compatibility data (`mdn/browser-compat-data`, `api/BarcodeDetector.json`): Chrome support starts at version 88 as a partial implementation, with the note "Supported on ChromeOS and macOS only." Chrome 83 was the earlier entry with "Supported on macOS only." Edge has the same macOS-only note. Firefox has no support. Safari 17 is behind a preference.
- Result: desktop Chrome on Windows does not have `BarcodeDetector`. The kiosk must decode in JavaScript or WASM. Source: https://github.com/mdn/browser-compat-data/blob/main/api/BarcodeDetector.json (MDN data, fetched via the GitHub API on 2026-11-18).
- Some third-party pages say the API works on "Chrome desktop". Those claims conflict with MDN and are not used here.

## 3. Candidate comparison

All numbers from npm (`npm view`), GitHub (`gh api`, `gh issue list`), bundlephobia (`https://bundlephobia.com/api/size?package=…`) and the npm READMEs. Weekly downloads are npm's last full week, which differs by package (2026-11-10 to 11-17). Gzip sizes are bundlephobia's and exclude WASM binaries.

| Library | Latest release | Weekly downloads | License | Open issues / archived | Gzip size | Offline / CDN by default | Native deps |
|---|---|---|---|---|---|---|---|
| html5-qrcode 2.3.8 | 2023-04-15 | 2.19 M | Apache-2.0 | 453 / no (pushed 2025-12-01) | 107 KB | No CDN in ESM build (grep of `esm/*.js` finds only a link to scanapp.org in UI code) | none |
| @zxing/browser 0.2.1 | 2026-07-06 | 2.21 M | MIT | 56 / no (pushed 2026-07-06) | 7 KB (+ @zxing/library 120 KB) | No CDN in the module build; the README's CDN examples are for script tags only | @zxing/library (pure JS) |
| @zxing/library 0.23.0 | 2026-04-29 | 3.33 M | Apache-2.0 | 190 / no | 120 KB | none | ts-custom-error. `engines: node >= 24`, a build-time warning only |
| zxing-wasm 3.1.7 | 2026-11-15 | 5.89 M | MIT | 3 / no | 14 KB JS, plus about 1.04 MiB reader WASM | **Yes**: the WASM path defaults to jsDelivr (`zxing-wasm.md:266-268`) | none (types from @types/emscripten) |
| barcode-detector 3.2.4 | 2026-11-15 | 4.72 M | MIT | 1 / no | 15 KB JS, plus WASM via zxing-wasm | **Yes**: default WASM from jsDelivr (`barcode-detector.md:189`) | zxing-wasm |
| qr-scanner 1.4.2 | 2022-11-23 | 0.74 M | MIT | 119 / no (pushed 2024-03-30) | 6 KB + worker file | Worker is a separate file. Set `QrScanner.WORKER_PATH` and copy the worker to `public/` (`qr-scanner.md:36-40`) | @types/offscreencanvas |
| jsQR 1.4.0 | 2021-04-24 | 7.10 M | Apache-2.0 | 98 / no (pushed 2026-05-15) | 46 KB | No CDN. Decoder only, no camera code | none |
| @yudiel/react-qr-scanner 2.6.0 | 2026-05-13 | 0.36 M | MIT | 0 / no (pushed 2026-06-03) | 59 KB | Inherits barcode-detector's WASM default; override with `setZXingModuleOverrides` (`_yudiel_react-qr-scanner.md:368-380`) | barcode-detector, webrtc-adapter; peer react 17–19 |

### Per-library notes

**html5-qrcode (old app's choice).** Strengths: complete camera handling (`getCameras`, facing mode, torch button via `showTorchButtonIfSupported`), no network calls, and the old app already uses it. Weaknesses: last release in 2023, 453 open issues, and open bugs that matter here. `#944` "Camera does not stop scanning" throws when stopped before start completes. `#916` reports two cameras appearing after reload in Next.js on Windows 11 in Chrome, Firefox and Edge. `#1050` and `#634` cover torch problems. Its success callback fires on every successful decode (`html5-qrcode.js:543`), with no dedupe; the caller must debounce. Decoder engine is not identified in this study (unverified). Verdict: works, but it is the library the old app already had problems with, and its maintenance is stale.

**@zxing/browser (+ @zxing/library).** Strengths: MIT/Apache, pure JS, no WASM, frequently updated (2026). Camera control: `decodeFromVideoDevice` / `decodeFromConstraints` return `controls.stop()` and `switchTorch()`. Weaknesses: `#128` (Next.js) "stop() not stopping decodeFromConstraints", callback keeps firing. `#67` "The associated Track is in an invalid state" after `controls.stop()` in Chrome. `#115` a missing `await` makes `switchTorch` errors uncatchable. The scan loop (`BrowserCodeReader.ts`, `loop()` and `delayBetweenScanSuccess`, default 500 ms; `delayBetweenScanAttempts` 500 ms) re-invokes the callback every 500 ms while a code stays in view, so duplicate suppression is ours. Verdict: viable, but its stop behavior is the riskiest part and the open issues cover exactly that.

**zxing-wasm (engine only).** Strong decoder (ZXing-C++). Offers `readBarcodes(ImageData | Blob | ...)`, so the camera loop is ours. Must serve the WASM ourselves: `prepareZXingModule` with `overrides.locateFile` (`zxing-wasm.md:270-290`). Issues: 3 open, maintained. Verdict: use through barcode-detector instead of directly, unless we want to skip the polyfill layer.

**barcode-detector (polyfill of the BarcodeDetector API).** Uses native `BarcodeDetector` when present and zxing-wasm otherwise (`barcode-detector.md:91-98`). On Windows Chrome it will use WASM. It is detector-only: we write the camera loop (`getUserMedia`, device selection, torch/focus via track constraints, `stop()` on all tracks). Explicit offline override: `prepareZXingModule` with `locateFile` pointing to a self-hosted copy of `zxing_reader.wasm` (`barcode-detector.md:189-207`, `zxing-wasm.md:266-290`). It re-exports `ZXING_WASM_VERSION` and `ZXING_WASM_SHA256`, so the served file can be checked against the installed version. Verdict: the best fit. Maintained (2026-11-15 release, 1 open issue), MIT, and the offline path is documented.

**qr-scanner (nimiq).** Small (6 KB). Built-in camera handling: `hasCamera`, `listCameras`, `setCamera`, `hasFlash`/`turnFlashOn`, `destroy()` (`qr-scanner.md:187-248`), and `maxScansPerSecond` default 25. Problems: last release 2022-11-23, repo last pushed 2024-03-30, 119 open issues. `#206` worker fails without internet. `#221` the Blob-based worker breaks under strict CSP. Requires copying `qr-scanner-worker.min.js` into `public/`. No dedupe. Verdict: usable and small, but stale and has offline/CSP issues in its tracker.

**jsQR.** Pure decoder, 2021 release, no camera handling and no dedupe. In the only public benchmark (danimoh/qr-scanner-benchmark, `result.txt`, dated 2023), jsQR ("cozmo") decoded 78% of "small, low res" images against 93% for the ZXing JS library. That benchmark is dated and not run on current engines, so it is weak evidence. Verdict: no camera code, weaker than the ZXing engines on low-res input in the only data we have. Not recommended.

**@yudiel/react-qr-scanner.** The React component built on barcode-detector. Strengths: typed `onError` with kinds (`permission-denied`, `no-camera`, `in-use`, `overconstrained`, `insecure-context`), a `paused` prop, `allowMultiple` (default `false`, so same-code repeats are suppressed by default) with `scanDelay`, `torch`/`zoom` controls, and a documented `next/dynamic({ ssr: false })` wrapper (`_yudiel_react-qr-scanner.md:624-660`). Weaknesses: small user base (362 k weekly downloads), extra `webrtc-adapter` dependency, and an unmount race (`#15`, closed 2023-11-16, camera kept running when a modal closed before init). Its `in-use` error on Windows means another app holds the camera, which matters for the kiosk. Verdict: a viable shortcut that saves writing the camera loop, but we give up some control over stop/StrictMode behavior.

## 4. Ranked recommendation

1. **barcode-detector (zxing-wasm engine) with a small in-house camera hook.** Best decoder path for Windows Chrome, MIT, actively maintained, and offline with a documented WASM override. We own the `getUserMedia` lifecycle, duplicate policy and HID coexistence. Cost: about 100–150 lines of camera code and one ~1 MB WASM file in `public/`.
2. **@yudiel/react-qr-scanner.** Same engine and offline override, less code. Fallback if the in-house hook proves harder than expected. Accept its StrictMode/unmount risk and test it.
3. **html5-qrcode.** Only if we want the old library. It works, but its stop bugs and stale release make it the weakest option that still has a complete camera layer.
4. **@zxing/browser.** Fallback. Pure JS and well-maintained, but stop/torch issues.
5. **qr-scanner.** Small, stale; offline worker and CSP issues.
6. **jsQR.** Not recommended (no camera code, weakest low-res evidence).
7. **zxing-wasm alone.** Use via barcode-detector instead.

Native `BarcodeDetector`: not available on Windows Chrome (MDN). Do not rely on it. Feature-detect and use the polyfill.

## 5. Setup for the top pick, fully offline under Turbopack

1. `npm install barcode-detector` (the package pulls in `zxing-wasm` 3.1.7; pin the version and record `ZXING_WASM_VERSION`).
2. Copy `node_modules/zxing-wasm/dist/reader/zxing_reader.wasm` into `public/` (the reader subset, about 1.04 MiB; `zxing-wasm.md:153-155`). Commit it or copy it in a build step, and verify the SHA-256 against `ZXING_WASM_SHA256`.
3. Before the first detection, call `prepareZXingModule({ overrides: { locateFile: (path) => path.endsWith(".wasm") ? "/zxing_reader.wasm" : path } })` (API per `zxing-wasm.md:270-290`; the barcode-detector wrapper is `barcode-detector.md:189-207`). Do this in a client module, not on the server. Mark the scanner `"use client"` and load it with `next/dynamic(..., { ssr: false })` from a client component (`node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md:66-71, 94-95`).
4. Keep the Turbopack import path simple. Serving the WASM from `public/` avoids Turbopack asset handling. Do not rely on `new URL(…, import.meta.url)` for the WASM unless tested.
5. Standalone build: `output: "standalone"` does not copy `public/`. Copy it manually (`cp -r public .next/standalone/`), as stated in `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md:49-54`. The Inno Setup installer must include it too.
6. If a CSP is ever added, add `'wasm-unsafe-eval'` (`node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md:721`).
7. Verify offline: disconnect the network, load `/`, confirm the WASM request is same-origin in the network panel.

## 6. Risks

- **Decode reliability is unverified.** No source tests the cheap USB webcam or worn ID cards. The only data is a 2023 benchmark on other engines. Gate the choice on a spike with the real webcam, real cards and the Windows kiosk setup (fixed focus, low light, cards held up to the lens).
- **Camera contention on Windows:** the built-in Camera app or another tab can lock the device (`in-use`). Show a clear message and retry.
- **Two-camera bug class** (html5-qrcode `#916`): with StrictMode, the camera can be started twice. Our hook must stop all tracks on cleanup and guard against double start.
- **Stop-before-start races** (html5-qrcode `#944`, yudiel `#15`, zxing-browser `#128`): make start cancellable and stop tracks regardless of state.
- **Duplicate and HID coexistence:** the camera can decode the same card every frame. Debounce locally per code (for example 3–5 s) and route both camera and HID through the same `submit` gate so the 2.5 s busy lock and the server's 180-minute cooldown still apply. Keep a focused `<input>` out of the kiosk page so HID keystrokes do not land in a text field (the old handler ignores keys typed into inputs, `Scanner.jsx:524-545`). Parse the 429 body as normal data.
- **WASM size and first-load time** (about 1 MB) on a low-end PC: pre-warm with `prepareZXingModule()` at mount.
- **Supply-chain:** barcode-detector and zxing-wasm are maintained by one author (Sec-ant). Pin versions and keep a vendored copy of the WASM.
- **Types:** npm metadata shows no `types` field for `zxing-wasm` or `barcode-detector`. TypeScript support is unverified. Check the exports map during the spike.
- **Unverified:** whether `barcode-detector` loads the reader or full WASM by default; whether yudiel's `sound` option needs a bundled asset; StrictMode behavior of yudiel's source (only its README and issue `#15` were checked).

## Sources

- Old app: `../mbmc-qras/package.json:15`, `client/src/pages/Scanner.jsx:479-512, 523-552, 554-575, 687-793`, `client/src/main.jsx:4`, `server.js:16, 570-583, 632-637`
- Installed html5-qrcode: `../mbmc-qras/node_modules/html5-qrcode/esm/html5-qrcode.js:89, 543`
- Next.js 16.4.6 docs: `node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md`, `…/03-api-reference/05-config/01-next-config-js/reactStrictMode.md`, `…/output.md`, `…/02-guides/content-security-policy.md`
- MDN BarcodeDetector compat: https://github.com/mdn/browser-compat-data/blob/main/api/BarcodeDetector.json
- npm registry metadata and READMEs for each package (`npm view`)
- Downloads: https://api.npmjs.org/downloads/point/last-week/<package>
- Bundle sizes: https://bundlephobia.com/api/size?package=<package>
- GitHub: https://github.com/mebjas/html5-qrcode/issues/944, /916, /1050, /634; https://github.com/zxing-js/browser/issues/128, /67, /115; https://github.com/nimiq/qr-scanner/issues/206, /221; https://github.com/yudielcurbelo/react-qr-scanner/issues/15
- zxing-browser source: https://github.com/zxing-js/browser/blob/master/src/readers/BrowserCodeReader.ts (fetched via GitHub API)
- Benchmark (dated, 2023, not current engines): https://github.com/danimoh/qr-scanner-benchmark (`result.txt`)
