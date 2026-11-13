# Install your IPAs with only an iPhone

No computer and no server. You need:
- an iPhone with Safari
- a paid Apple Developer account ($99/year). iOS refuses apps that aren't signed with a certificate Apple issued, so this part is required.
- this GitHub repo (free)

## 1. Make your certificate files
Open the **iPhone Signing Kit** page (`signing-kit.html`, also published as a Claude artifact). It walks you through:
1. Creating a certificate request on the phone. Your private key stays on the phone.
2. Uploading it to developer.apple.com, registering your iPhone's UDID, making a wildcard App ID and an Ad Hoc profile.
3. Building `Certificate.p12` + your `.mobileprovision` into `Signing-Files.zip`, plus the text for the GitHub secrets.

## 2. Install Feather once, using GitHub
Feather is a free app that signs and installs IPAs on the phone itself. It also has to be signed once, which GitHub does for you:

1. Repo **Settings → Secrets and variables → Actions → New repository secret**. Add:
   - `SIGN_P12_BASE64` (copy from the Signing Kit)
   - `SIGN_PROFILE_BASE64` (copy from the Signing Kit)
   - `SIGN_P12_PASSWORD` (your .p12 password)
2. Repo **Settings → Pages → Source: GitHub Actions**.
3. **Actions → Sign IPA → Run workflow**. The link is pre-filled with Feather. Wait about 3 minutes.
4. Open `https://<your-username>.github.io/<repo>/` in Safari and tap **Install**.
5. If iOS asks, turn on Settings → Privacy & Security → **Developer Mode**.

The workflow can sign any IPA you have a direct link to, up to about 1.9 GB (GitHub's file limit). Signed IPAs are posted as public releases in this repo, so anyone can download them. Delete releases you don't want public.

## 3. Install any IPA in Feather
- Feather → Certificates → **+** → choose `Certificate.p12` and the `.mobileprovision`, then enter your password.
- In the Files app, share an IPA to Feather (or import it inside Feather) → Sign → Install.

Everything happens on the phone, so file size is limited only by free storage.

## What still won't work
- IPAs taken from App Store purchases stay locked to the account that bought them. Re-signing can't change that.
- Apps that need special Apple permissions your account doesn't have may lose those features.
- Certificates and profiles expire after a year. Make new ones and add them to Feather.
