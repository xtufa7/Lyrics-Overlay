# Verification — 2.2.0

18 October 2026 · Windows 11 x64 build 26200 · Electron 44.9.0 · Spicetify 2.45.3.

## Completed

- TypeScript validation and application/extension build pass.
- **30 engine/protocol tests pass**: schemas, Spicetify snapshots, unpaired behavior, stale sequence rejection, origin/auth/revocation, LRC/TTML parsing and ranges, strict version/metadata matching, provider fallback/cache/import priority, cancellation, monotonic pause/seek/end recovery, Unicode directions, upcoming cue selection, translation ID validation, local endpoint restrictions, contextual AI request construction and translation caching.
- **63 real Electron checks pass**: native window geometry, always-on-top/non-focusability, renderer sandbox/role restrictions, authenticated WebSocket, Arabic right-origin/English left-origin animation, Japanese and mixed text, real-timing karaoke/pause, current plus next sentence, permanently frameless rendering despite legacy border settings, saved-position restoration plus visibility, edit mode, partial settings, per-track offset, encrypted key state redaction, developer attribution, rapid tracks, disconnect, restart persistence and token reconnection. A local Ollama-protocol fixture also verified translation appearing on the actual overlay and restoration from cache after restart. Quitting with an authenticated socket now closes cleanly, with no destroyed-tray/main-process exceptions or renderer/CSP errors. Screenshots use original fixture phrases.
- **Real installed Spotify connection verified** after one-click setup, without manual pairing: actual playback events arrived and LRCLIB supplied **93 synchronized lines** for the real track. Personal track metadata and full lyric text are intentionally excluded from public artifacts. This is distinct from fixture-based protocol tests.
- A native Windows click-through check delivered actual Windows mouse input through the transparent Arabic overlay to a separate underlying window. The check used the computer-use `@oai/sky` API rather than a DOM-synthesized click.
- The previous installed 1.0.0 application was removed through its registered uninstaller. Its executable and uninstall entry were verified absent. Project source and a local settings backup were retained.
- MyMemory's real HTTPS endpoint was checked with a short non-lyrical test phrase. Gemini/Ollama adapters also have deterministic protocol tests. In 2.2, a real configured Gemini request returned 30 translated lines while the companion was connected to the installed Spotify client; the request was then stopped after the first batch. This verifies live delivery, not human-reviewed translation quality. No installed Ollama model was evaluated live.
- Dependency audit reported zero known vulnerabilities at verification time.

The final NSIS installer and portable ZIP were built successfully. The packaged executable passed the same 63 Electron checks, including authenticated shutdown, with zero main-process or renderer exceptions. SHA256SUMS.txt accompanies the downloadable binaries. A successful build or audit is not a claim that every Windows configuration has been certified.

## Manual limits

The exact browser/Discord/desktop combination, multiple physical monitors with different DPI, every GPU/compositor, every startup configuration and clean-VM installation/uninstallation remain manual release QA. Native independently rendered windows and click-through were checked, but no compatibility claim is made for exclusive-fullscreen/protected applications. No security/anti-cheat protections are bypassed.

Gemini uses a user-supplied key/model and is subject to that provider's availability, limits and billing. Ollama requires a locally installed model/server. MyMemory is basic, limited and less contextual. Translation doesn't manufacture new word timings. TTML sequential containers, overlapping paragraphs and drop-frame/wall-clock timing remain explicitly unsupported.

To reproduce: `npm run check`, `npm run test:desktop`, `npm run dist`, then `npm run test:packaged`. Tests use isolated profiles on port 43828; production remains on 43827. Do not run multiple desktop suites at once. For real Spotify QA, start the companion, use Connect/Repair and inspect actual playback, pause, seeks, next cues and reconnection. Do not publish personal profile files or live lyric captures.

## 2.1 additions

English/LTR interface, five themes with actual color changes, compact About and artwork, constrained Spotify cover URLs, optional cover display, estimated current-word movement and pause, exact-only behavior, independent translation colors/glow/position, immediate translation hiding/restoration, circular tour skipping/persistence, automatic bidirectional target selection and style-specific translation caches are covered.

A native screenshot verified the updated extension delivering real Spotify artwork, current/next lyrics and moving word indication. No personal lyric capture is published. The extension bundle is 4,522 bytes before local credential provisioning. Visual estimates never modify source timestamps and are clearly labeled.

## 2.2 additions

The desktop suite additionally checks bundled font selection, all four surfaces, long-line fitting, natural cue-boundary transitions, complete named setup restoration, secret-free settings export/import, actual GitHub avatar, creator-credit toggle, brief disconnect retention, token reconnect and setup persistence after restart. New engine checks cover tolerant settings recovery, safe reprovisioning and current-line-first keyless translation. Public screenshots use an isolated profile and original demonstration text.
