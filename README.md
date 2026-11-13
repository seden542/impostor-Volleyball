# Impostor Volleyball

임포스터 발리볼 — browser-first volleyball game prototype.

## Current project scope
- Initial playable roster: Red, Green, Yellow, White (idle / walk 1 / walk 2 / jump)
- Maps: Polus, Mira, Defeat
- Match settings: 1v1, 2v2, 3v3, 4v4; 1 / 3 / 5 minutes or unlimited
- Korean and English interface
- Mobile mode with touch controls
- Configurable keyboard controls saved in local storage
- Vite web build and GitHub Pages workflow
- Electron Windows portable EXE build workflow
- Separate Socket.IO room-server prototype with 6-character room codes, up to 8 players, host settings, and server-side duplicate-character checks

## Local development
```bash
npm install
npm run dev
```

## Web build
```bash
npm run build
```
GitHub Pages deployment is configured in `.github/workflows/pages.yml`. In the repository settings, set **Pages → Build and deployment → GitHub Actions**.

## Windows portable EXE
On a Windows computer:
```powershell
npm install
npm run dist:win
```
The portable executable is written to `release/`. Or run **Actions → Build Windows portable EXE → Run workflow** on GitHub; download the workflow artifact after it finishes.

## Online room server
The room server is a separate Node.js process; GitHub Pages cannot host it.
```bash
npm install
npm run server
```
It listens on port 3001 by default. Deploy it to a Node.js host and set `CLIENT_ORIGIN` to the web game's origin. The room server currently implements room creation/joining, 8-player capacity, host match settings, and unique selection of the four initial characters. It is an early backend component, not yet a complete synchronized volleyball match: gameplay state synchronization and full client lobby integration remain to be completed.

## Controls
- Left / Right: move
- Up: jump
- Space: hit the ball
- Rebind keys in Settings.

## Assets
Expected layout:
- `assets/characters/{red,green,yellow,white}/{idle,walk1,walk2,jump}.png`
- `assets/maps/polus.png`
- `assets/maps/mira.png`
- `assets/maps/defeat.jpg`

The current repository has placeholder asset files. Replace them with the supplied ZIP's character images and the three provisional map backgrounds before expecting the art to appear. Confirm rights and permissions for third-party fan assets before public distribution.
