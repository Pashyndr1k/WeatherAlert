# WeatherAlert

Standalone Windows / macOS desktop app for ship captains: tracks marine weather at up to 10
user-defined WGS84 points in the Black Sea & Sea of Azov, shows a simplified vector map with a
metrics panel, and raises **visual + audible alarms 60–90 minutes before** a user-set
critical threshold is forecast to be reached.

Built with Electron (Chromium + Node), d3-geo for the map, Web Audio for alarm tones.

## Install

**Windows** — download `WeatherAlert-<version>-portable.exe` or the NSIS installer from
[Releases](https://github.com/Pashyndr1k/WeatherAlert/releases) and run it.

**macOS** — the DMG in Releases is not notarised, so Gatekeeper reports it as damaged. Either
right-click the app → **Open** (once), or clear the quarantine flag after copying it to Applications:

```bash
xattr -dr com.apple.quarantine /Applications/WeatherAlert.app
```

**Run from source (any OS, needs Node.js 18+ from https://nodejs.org):**

```bash
git clone https://github.com/Pashyndr1k/WeatherAlert.git
cd WeatherAlert
npm install
npm start
```

Or double-click the launcher: `WeatherAlert.bat` (Windows) or `WeatherAlert.command` (macOS; on the first
run use right-click → Open, or `bash WeatherAlert.command`). Both install the dependencies on the first run.
`npm start` and the launchers check that the Electron binary was actually downloaded and fetch it if
`npm install` skipped it — the cause of *"Electron failed to install correctly, please delete
node_modules/electron and try installing again"*. If you ever see that message anyway, run
`node node_modules/electron/install.js` (or delete `node_modules` and run `npm install` again).
