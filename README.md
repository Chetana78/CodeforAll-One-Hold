# One Tap

Accessible medication management for **one-handed and low-dexterity** use.

Hackathon: **Accessibility in Every Step of the Medicine Journey**

Most pill apps assume two hands, tiny taps, and swipes. One Tap uses **one large tap**, thumb-zone buttons, voice, keyboard/switch, and a 30-second undo.

## Run locally

```bash
cd CodeforAll-One-Hold
python -m pip install -r requirements.txt
python main.py
```

Open [http://127.0.0.1:8788/](http://127.0.0.1:8788/)

On a phone, use your laptop’s local IP on the same Wi‑Fi, for example `http://192.168.x.x:8788/`.

## Demo (90 seconds)

1. **Access settings → Reset demo data**
2. Tap the large **Take dose** button (Morning tablet)
3. Show **Undo**
4. Turn on **Larger targets** and **Longer hold (tremor)**
5. **Trigger reminder (demo)** → hold to take
6. Tap **Atorvastatin · Low · refill** → hold to request refill
7. Wake listening starts automatically on page load. Say “OneTap take”, “OneTap skip”, “OneTap refill”, or “OneTap undo”. You can also say “OneTap”, then say the command after the app responds.

## What’s in the prototype

| Feature | Status |
|---|---|
| Next dose + large tap to take | Working |
| Skip with large choices | Working |
| Undo (30s) | Working |
| Today list | Working |
| Missed dose count | Working |
| Simulated refill | Working |
| On-screen reminder overlay | Working |
| Phone alerts at dose time (browser notifications) | Working on localhost / Chrome |
| Voice commands | Working through `voicerecogfeature.py`; falls back to Chromium browser voice |
| Access settings | Working |
| Real pharmacy API | Not in prototype |
| SMS or locked-phone OS alarms | Not in prototype |

No login. Data is stored in the browser (`localStorage`).

## Files

- `index.html` — app shell
- `styles.css` — large targets, contrast, thumb zone
- `app.js` — doses, hold logic, voice, settings
- `main.py` — static app server + Python voice endpoint
- `voicerecogfeature.py` — microphone recording + transcription

## Team

Clone this repo, run the Python server, present from the browser. Reset demo data before you go on stage.
