# ClawStudio

ClawStudio is a desktop workspace for OpenClaw users.

The current version focuses on:

- single-window chat
- gateway connection
- session and workspace management
- attachments
- in-app updates

Removed from the old product line:

- character sprite features
- voice playback / TTS
- pet-style runtime windows

## Tech Stack

- Tauri 2
- React 19
- TypeScript
- Zustand

## Development

Install dependencies:

```bash
npm install
```

Run the app in development:

```bash
npm run tauri:dev
```

Build the UI bundle:

```bash
npm run ui:build
```

Run type checks:

```bash
npm run typecheck
```

Check the Rust side:

```bash
cd src-tauri
cargo check
```

## Project Notes

- Default gateway URL: `ws://127.0.0.1:18789`
- Device identity path: `~/.clawstudio/device.json`
- Release setup is documented in [`docs/release.md`](./docs/release.md)
