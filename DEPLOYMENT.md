# Deployment

## Windows prerequisites

- Git and a supported Node.js LTS release with npm. The validated environment used Node.js 26.13.1 and npm 11.20.0; Electron's build dependency requires Node.js 22.12 or newer.
- Internet access when installing dependencies and downloading Electron/packaging tools. The packaged application includes its SQLite WASM runtime and does not need that download at runtime.
- A local Windows build directory outside OneDrive and mapped/network drives. Packaging on the mapped Mac share failed while processing intermediate archives, and launching the unpacked application from that share failed to start the renderer. Local storage passed the smoke tests with default graphics settings.

End users do not need Node.js or npm to run the portable executable.

## Build a release from committed source

Use a fresh checkout so unrelated, uncommitted changes are not included in the release. These commands are for PowerShell:

```powershell
New-Item -ItemType Directory -Force "$HOME\source" | Out-Null
git clone https://github.com/dradspinner/dvoa-results-poster.git "$HOME\source\dvoa_results_poster"
Set-Location "$HOME\source\dvoa_results_poster"
git switch master
git status --short
git rev-parse HEAD
npm ci --include=dev
npm audit
npm audit --omit=dev
npm run pack:win
```

For repeatable releases, check out the approved commit or tag instead of relying on the latest `master`. Record the commit hash with the release artifact. In an existing checkout, inspect local changes before updating it; do not discard them to build a release.

`npm run pack:win` type-checks the application, builds the renderer, and packages a Windows x64 portable executable:

```text
dist-electron/DVOA_Results_Poster.exe
```

`npm run build` alone generates renderer assets in `dist/`, not the portable application. The browser preview does not provide the Electron-only native file picker.

If npm reports blocked installation scripts, review them with `npm install-scripts ls` on npm versions that support that command. Approve only trusted scripts required for the selected build target; do not disable script protections globally. Do not run `npm audit fix --force` as part of deployment.

## Install or update the portable application

1. Close every running instance of DVOA Results Poster.
2. Before upgrading, back up `%LOCALAPPDATA%\dvoa-results-poster` while the application is closed. The runner database is persisted in the application's local storage within that profile, not beside the executable.
3. Retain the previous executable and its matching profile backup for rollback.
4. Copy the new executable into a local Windows folder, such as `%LOCALAPPDATA%\Programs\DVOA_Results_Poster`. Do not launch it directly from a mapped drive or synchronized share.
5. Record and compare the SHA-256 checksum when distributing the file:

```powershell
Get-FileHash .\dist-electron\DVOA_Results_Poster.exe -Algorithm SHA256
```

6. Launch the local copy and complete the checks below before using it for an event.

The validated build was unsigned because no signing certificate was configured. `publisherName` is not a digital signature. Follow your organization's signing and distribution policy before broader release; do not bypass Windows security protections for an unverified download.

The ignored file `dist-electron/DVOA_Results_Poster_validated.exe` is a local validation artifact, not a version-controlled release. It was built from the working tree, which included pre-existing, uncommitted flat-CSV changes. Use a clean checkout for an artifact matching the pushed commits exactly. Executables and `dist/` are not uploaded by `git push`; distribute the approved executable separately.

## Release smoke checks

Use synthetic event data and an isolated Windows user/profile when testing database writes. Never add test runners to the production database.

1. Start the packaged application and verify that the main screen renders.
2. Choose **Browse for XML File**, select a known OE12 XML fixture in a writable folder, and confirm the detected event name and date.
3. Generate results and splits HTML. Open both generated files and verify runner names, rankings, course order, and time formatting.
4. Choose **Generate CSV with Database Validation**. Confirm that the review screen loads only when requested, and add or correct a synthetic runner.
5. Generate the reviewed CSV and inspect its contents, not just the success notification.
6. Close the application completely, reopen the same event, and repeat validation. Confirm that the saved runner is matched from the database.
7. Repeat the database workflow without external HTTP(S) access to verify that the bundled SQLite runtime works offline.
8. If the approved release includes additional export formats, test each of them as well.

The November 20, 2026 smoke run passed startup, native file selection, HTML/splits output, CSV review/export, and SQLite persistence across a full restart. It also passed with external HTTP(S) requests blocked. The exact staged source passed TypeScript and a production build with all JavaScript chunks below 500 kB.

## Dependency audit status

At validation, the full audit reported six moderate findings, with no high or critical findings. Those findings trace to a `minimatch` denial-of-service advisory in electron-builder's packaging dependency chain. `npm audit --omit=dev` reported zero findings; Electron itself is a development dependency in npm but is still the shipped desktop runtime and must remain covered by the full audit.

Review current advisories for every release rather than treating these counts as permanent. No forced downgrade or unverified override was applied to the remaining packaging-tool dependency chain.

## Publish event results

The desktop application writes generated HTML/CSV files alongside the selected XML file. Upload the approved `_results.html` and `_splits.html` files using the club's existing website publishing process, then open the public URLs and verify the displayed event and results. The application does not automatically publish them to a server.

## Rollback

Close the application and restore the previous executable. If data compatibility requires restoring the profile, first preserve the current profile separately, then restore the matching backup while the application is closed. Restoring an older profile also rolls back database changes made since that backup.
