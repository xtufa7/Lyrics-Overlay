# Troubleshooting

**No Lyrics Overlay button in Spotify:** confirm Spicetify is applied to the desktop client, run the install action, and restart Spotify if necessary. Spotify updates may require reapplying Spicetify. The extension waits for the documented Player APIs and checks for the optional Topbar API. Web-player playback is unsupported.

**Spotify is disconnected:** keep the companion running and click Connect/Repair on its home screen. This installs the extension and provisions authentication automatically. Applying Spicetify may restart Spotify. If local storage was cleared, repair the connection again. Port 43827 must be free; only one production companion should own it. No network firewall exposure should be necessary because the connection stays on loopback. The advanced manual code is a fallback only; it is single use and expires after five minutes.

**Missing lyrics:** check the status in Lyrics & timing. Instrumental tracks intentionally have no text. Album/title/version/artist/duration mismatches are rejected. LRCLIB may not have your language or version. Import a permitted LRC/TTML file. Retry lookup bypasses provider cache, while an imported file still takes priority. Disable LRCLIB for offline-only operation. There is no fallback to undocumented Spotify or paid provider APIs.

**Words do not highlight:** ordinary LRC and plain lyrics have no reliable word timings. Import TTML with explicit timed spans and select Karaoke. Enable the absolute timing import option if exported span times are absolute. Only explicitly timed spans highlight. For multipart overlapping TTML, export a single vocal part.

**Lyrics are early/late:** adjust the global and/or current track's offset. Positive is earlier. A two-second player correction and immediate seek-event corrections limit drift. Do not use an offset to compensate for the wrong recording; import the correct version.

**Wrong Arabic direction:** choose automatic direction or force RTL. Each line uses its first strong letter; an English-leading mixed sentence starts LTR by design. Choose Cairo or Automatic for Arabic. The complete line remains shaped; text is not broken into glyph spans.

**Overlay appears missing:** enable it in the tray menu and reset its position. Choose a connected display. A removed/rescaled monitor is handled by clamping bounds to an available work area. One line is truncated with ellipsis when too wide; increase width, reduce font size, or select two lines and increase height. Completely transparent empty lyrics have nothing to show.

**Clicks are blocked:** finish Edit Mode with Done, Escape or the configured shortcut. Normal mode ignores mouse input and disables focus. If a shortcut is occupied, an available alternative is selected and displayed in Position & shortcuts; click its field and press a new combination to customize it. Save the current position on Home to restore it with the position shortcut.

**Overlay hidden by a game or protected app:** exclusive-fullscreen, secure desktops, anti-cheat and protected video may prevent overlays. Try the application's ordinary borderless-windowed mode. This app does not inject into games or bypass protections.

**No rectangle/background:** this is intentional. Version 2 always renders frameless transparent lyrics; old border/glass settings are ignored. The preview's surrounding settings card is not part of the actual desktop overlay.

**No translation:** enable display and explicitly press Translate current song. Gemini requires your own valid key and available model; provider limits/billing apply. Ollama requires a running local server and installed model. MyMemory is a basic limited fallback. The translation status explains failures. A saved result returns automatically for matching lyrics/provider/language/model. Translation never changes word timing.

**Extension installation fails:** install/configure Spicetify first and ensure it is on PATH when launching the companion. The app resolves the real config path with `spicetify -c`. Applying may fail if Spotify's backup or patch state needs repair; follow Spicetify's official repair instructions. The app does not run arbitrary downloaded repair scripts.

**Startup does not work in development:** startup registration is intentionally available for the installed executable. Enable it after installing. Closing Settings keeps the tray app alive; Quit stops it.

**Settings write failed:** confirm your Windows user profile is writable and disk space is available. Settings are written atomically. You may quit the companion, back up then rename `settings.json`, and restart to recover defaults. Imports and offsets live in separate files.
