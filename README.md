# ASHA Saathi

**Your community. Connected care.**

A first working ASHA records application with a branded Android preview APK, a responsive browser dashboard, and a self-hosted Node.js server. The repository’s **Build ASHA Saathi** workflow checks the source, tests permissions and workflows, builds the Android APK, and publishes downloadable artifacts.

## Try it

Download **ASHA-Saathi-Android-APK** from a successful run in [GitHub Actions](https://github.com/adeebkjan11-ctrl/Asha-app/actions). Unzip it and install `ASHA-Saathi-preview.apk` on Android 8 or later. Choose **Explore the demo** to view fictional households immediately, including without an internet connection. For shared records, enter the HTTPS origin of your configured ASHA Saathi server and sign in.

A server has **not** been deployed automatically. The APK is a preview build signed with a temporary debug key. It is not a Play Store release, a government application, or an official reporting integration. See [Android installation](docs/ANDROID-INSTALL.md).

## Included

- Family creation, member details, exact DOB or estimated age, optional ABHA, addresses, household relationships and assignment to an ASHA.
- Derived resident population and sex/age breakdowns, with confirmed death and migration events taken into account.
- Separate pregnancy episodes; HBNC, HBYC, SSBSK, ANC, PNC, immunisation and other visit records.
- Administrator-approved, versioned visit templates. Generate due dates from a reference date; no old national schedule is enabled by default.
- Multiple conditions per person, with suspected, self-reported, confirmed and resolved states.
- Birth/death/movement reporting, verification status, and protected PDF/image attachments.
- Dynamic smart lists, saved device filters, CSV exports, and browser/Android printing to PDF.
- Monthly reporting drafts, submission and review. The server calculates saved report totals and retains accepted snapshots.
- Administrator-created accounts, password resets, deactivation, ASHA-specific access and household transfers.
- English interface with English/Hindi navigation. Clinical form labels remain English in this version.
- An encrypted offline cache and queue, retryable sync, explicit conflict review, and automatic locking after returning from an extended background period.
- Custom SVG logo, PNG install icons, Android adaptive icon, and a consistent set of interface icons.

## Run the server locally

Install **Node.js 24**. No runtime packages are required.

```sh
npm start
```

Open `http://127.0.0.1:8787`. The server creates a `data` directory with the encrypted database, its encryption key, and a one-time bootstrap token. Read the token on the server:

```sh
cat data/bootstrap-token
```

Choose **Set up workspace**, supply that token, and create the first administrator. There are no default accounts or passwords. Sign in, create an offline password, add ASHA accounts under **ASHA team**, and assign families to those accounts. Workers must change their temporary password before using the shared data.

Back up **the entire data directory**, including `encryption.key`. The database cannot be recovered without that key. Do not put the data directory, keys, tokens or environment files in Git.

## Deploy for the Android app and shared browser use

Use an HTTPS reverse proxy in front of the server; keep its port private. The supplied Docker Compose file binds port 8787 to loopback and persists the data volume. Follow [deployment instructions](docs/DEPLOYMENT.md). The app accepts HTTPS origins; loopback HTTP is only for browser development. Android cleartext traffic is disabled.

The Android application serves its bundled UI from `https://appassets.androidplatform.net`; this origin is included in the server’s default allowed-origin list. Serve the browser UI from the same origin as the API. Additional browser origins must be explicitly configured by the operator.

## Offline behaviour

The sign-in token remains in memory. Local health records, queued changes, and queued uploads are encrypted in IndexedDB using an offline password (PBKDF2 and AES-GCM). The server encrypts record payloads using AES-256-GCM and hashes sign-in passwords with scrypt.

An offline workspace can be unlocked without contacting the server. Sign in again to sync when the session has ended. A server password reset does not recover the offline password. Keep that password safe; unsynced records cannot be recovered if it is lost. Only one worker workspace is retained per browser/app profile. Removing a device copy is blocked while changes are pending.

A lost or deactivated device cannot be remotely revoked while disconnected. Server restrictions take effect on the next request. Documents already uploaded are downloaded on demand; their full bytes are not included in routine sync. Queued uploads are kept encrypted until successfully synced.

## Verification and builds

```sh
npm ci
npm run check
npm test
npx playwright install chromium
npm run test:ui
npm run build
```

The browser tests cover fictional demo navigation, family/member entry, filters, visit validation, report export, mobile layout, live account creation, encrypted cache creation and offline edit recovery. Screenshots and test results are written to `artifacts/`.

For Android, install Java 17, Gradle 8.11.1 and Android SDK 35, then:

```sh
npm run build
gradle -p android assembleDebug lintDebug
```

`npm run build` copies the web app into the Android assets directory. The APK appears under `android/app/build/outputs/apk/debug/`. CI performs these steps automatically for pushes to `main`, pull requests and manual workflow runs.

## Scope for a live pilot

This is a first implementation for a small supervised pilot, not a clinical decision-support system. The visit form provides documentation fields, not the full official clinical assessment checklist. Configure local schedules and reporting requirements with the responsible health team before use. No automated diagnosis, incentive payments, ABHA creation or government-portal submission is implemented.

Current reports show resident population **as of generation time**, alongside activity for a chosen month. Saved snapshots preserve what was submitted; the app does not reconstruct a complete historical census from arbitrary profile edits. Confirm how estimated ages and unverified events should be used locally. Incentive calculations, full clinical form localisation, and external system integrations remain later modules.

See [pilot notes](docs/PILOT.md) for rollout considerations and known limits.
