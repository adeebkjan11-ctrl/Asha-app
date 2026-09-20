# Install ASHA Saathi preview

1. Download and unzip the **ASHA-Saathi-Android-APK** artifact from the successful GitHub Actions run.
2. Open `ASHA-Saathi-preview.apk` on an Android phone running Android 8 or later. Android may ask you to allow installation from the app opening the file.
3. Open **ASHA Saathi**. Choose **Explore the demo** to try fictional records offline.
4. For shared live records, enter your organisation’s ASHA Saathi **HTTPS server address**, username and password. The server must be deployed separately.
5. Create an offline password when prompted. This protects the local copy on your device. Use the same password to unlock it when offline.

The app has a custom launcher icon and name. It uses Android’s system file picker for attachments and a save-file dialog for exports. Printing uses Android’s print service, including Save as PDF where available. Screenshots and Android automatic backup are disabled in the native app to reduce exposure of health records.

The APK is a preview signed with a temporary debug key. Builds from different clean workflow runs may use different keys. Do not uninstall an older preview until all local changes have synced: uninstalling removes its offline records. A later production release needs an operator-controlled signing key and a stable update process.

Package: `org.ashasaathi.app.preview`

Verify the APK against the included `SHA256SUMS.txt` when needed. This artifact contains no passwords, live patient records, or preconfigured shared server.
