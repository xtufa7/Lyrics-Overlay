# Implementation milestones

1. Inspect the Windows environment and documented Spicetify, Electron, LRCLIB and TTML interfaces.
2. Implement a versioned, authenticated loopback WebSocket protocol and a reconnecting Spicetify extension.
3. Implement strict track matching, cancellable providers, local imports and a bounded disk cache.
4. Implement a hardened Electron companion, transparent click-through window, tray, shortcuts and persisted monitor-aware bounds.
5. Implement intact Unicode text rendering, real word timing masks, presets and a live settings preview.
6. Test parsers, matching, timing, protocol security and Electron integration. Build the Windows NSIS installer.
7. Record which acceptance checks ran and which require a clean Windows machine or manual visual inspection.

Version 2.2 provides an English settings interface, one-click authenticated provisioning, current/next lyrics with optional text/card/glass/sign surfaces, independent sentence and word motion, named saved setups, contextual/local/basic translation with automatic fallback, developer attribution, and public GitHub portable distribution. The real Spotify connection is checked separately from isolated automated tests. See docs/VERIFICATION.md for evidence and remaining manual QA.
