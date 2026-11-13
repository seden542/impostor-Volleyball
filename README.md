# Impostor Volleyball

임포스터 발리볼 — browser-first volleyball game prototype.

## Included in the first prototype
- Red, Green, Yellow and White characters (idle / walk 1 / walk 2 / jump)
- Polus, Mira and Defeat map backgrounds
- 1v1, 2v2, 3v3 and 4v4 match setting UI
- Korean and English interface
- Mobile mode with touch controls
- Configurable keyboard controls saved in local storage
- Vite web build, GitHub Pages workflow and Electron Windows portable build workflow

## Local development
```bash
npm install
npm run dev
``

## Web build
```bash
npm run build
``
Publish `dist/` using GitHub Pages. The Pages workflow is in `.github/workflows/pages.yml`.

## Windows portable EXE
On Windows:
```powershell
npm install
npm run dist:win
``
The portable executable is written to `release/`. You can also run the Windows EXE workflow manually from GitHub Actions.

## Controls
- Left / Right: move
- Up: jump
- Space: hit the ball
- Rebind keys in Settings.

## Important: online multiplayer
The online connection UI is a placeholder only. The repository currently does **not** include a live multiplayer server. GitHub Pages serves static files and cannot host the Socket.IO game server. To enable room codes, 8-player rooms, synchronized physics and server-enforced duplicate-character prevention, a separate Node.js Socket.IO server still needs to be implemented and deployed.

## Asset layout
- `assets/characters/{red,green,yellow,white}/{idle,walk1,walk2,jump}.png`
- `assets/maps/polus.png`
- `assets/maps/mira.png`
- `assets/maps/defeat.jpg`

The uploaded character sheets and backgrounds are currently included as provisional assets. Confirm rights and permissions for any third-party fan assets before public distribution.
