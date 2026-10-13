# Grimoire

A private, local-only notes app for Android (and iOS, via CI). Notes, checklists,
drawings, photos, and reminders live entirely on your device — no account, no
cloud, no analytics.

Free and open source — [github.com/karansingh-in/grimoire](https://github.com/karansingh-in/grimoire).

## Features

- **Notes** — text notes, checklists (reorder, complete, counts), freehand drawings
  (pen, eraser, inks, pinch-zoom), and photos (downscaled on-device)
- **Reminders** — one-shot reminders with a full-screen alarm UI (sound, vibration,
  snooze, dismiss), plus notification and tap-to-open the note
- **Organization** — pin, archive, trash/restore, labels, colors, grid/list layouts,
  sort orders, full-text search with match highlighting, duplicate
- **App lock** — fingerprint/face/device-credential unlock with relock on background,
  plus an offline app PIN fallback (salted SHA-256, throttled)
- **Encryption** — AES-256-GCM for notes and photos at rest, key held in the device
  keystore; exports stay readable plaintext as the escape hatch
- **Backup** — one-file JSON export/import (photos embedded), per-note PDF export
  via the system share sheet
- **Private keyboard** — requests incognito (no-learning) keyboards for every field

## Privacy model

- Everything is created and stored on-device: WebView storage for notes, app-private
  files for photos, Android Keystore for the encryption key.
- No network calls for note content. No account system, telemetry, ads, or servers.
- Honest limits (also stated in-app): encryption guards files at rest, not rooted
  devices or someone holding your unlocked phone; key loss without an export means
  data loss; exported files are readable text — keep them somewhere safe.

## Tech

React 19 + Vite + Tailwind CSS 4, wrapped with Capacitor 8. Native bits live in
`android/` (alarm stack, private-keyboard WebView, widget-ready bridges). iOS builds
are produced by CI (see below); day-to-day development targets Android + web.

Key libraries: `lucide-react` (icons), `jspdf` (PDF export), `@capacitor/*` (app,
filesystem, haptics, preferences, share), `@aparajita/*` (biometric-auth,
secure-storage).

## Quickstart

Requirements: Node.js 22, pnpm 10.

```sh
pnpm install
pnpm dev        # web preview with hot reload
pnpm build      # production web bundle into dist/
```

Other scripts: `pnpm preview` (serve `dist/`), `pnpm format` (oxfmt — note: oxfmt
0.2.0 mis-formats single-line TS type literals, so `App.tsx`/`DrawingCanvas.tsx`/
`types.ts` are verified with `tsc --noEmit` instead).

## Native builds (local)

```sh
pnpm build
npx cap sync android
cd android && ./gradlew assembleRelease   # JDK 21 required
```

Sign with `apksigner` + your own keystore (see *Release signing*). The repo never
contains keystores or APKs — both are git-ignored.

## CI — Android APK + iOS build

`.github/workflows/build.yml` runs on every push to `main` and on demand:

| Job | Runner | Output |
| --- | --- | --- |
| `android` | `ubuntu-latest`, JDK 21 | Installable **debug APK** artifact, always |
| `android-release` | same | **Unsigned release APK** always; **signed release APK** too when signing secrets exist |
| `ios` | `macos-latest` (Xcode) | Unsigned **IPA** artifact (sideloadable with re-signing, e.g. AltStore/Sideloadly) + compilation proof |

Release signing uses three repository secrets (nothing sensitive is committed):

- `ANDROID_KEYSTORE_BASE64` — base64 of your `.keystore`/`.jks`
- `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`

Generate one locally when needed:

```sh
keytool -genkeypair -keystore release.keystore -alias grimoire \
  -keyalg RSA -keysize 2048 -validity 10950
```

Keep that file (and its passwords) outside git — Android requires the *same*
signature for updates, so losing it means a fresh install for your users.

## Project structure

```
src/
  App.tsx                 # views, lock screens, sheets, editors
  types.ts                # data model (Note, Label, preferences)
  lib/
    storage.ts            # versioned localStorage payload, backup import/export
    crypto.ts             # AES-GCM envelope + keystore key handling
    images.ts             # downscale, Filesystem store, memory cache
    alarm.ts              # reminder schedule/mirror/pending-note bridge
    alarm-plugin.ts       # Capacitor bridge to the native alarm stack
    pdf.ts                # jsPDF builder + share-sheet handoff
  components/
    DrawingCanvas.tsx     # canvas, strokes, zoom, thumbnails, rasterizer
    ui.tsx                # buttons, inputs, switch, dialog primitives
android/app/src/main/
  java/com/grimoire/notes/  # MainActivity, Alarm{Plugin,Receiver,Activity},
                            # BootReceiver, PrivateWebView (incognito keyboard)
  res/                      # launcher icons (generated: scripts/gen-icon.mjs)
scripts/gen-icon.mjs      # regenerates launcher PNGs from pixel code, no assets
```

## Data & storage notes

- Payload: `{ schemaVersion: 1, notes, labels, images, preferences }` in
  `localStorage` (`private-notes:v1`), optionally AES-GCM encrypted as a whole.
- Photos live in app-private files (`images/<id>.jpg`), encrypted alongside when
  enabled. Backups embed them as base64.
- Reminders mirror into SharedPreferences (`grimoire-reminders`) so alarms survive
  reboot via `BootReceiver`.
- Import *replaces* local data and always lands unencrypted (keys don't transfer);
  re-enable encryption afterwards if you use it.

## License

MIT — see [LICENSE](LICENSE).
