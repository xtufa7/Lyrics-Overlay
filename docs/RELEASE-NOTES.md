# Lyrics Overlay 2.2.0

Your music. Your space. More ways to make it yours.

- Four overlay styles: transparent text, floating card, liquid glass and a hanging sign. Customize panel color, opacity, border and corners.
- More offline fonts, including Manrope, Outfit, Rubik and Tajawal. Long single lines can shrink to fit.
- Independent sentence transitions: rise, slide, crossfade, blur and zoom. Incoming and outgoing lines animate together.
- Current-word glow, pulse or bounce, plus optional moving underline and color sweep.
- Complete named setups, settings export/import without credentials, and one-click top-center text placement.
- Smarter translation defaults: Auto chooses Gemini with a configured key or basic MyMemory otherwise; Gemini failure can fall back to basic translation. The current sentence is translated first, with progress and cancellation.
- Arabic-to-English, English-to-Arabic or a selected target language; independent translation appearance and instant display switch.
- More resilient Spotify connection: longer heartbeat tolerance, short disconnect grace, and credential-preserving retries.
- Minimal About page with the actual public GitHub avatar and creator-credit toggle.
- English interface, five themes, optional cover artwork and circular onboarding tour retained.
- English GitHub showcase with original demo screenshots and clear install instructions.

## Install or update

Download the Windows x64 portable ZIP or Setup EXE, or run:

```powershell
irm https://raw.githubusercontent.com/xtufa7/Lyrics-Overlay/main/install.ps1 | iex
```

Spicetify must already be configured for desktop Spotify. Use **Repair connection** after updating to install the matching extension. Spotify may restart.

## Verification and limits

30 engine/protocol tests and 63 Electron checks cover the build. The same desktop suite runs against the packaged executable before release. Visual word estimates are optional and cannot recover exact sung timing. The glass style does not guarantee native desktop blur. Translation quality and service limits depend on the provider. Releases are unsigned.
