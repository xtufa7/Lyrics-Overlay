# Lyrics Overlay 2.1.0

- English interface with Midnight, Graphite, Ocean, Forest and Daylight themes.
- A simpler About page and original app artwork.
- Spotify album cover in now playing and an optional transparent desktop layout.
- Current-word coloring, progressive sweep and a moving underline. Real word timestamps take priority; optional visual estimates support line-synced songs. Exact-only mode disables estimates.
- Automatic Arabic → English and English → Arabic translation, or a language of your choice.
- Independent translation color, font, size, glow, opacity and placement; instant show/hide switch.
- Natural, faithful and poetic AI translation styles with context and validated line IDs.
- A first-run circular spotlight tour, with Skip and replay from About.
- Spotify extension reduced from approximately 461 KB to 4.5 KB. Overlay drawing is capped at 30 fps while playing and stops when paused or hidden. Hidden previews and About stop their animation loop.
- Preserved one-click Spotify setup, saved positions, shortcuts and the destroyed-tray shutdown fix.

Download the portable ZIP or Setup EXE, or run:

```powershell
irm https://raw.githubusercontent.com/xtufa7/Lyrics-Overlay/main/install.ps1 | iex
```

Spicetify must already be configured for the desktop Spotify client. Choose **Connect Spotify** or **Repair connection** once after updating the companion to install the matching extension.

27 engine/protocol tests and 47 real Electron checks cover the changes. Translation provider limits still apply. Gemini requires your own API key; Ollama requires a local model. Estimates cannot recover a singer's exact word timing from line-only lyrics. Releases are unsigned.
