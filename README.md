# OneHold

Accessible medication management for **one-handed and low-dexterity** use.

Hackathon: **Accessibility in Every Step of the Medicine Journey**

Most pill apps assume two hands, tiny taps, and swipes. OneHold uses **one large press**, thumb-zone buttons, voice, keyboard/switch, and a 30-second undo.

## Run locally

```bash
cd med-onehold
python3 -m http.server 8788
```

Open [http://127.0.0.1:8788/](http://127.0.0.1:8788/)

On a phone, use your laptop’s local IP on the same Wi‑Fi, for example `http://192.168.x.x:8788/`.

## Demo (90 seconds)

1. **Access settings → Reset demo data**
2. Tap the large **Take dose** button (Morning tablet)
3. Show **Undo**
4. Turn on **Larger targets**
5. **Trigger reminder (demo)** → tap Take dose
6. Tap **Evening tablet · Low · refill** → tap Request refill
7. Optional: **Voice** and say “take”, “skip”, “refill”, or “undo” (Chrome + mic)

## What’s in the prototype

| Feature | Status |
|---|---|
| Next dose + large tap to take | Working |
| Skip with large choices | Working |
| Undo (30s) | Working |
| Today list | Working |
| Simulated refill | Working |
| Demo reminder overlay | Working |
| Voice commands | Working in Chromium browsers |
| Access settings | Working |
| Real pharmacy API | Not in prototype |
| Real push notifications | Not in prototype |

No backend, no login. Data is stored in the browser (`localStorage`).

## Files

- `index.html` — app shell
- `styles.css` — large targets, contrast, thumb zone
- `app.js` — doses, hold logic, voice, settings

## Team

Clone this repo, run the Python server, present from the browser. Reset demo data before you go on stage.
