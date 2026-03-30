# Release Setup

ClawStudio uses Tauri 2 updater artifacts published to GitHub Releases.

## What Must Match

These three pieces must belong to the same updater key pair:

- the public key in `src-tauri/tauri.conf.json`
- the `TAURI_SIGNING_PRIVATE_KEY` GitHub Actions secret
- the `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` GitHub Actions secret, if you set one

If the private key and public key do not match, the GitHub Action may still build a release, but the installed app will reject the update signature.

## Generate the Updater Key

Run this once on your own machine:

```powershell
npx tauri signer generate -w "$HOME/.tauri/clawstudio.key"
```

The CLI will print:

- the public key: safe to commit into `src-tauri/tauri.conf.json`
- the private key path: keep this file private and backed up

Important:

- never commit the private key into the repository
- keep using the same private key for future releases
- if you lose the private key, existing installs can no longer trust your future updates

## Configure GitHub Secrets

In GitHub, open:

`Repository Settings -> Secrets and variables -> Actions`

Create these repository secrets:

- `TAURI_SIGNING_PRIVATE_KEY`
  Paste the full content of the generated private key file.
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
  Use the password you entered during key generation. If you left it empty, store an empty secret or regenerate with a password you can manage safely.

`GITHUB_TOKEN` is provided automatically by GitHub Actions and does not need to be created manually for this workflow.

## Update the Public Key

Replace `plugins.updater.pubkey` in `src-tauri/tauri.conf.json` with the generated public key.

The release endpoint should stay aligned with this repository:

```json
https://github.com/Lucent-Snow/ClawStudio/releases/latest/download/latest.json
```

## How to Publish

There are two supported paths:

1. Push a version tag like `v0.1.1`
2. Run the `Release` workflow manually and enter a version without the leading `v`

The workflow will:

- validate updater secrets and updater config
- sync the requested version into build metadata
- build the Windows NSIS installer
- upload release assets and updater metadata to GitHub Releases

## First Release Checklist

- generate the updater key pair
- update `src-tauri/tauri.conf.json` with the new public key
- add the two updater secrets to GitHub
- trigger a release build
- install that release once manually
- verify the next release can update from inside the app
