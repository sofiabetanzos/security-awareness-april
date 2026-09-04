# Prashanth-Man & QR Phishing Simulator

A two-part security awareness experience built for a live presentation:

1. `index.html` is the mobile-first QR trap. It shows a convincing two-second loading state, then reveals the QR-phishing lesson.
2. `game.html` is the playable Phaser 3 arcade game.

## Run locally

The pages need to be served over HTTP so Phaser can load the player sprite:

```bash
python3 -m http.server 8000
```

Then open:

- QR trap: <http://localhost:8000/>
- Game: <http://localhost:8000/game.html>

## Controls

- Move: arrow keys
- Pause/resume: P, Escape, or the pause button
- Touch: on-screen directional controls

## Gameplay

- Grey data dot: +10
- Red ghost: ransomware, direct pursuit
- Purple ghost: insider risk, anticipates the player's route
- Grey ghost: supply-chain risk, unpredictable turns

The high score is saved locally in the browser. A collision ends the game; collecting all points wins and unlocks the Security Champion banner.

## Presentation QR

`generate_qr.py` creates `qr-code.png` using the project magenta `#d11269`. The destination is the versioned GitHub Pages URL in the script's `DEFAULT_URL` constant so phones do not reuse the older April Awareness page from cache.

```bash
python3 -m pip install -r requirements.txt
python3 generate_qr.py
```

For phone testing on the same Wi-Fi network, generate a separate QR using the
Mac's LAN address rather than `localhost`:

```bash
python3 generate_qr.py --url http://YOUR_MAC_IP:8000/ --output qr-code-local.png
```

## Player art

`assets/prashanth.png` is a transparent game sprite derived from the supplied project reference. It can be replaced with another transparent square PNG without changing the game code.

## Deployment

The existing GitHub Actions workflow publishes the repository root to GitHub Pages on pushes to `main`.
