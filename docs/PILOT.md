# First pilot

Start with 5–10 ASHAs and one authorised supervisor after local review. Use fictional records while learning the interface. Confirm the state/district, language needs, phones, data ownership and the forms currently submitted.

The 2026 NHM SSBSK framework brings together HBNC and HBYC and extends child follow-up. Confirm local adoption and obtain the current approved visit schedule. The application intentionally has no active clinical schedule on first setup. Administrators can record approved day/month offsets, the source guideline, an approver and an effective date; completed records retain their schedule version.

Source: [NHM community-based programme](https://nhm.gov.in/index4.php?lang=1&level=0&lid=818&linkid=514).

Check before expanding:

- A supervisor reconciles real household counts and a sample monthly report.
- Workers can enter a visit and resume interrupted offline work without losing it.
- Confirmed births, deaths and moves produce the expected resident counts.
- The local team confirms which paper registers may be reduced and which remain required.
- Report preparation time and stationery costs are measured against the previous process.
- A backup has been restored successfully and the team knows how to report an incorrect entry.

Known limits in this first implementation:

- No automatic official submission or integration with ABHA/ABDM, U-WIN, Nikshay or state portals.
- No diagnostic engine, medication dosing, incentive payment engine, or full official clinical checklist.
- Core navigation has Hindi labels; forms need further localisation for the chosen state.
- One encrypted worker workspace per browser/app profile. Saved smart-list definitions are device-local.
- Server sync is a full authorised record snapshot, suited to a small pilot. Pagination and incremental sync are needed for much larger populations.
- A supervisor sees the most recently synced changes. Offline revocation requires a later connection.
- A lost offline password cannot recover unsynced changes. Password recovery/reset is performed by an administrator for server accounts.
- Population reports capture current state at generation. Historical report snapshots are retained; arbitrary historical census reconstruction is not supported.
- Attachments already synced are downloaded on demand; queued files are available locally before sync.
- The Android build is a preview package with a temporary debug signature. Stable production signing and physical-device field testing remain deployment steps.
