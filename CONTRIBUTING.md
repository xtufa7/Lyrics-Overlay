# Contributing

Keep the extension on documented Spicetify APIs. Do not introduce credential extraction, undocumented lyric endpoints, game injection or bypasses. Add providers through `LyricsProvider` and validate complete track metadata. Preserve cancellation so stale track responses never reach the renderer.

Do not split Arabic glyphs into individual elements. The full text must remain shaped; use actual word timestamps and visual range masks. Never synthesize timing for production lyric data. Keep first-strong direction detection, browser bidi processing and bundled offline font fallbacks.

Run `npm run check`, `npm run test:desktop`, `npm run dist`, then `npm run test:packaged` on Windows. Add focused regression tests for parser, timing, provider, state, security or persistence changes. Native click-through and real Spotify playback still require an interactive Windows desktop. Check the acceptance matrix in `docs/VERIFICATION.md` before a release.

The desktop integration tests launch temporary profiles under ignored `work/` on test-only port 43828; they do not use personal Spotify credentials or your normal companion settings. Production is on 43827. Do not run multiple desktop suites simultaneously. Test fixture lyric phrases are original; do not add copyrighted full song lyrics, live account captures, installed provisioned extensions or secrets to tests/screenshots/releases.

Use an accessible, dark settings interface. All controls should update the real overlay as well as its preview. The overlay itself should remain minimal, with no permanent controls outside Edit Mode. New IPC methods must validate the originating window, exact frame URL, role and argument schema.

For releases, pin dependencies through the lockfile, include third-party licenses, sign with a real publisher certificate if available, and test installation/uninstallation in a clean supported Windows VM. Report verified and unverified checks separately.
