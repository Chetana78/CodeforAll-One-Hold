# One Tap

Accessible medication management for **one-handed and low-dexterity** use.

Hackathon: **Accessibility in Every Step of the Medicine Journey**

Most pill apps assume two hands, tiny taps, and swipes. One Tap uses **one large tap**, thumb-zone buttons, voice, keyboard/switch, and a 30-second undo.

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
5. **Turn on phone reminders** → Allow in the browser (alerts at 08:00, 13:00, 21:00)
6. **Trigger reminder (demo)** if it is not dose time yet → tap Take dose
7. Tap **Evening tablet · Low · refill** → tap Request refill
8. Optional: **Voice** and say “take”, “skip”, “refill”, or “undo” (Chrome + mic)

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
| Voice commands | Working in Chromium browsers |
| Access settings | Working |
| Real pharmacy API | Not in prototype |
| SMS or locked-phone OS alarms | Not in prototype |

No backend, no login. Data is stored in the browser (`localStorage`).

## Files

- `index.html` — app shell
- `styles.css` — large targets, contrast, thumb zone
- `app.js` — doses, hold logic, voice, settings

## Team

Clone this repo, run the Python server, present from the browser. Reset demo data before you go on stage.
