# Kiosk printing: Chrome throttling, @page size, camera permission

Status: partial. R1 is answered from Chromium source. R2 and R5 are mostly unverified, and each gap is listed. Line numbers refer to the Chromium `main` files fetched from googlesource while writing this (approximate, since main moves). Everything else is marked as follows:

- **[confirmed]** read in source or a cited doc
- **[inferred]** follows from confirmed code but not tested
- **[verify on kiosk]** needs the real PC, Chrome and printer

Scope: Plan section 6 (`docs/plans/ui-kiosk-scanner.md:420-465`) and open questions R1, R2, R5 (`docs/plans/ui-kiosk-scanner.md:668-684`).

Current launch line, confirmed: `packaging/Start-Kiosk.ps1:77-82` passes `--kiosk`, `--kiosk-printing`, `--user-data-dir=...ChromeProfile` and the URL. The old app's ticket template is `../mbmc-qras/client/src/utils/printReceipt.js:64-125` (`@page { size: 80mm auto; margin: 0 }`). Its `printWindow.focus()` before `print()` (line 133) is not in the plan.

---

## R1. Throttling of repeated `print()`, `afterprint`, and back-to-back jobs

### Answer in short

- **Blink's "Ignoring too frequent calls to print()" throttle does not apply on this kiosk.** [inferred from confirmed code] It only runs when print preview is disabled. `--kiosk-printing` needs print preview on, because it auto-presses the preview's Print button.
- **`afterprint` does fire on the iframe's window** [confirmed from code], but only when the auto-started print preview dialog closes. That is after the job has been handed to the print pipeline, not before. Whether that is the same moment as the spooler accepting the job is [verify on kiosk].
- **The bigger risk is not throttling. It is silent dropping.** While a scripted print is in progress, a second `print()` returns without printing and without firing `afterprint` [confirmed from code]. The plan's single-flight queue must wait for `afterprint`, and must not treat "`print()` returned" as the end of the job unless it has also seen `afterprint`.
- **No evidence either way on whether several prints a minute, all day, degrade.** [verify on kiosk]

### Evidence

**1. The throttle exists, with these constants** [confirmed]
`ScriptingThrottler::IsAllowed` (`components/printing/renderer/print_render_frame_helper.cc`, about line 3278):
- Min wait 2 s. For calls after the third, the wait doubles up to 32 s. Comment says the user can expect `[2, 2, 2, 4, 8, 16, 32, ...]` seconds.
- Message: `"Ignoring too frequent calls to print()."` (about line 3310).
- `Reset()` runs after a successful print (about line 3316, called from the print path about line 2296).
- Source: https://chromium.googlesource.com/chromium/src/+/refs/heads/main/components/printing/renderer/print_render_frame_helper.cc

**2. The throttle is skipped when print preview is enabled** [confirmed]
`IsScriptInitiatedPrintAllowed` (about lines 1186-1202) returns `user_initiated || g_is_preview_enabled || scripting_throttler_.IsAllowed(frame)`. So the throttle runs only when `g_is_preview_enabled` is false.
- `g_is_preview_enabled` is set from `delegate_->IsPrintPreviewEnabled()` in the constructor (about line 1152).
- Chrome's delegate returns `!command_line->HasSwitch(switches::kDisablePrintPreview)` (`chrome/renderer/printing/chrome_print_render_frame_helper_delegate.cc:58-61`).
- So the throttle is off unless the browser is started with `--disable-print-preview`. The kiosk does not use that flag.

**3. `--kiosk-printing` keeps print preview on and auto-presses Print** [confirmed]
`chrome/common/chrome_switches.h:481-485`: `kKioskMode = "kiosk"`; `kKioskModePrinting = "kiosk-printing"` with the comment "Enable automatically pressing the print button in print preview."
- So with the flag, `window.print()` goes through the preview WebUI, which presses Print by itself.
- Source: https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/common/chrome_switches.h
- Historical: Chromium issue 339416 (2014) said kiosk printing still showed the dialog. Its fix (r260041, Mar 2014) was "start printing when destination is ready". A 2015 user said preview was still not skipped. Source: https://groups.google.com/a/chromium.org/g/chromium-bugs/c/BW_OjJSj4qk. This is old. Today's behavior is taken from the switch comment and the code above, not from the bug.
- The WebUI TypeScript that does the auto-press was not fetched (the path returned 404). [unverified]

**4. `window.print()` blocks until the preview closes** [confirmed from code, reading the call chain]
- Renderer: `SetupScriptedPrintPreview` runs a nested run loop (about lines 2831-2850) and waits for the browser's reply.
- Browser: `SetupScriptedPrintPreview` stores the reply callback in a map (`chrome/browser/printing/print_view_manager.cc`, about line 482-526). `PrintViewManager::PrintPreviewDone` runs that callback when the preview closes (about lines 239-270). `OnScriptedPrintPreviewReply` is what runs it (about line 77).
- So in preview mode, the JS `print()` call returns only after the preview dialog has closed.
- Source: https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/browser/printing/print_view_manager.cc
- [inferred] With auto-press, the dialog closes once the job has been sent to the print backend. Whether that is before or after the Windows spooler has finished taking the pages is [verify on kiosk]. Test by watching the Windows print queue while printing.

**5. `afterprint` on the iframe's window** [confirmed from code]
- `PrintPreviewDone` sends `OnPrintPreviewDialogClosed` to the frame. On Windows it is always sent (comment, `print_view_manager.cc` about line 246).
- The renderer then runs `print_preview_context_.DispatchAfterPrintEvent()` (`print_render_frame_helper.cc` about lines 1650-1664), which fires `afterprint` on the frame that called `print()`.
- So `afterprint` is after the dialog closes, which is after the job is sent. It is not before. It fires on the iframe's `contentWindow` because the iframe is the source frame.

**6. Back-to-back calls are dropped silently while a print is in progress** [confirmed from code]
- `ScriptedPrint` starts with `if (print_in_progress_ || print_with_params_callback_) return;` (about lines 1229-1231, re-checked at 1246-1250).
- In preview mode `print_in_progress_` is set true and cleared only in `OnPrintPreviewDialogClosed` (about lines 1650-1664) or on the Print path.
- So a `print()` call made while the previous preview is still open does nothing: no print, no `afterprint`, no exception.
- Consequence for the plan: a job is done on `afterprint` (with a timeout), not on `print()` returning. If `afterprint` never fires, `print_in_progress_` may stay true, and every later `print()` is silently ignored. Plan fix: a 10 s watchdog. If it trips, mark the job failed and reload the page to reset the renderer state. [inferred; the reload reset is not tested]

**7. Reload and counters** [confirmed from code, inferred for the kiosk]
- The throttle counter lives in `ScriptingThrottler`, which is per `PrintRenderFrameHelper` (per frame/document). It resets on a successful print, and a reload creates a new helper. So reload is not needed for the throttle, because the throttle is not active with preview on.
- A reload would still clear `print_in_progress_` if it was stuck (point 6).

### What is still open for R1

- Whether the auto-press WebUI behaves the same on the Chrome version the kiosk runs. Check `chrome://version`. [verify on kiosk]
- Whether printing many jobs back to back (about one a minute, or a few seconds apart) degrades. No source found. [verify on kiosk]
- Whether `afterprint` fires before or after the Windows spooler has the job. Watch the print queue. [verify on kiosk]

---

## R2. `@page { size: 80mm auto; margin: 0 }` on a silent thermal printer

### Answer in short

- **Chrome does read CSS page size when printing, and it prefers it over the default paper size.** [confirmed from code, partial] In `print_render_frame_helper.cc` (about lines 2258-2270), `print_scaling_option` is set to `kSourceSize` when `prefer_css_page_size` is true. That means the CSS size is used for the page layout.
- **Whether the printer driver's paper size then overrides it is unverified.** Search results point to two things: CSS size does not change the paper the printer feeds, and Chrome's own print dialog uses the printer's default size (secondary forum sources, not official). [unverified, verify on kiosk]
- **Blank feed, `auto` height, and driver paper settings are unverified.** The old app used `auto` height and was reported to work. Test before changing it.
- **The fallback recipe is not established.** Candidates: (a) keep the old `@page` rule and set the driver paper to the 80 mm roll; (b) set a fixed height in the CSS; (c) set Chrome's default margins to none. Only (a) is the old, known-working setup.

### Evidence

- Plan: keep `@page` byte-for-byte until tested (`docs/plans/ui-kiosk-scanner.md:434`).
- `print_render_frame_helper.cc` (`prefer_css_page_size`): https://chromium.googlesource.com/chromium/src/+/refs/heads/main/components/printing/renderer/print_render_frame_helper.cc
- Search lead (title only, not read): Chromium issue 79847 "Page set to landscape by CSS is printed with portrait dimensions" (https://groups.google.com/a/chromium.org/g/chromium-bugs/c/dTz8xlegaJA). It is old and about orientation. [unverified relevance]
- Secondary forum sources (not official): CSS size does not set the physical feed; Chrome's dialog takes the printer default size; Edge later honored CSS size. Sources: https://kaweah.freedombox.rocks/kiwix/stackoverflow.com_en_all_2023-11/questions/19892484/set-printer-paper-size-through-css (search-result summary only). [unverified]
- Not found: an official Chrome or vendor doc (Xprinter, Epson TM-T20/T82, POS-80) stating how a silent print picks paper size, or how to stop blank feed.

### Recipe to test on the kiosk (not established)

1. Keep the old `@page { size: 80mm auto; margin: 0 }` rule. [confirmed as the old, deployed rule]
2. In the Windows printer properties for the thermal printer, set the paper/roll size to 80 mm (or the driver's "80mm continuous" choice) and the printable area to the full width. [verify on kiosk, vendor-specific]
3. Check the Chrome print preview once, by hand, on the kiosk's profile: paper size, margins "None", scale "Default" or "100%". Chrome saves these per printer in the profile, so the silent print reuses them. [inferred, verify on kiosk]
4. Measure the blank tail. If there is one, try (b): add a fixed height to `@page` (for example `size: 80mm 120mm`) and check whether the driver cuts or feeds. [verify on kiosk]
5. Check that the number and the name are not clipped at 72 mm printable width (plan open question R2 mentions this). [verify on kiosk]

Not verified: the Chrome managed policy `PrintingPaperSizeDefault` / `PrintingMarginsDefault` (Chrome Enterprise policy list). Their exact names and registry form were not fetched. If they exist, they would be the enterprise way to set paper size and margins. [unverified]

---

## R5. Camera permission for `http://localhost:3000` without a prompt

### Answer in short

- **Best option: the `VideoCaptureAllowedUrls` policy** [partly confirmed]. Its name and description are confirmed: "URLs that will be granted access to video capture devices without prompt" (https://chromeenterprise.google/policies/video-capture-allowed-urls/). The registry path, value type, and whether `http://localhost:3000` is accepted were not confirmed. [unverified]
- **`--use-fake-ui-for-media-stream`: not for production.** It is a test switch that grants the media permission without asking, and secondary sources say it also covers screen sharing. It is not a camera allow-list. Its official definition was not found in Chromium source. [partly confirmed, secondary sources]
- **Profile preference (content settings exception): not researched.** Editing the profile file is fragile, and Chrome checks some preferences with a signature. [unverified]
- **Windows privacy setting: not researched.** Windows must allow desktop apps to use the camera, or Chrome gets no camera. [verify on kiosk]

### Evidence

- `VideoCaptureAllowedUrls` description: https://chromeenterprise.google/policies/video-capture-allowed-urls/ (page fetched, only the title was returned). Not verified: registry path under `HKLM\SOFTWARE\Policies\Google\Chrome\`, whether it needs `VideoCaptureAllowed`, whether scheme and port matching works for `http://localhost:3000`.
- `--use-fake-ui-for-media-stream`: WebRTC testing docs say it skips the camera and mic permission step (https://webrtc.github.io/webrtc-org/testing). chrome-launcher docs say it selects the default device and pairs with `--use-fake-device-for-media-stream` (https://raw.githubusercontent.com/GoogleChrome/chrome-launcher/HEAD/docs/chrome-flags-for-tools.md). A chromium-discuss thread says it also auto-grants screen capture (https://groups.google.com/a/chromium.org/g/chromium-discuss/c/HwnArLXPyNQ, search-result summary only).
- Localhost is a secure context, so `getUserMedia` works over `http://localhost` without HTTPS. [inferred from the browser secure-context rule; not fetched]

### How each option would be applied on Windows

| Option | How | Status |
|---|---|---|
| `VideoCaptureAllowedUrls` | Registry value under `HKLM\SOFTWARE\Policies\Google\Chrome\VideoCaptureAllowedUrls` (numbered string values) | [unverified path and format] Applied by the installer, not `Start-Kiosk.ps1`. |
| `--use-fake-ui-for-media-stream` | Add to the Chrome command line in `packaging/Start-Kiosk.ps1` | Not recommended. Grants to every origin in that browser. |
| Profile content setting | Edit `Default/Preferences` in `%LOCALAPPDATA%\QR Attendance\ChromeProfile` before launch | [unverified] Chrome may reject or rewrite edited protected prefs. |
| Windows camera privacy | Settings > Privacy & security > Camera > allow desktop apps | [verify on kiosk] |

Recommendation for planning: use the policy (installer writes the registry value), keep `Start-Kiosk.ps1` free of `--use-fake-ui-for-media-stream`, and confirm the policy works on the kiosk's Chrome version by checking `chrome://policy` and getting one prompt-free camera start.

---

## Checks to run on the real kiosk

1. `chrome://version`: record the Chrome version. Chrome updates can change print and policy behavior.
2. Run the kiosk print path with a test scan 20 times at about 5 s apart and 20 times at about 60 s apart. Count tickets printed, and count `afterprint` events. Watch the Windows print queue for dropped or stuck jobs. Note whether any `print()` call was silently ignored.
3. Measure when `afterprint` fires against when the job leaves the Windows print queue. Record whether `afterprint` can fire before the job is finished.
4. Force a stuck preview (for example, leave the printer offline once) and check that the 10 s watchdog and reload recover the kiosk.
5. Print one ticket with the existing `@page { size: 80mm auto; margin: 0 }`. Check paper width, clipping of the number and name, and blank tail length. Then try the driver paper size settings from section R2 and record the result for each printer model (Xprinter, Epson TM-T20/T82, POS-80).
6. Open the kiosk's print preview once by hand to see the paper size, margins and scale Chrome saved for that printer.
7. Check `chrome://policy` after installing the `VideoCaptureAllowedUrls` registry value. Confirm the camera starts with no prompt on `http://localhost:3000`.
8. Check Windows Settings > Privacy & security > Camera allows desktop apps.
9. Confirm the camera works after a reboot and after the kiosk's Chrome profile is reset.

## Sources

- Chromium `print_render_frame_helper.cc`: https://chromium.googlesource.com/chromium/src/+/refs/heads/main/components/printing/renderer/print_render_frame_helper.cc
- Chromium `chrome_print_render_frame_helper_delegate.cc`: https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/renderer/printing/chrome_print_render_frame_helper_delegate.cc
- Chromium `chrome_switches.h`: https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/common/chrome_switches.h
- Chromium `print_view_manager.cc`: https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/browser/printing/print_view_manager.cc
- Chromium issue 339416: https://groups.google.com/a/chromium.org/g/chromium-bugs/c/BW_OjJSj4qk
- Chrome Enterprise, VideoCaptureAllowedUrls: https://chromeenterprise.google/policies/video-capture-allowed-urls/
- WebRTC testing: https://webrtc.github.io/webrtc-org/testing
- chrome-launcher flags: https://raw.githubusercontent.com/GoogleChrome/chrome-launcher/HEAD/docs/chrome-flags-for-tools.md
- Old app print code: `/home/mdk0/Projects/mbmc-qras/client/src/utils/printReceipt.js`
- Current kiosk launch: `/home/mdk0/Projects/mbmc-qrawb/packaging/Start-Kiosk.ps1`
