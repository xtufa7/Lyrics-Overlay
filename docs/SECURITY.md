# Security model

The companion binds IPv4 **127.0.0.1:43827** only. WebSocket `/v1` upgrades require an exact loopback Host header and an allowlisted Spotify origin (`https://xpui.app.spotify.com` or `https://zlink.app.spotify.com`). Nothing binds a LAN interface. Arbitrary websites receive neither discovery credentials nor HTTP pairing endpoints.

## Authentication and installation

The explicit Connect/Repair action generates a random 256-bit **local companion credential**, persists only its SHA-256 digest in the companion profile and provisions the token into the user's installed Spicetify extension. This private local copy is generated at installation time; repository/download bundles contain only a placeholder and no machine-specific credential. The extension stores its credential in Spotify local storage and authenticates automatically. It is never a Spotify account/access token. Reinstalling reprovisions it and closes old sessions.

Manual pairing remains available: cryptographically generated 8-digit code, five-minute expiry, single use and throttled failed attempts. No Spotify credentials are requested. Pairing values never appear in diagnostic state snapshots or application logs. An unpaired extension waits for explicit setup instead of repeatedly consuming authentication attempts.

Origin validation supplements authentication. Other local processes can spoof Origin, and a malicious extension inside the same Spotify/user account can read the installed local client. A compromised local account or administrator is outside this threat model. Do not publish installed extension copies, `secrets.json`, Spotify local storage or personal profile/cache files.

Authentication must finish in eight seconds. Messages are schema validated, text-only, at most 16 KiB and rate limited to 40/second per socket. At most four sockets connect simultaneously. Ping/pong runs every ten seconds. Sequence numbers reject older snapshots, and new authenticated Spotify sessions replace previous ones. Async provider and translation results also require the active request generation.

## Renderer isolation

Both Electron renderers use sandboxing, context isolation, no Node integration, a minimal role-limited preload, denied permissions, navigation/pop-up blocking and restrictive CSP. Renderer API networking is disabled; images are permitted only from bundled assets, data URLs and Spotify's exact `https://i.scdn.co` host. The protocol accepts only constrained `/image/` artwork URLs, not arbitrary addresses. Main-process IPC validates window identity, exact frame URL, role and arguments again. Only Settings can provision the extension, change settings, import lyrics, configure translation keys or request translations. The overlay can observe state, open Settings and edit/resize while editing.

No raw shell, filesystem, arbitrary URL-fetch or IPC primitives reach renderer pages. Developer/external links are a fixed allowlist. Spicetify installation uses discrete arguments without a shell. Imports use a native file picker and a 2 MB limit. XML DTDs/entities are forbidden and nesting is bounded. Provider text is inserted as text rather than HTML.

## Translation

Gemini keys are encrypted with Electron `safeStorage` (Windows DPAPI) before persistence. If OS encryption is unavailable, saving a key is refused instead of falling back to plaintext. Keys are only sent in the Gemini API header, never in URL queries, state IPC, logs, Spotify or an arbitrary endpoint.

Translation requires an explicit user action. Gemini/MyMemory receive the lyric text necessary to fulfill it; Ollama is restricted to HTTP IPv4 loopback and receives no cloud credential. Redirects are refused. Responses are bounded and AI mappings are schema validated for exact requested IDs without duplicates, omissions or added entries. Lyrics are treated as untrusted translation data and no tools are enabled. Text is displayed literally, never executed. New tracks cancel old requests; original lyric timings remain untouched.

The public GitHub installer downloads from this repository's Releases, checks SHA-256 and extracts to a versioned folder. Its temporary cleanup is restricted to the uniquely created validated temp directory. A checksum from the same release verifies transport/file consistency; it does not replace publisher code signing or protect a compromised publishing account. No certificate is invented and no OS security bypass is instructed.

Automated desktop tests use test-only port **43828** and isolated profiles. They do not replace, unpair or read a user's real Spotify connection. Public artifacts exclude work directories, live playback captures, installed private extension copies and personal data.
