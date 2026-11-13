# IPA Installer

A small self-hosted website for putting `.ipa` files on your iPhone or iPad. Upload an IPA (or paste a direct link to one), then tap **Install** in Safari on your phone. It uses Apple's built-in over-the-air install flow (`itms-services`), so you don't need a computer or cable once it's running.

No npm packages are needed. It runs on Node.js 20 or newer.

## What it does
- Upload `.ipa` files from any browser, with a progress bar (no size limit by default; only your disk space)
- Import an `.ipa` from a direct download link
- Reads the app's name, version, bundle ID and minimum iOS version
- Checks signing: unsigned, App Store–encrypted, ad-hoc (number of devices), development, enterprise, and expiry date
- **Install** button, plain **Download .ipa** link, and a shareable install page (`/i/<id>`) you can send to other devices
- Password-protected admin page; install links use random 128-bit IDs

## Run it
```bash
cd ipa-installer
ADMIN_PASSWORD='choose-a-strong-password' npm start
# → http://localhost:3080
```

| Variable | Default | Meaning |
|---|---|---|
| `ADMIN_PASSWORD` | random (printed at start) | Password for the upload page |
| `PORT` | `3080` | Web port |
| `PUBLIC_URL` | taken from the request | Your public HTTPS address, e.g. `https://ipa.example.com` |
| `MAX_MB` | no limit | Optional cap on upload size in MB |
| `DATA_DIR` | `./data` | Where IPAs and `apps.json` are stored |

## HTTPS is required
iOS only installs from an `https://` address with a valid certificate. Self-signed certificates and plain `http://` are refused. The simplest free option is a Cloudflare quick tunnel:

```bash
cloudflared tunnel --url http://localhost:3080
```

Open the `https://….trycloudflare.com` address it prints on your phone. A reverse proxy such as Caddy with your own domain also works; it gets certificates automatically.

## Which IPAs will install
iOS checks the app's signature, so an IPA installs only if it is signed for your device:

- **Ad-hoc or development builds** whose provisioning profile includes your device's UDID
- **Enterprise builds** (they install on any device)

These are refused:
- **Unsigned IPAs.** Re-sign them first with your own Apple ID (AltStore, Sideloadly) or with an Apple Developer account, then upload the signed copy.
- **App Store–encrypted IPAs** copied from a purchase.
- IPAs whose provisioning profile has **expired**.

The tags under each app show what the installer found, so you can tell before you tap Install.

After installing a development or ad-hoc app you may need to:
- turn on **Developer Mode** (Settings → Privacy & Security), and
- trust the developer (Settings → General → VPN & Device Management).

## Security notes
- Anyone with an app's install link can download that IPA. Only share links you mean to share, and delete apps you no longer need.
- Importing from a link refuses private/local network addresses. Set `ALLOW_PRIVATE=1` to allow them.
