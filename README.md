# Bouli — Boule-Abstandsmessung

Eine kleine **PWA** zum schnellen Messen von Boule-/Pétanque-Abständen aus einem Foto. Kein Backend, kein API-Key, läuft komplett im Browser.

![Bouli Logo](icons/icon-192.png)

## Was kann Bouli?

- **Foto aufnehmen** mit Kamera (mit Wasserwaage-Anzeige für eine ehrliche Draufsicht) oder vorhandenes Bild laden.
- **Auto-Erkennung**: Bouli versucht den Meterstab, das Schweinchen (Cochonnet) und die Kugeln automatisch zu finden.
- **Tippen zum Korrigieren**:
  - Tippe auf eine Kugel/Schweinchen → entfernt den Marker.
  - Tippe auf den Meterstab → öffnet das Modal, um die Länge anzupassen.
  - Tippe auf einen leeren Bereich → setzt einen neuen Marker (snappt automatisch in den Mittelpunkt der Kugel).
- **Anpassbare Stablänge**: 50 / 100 / 200 cm Presets oder freier Wert. Wert wird lokal gespeichert (kein Server).
- **Offline-fähig**: Service Worker cached die App nach dem ersten Aufruf.
- **Installierbar**: Als PWA auf iOS/Android/Desktop hinzufügen.

## Bedienung

1. App öffnen, Foto aufnehmen oder laden — der Meterstab muss sichtbar sein.
2. Bouli erkennt Stab, Schweinchen und Kugeln automatisch und zeigt die Abstände.
3. Falsch erkannte Marker antippen → entfernt. Korrekte Position antippen → neuer Marker mit Snap.
4. Stablänge oben rechts im Header antippen, falls nicht 100 cm.

## Tech-Stack

- **Vanilla JS / HTML / CSS** — keine Frameworks
- **Canvas 2D** für Bildanzeige & Annotationen
- **Connected-Components + PCA** für Auto-Erkennung
- **localStorage** für Stablänge
- **Service Worker** für Offline-Cache
- **PWA Manifest** für Installation

## Lokal entwickeln

```bash
# Beliebigen statischen Server starten, z.B.:
python -m http.server 8765

# Dann öffnen: http://localhost:8765
```

PWA-Features (Service Worker, Kamera) brauchen **HTTPS oder localhost**.

## Deployment

Da rein statisch, läuft die App auf jedem CDN. Empfohlen:

- **GitHub Pages** — direkt aus diesem Repo (Settings → Pages → main branch).
- **Cloudflare Pages** — schnellster CDN, GitHub-Integration, kostenlos.
- **Netlify** / **Vercel** — Drag-and-Drop oder Git-Integration.

Alle bieten kostenloses HTTPS, das die PWA braucht.

## Struktur

```
.
├── index.html         # UI + Layout
├── app.js             # Logik (Canvas, Detection, State)
├── sw.js              # Service Worker
├── manifest.json      # PWA Manifest
├── icons/             # App-Icons (PWA / Favicon / Apple Touch)
├── generate_icons.py  # Icon-Generator (PIL)
└── test.js            # Playwright Smoke-Test (lokal)
```

## Lizenz

Privates Projekt. Use at your own risk. 🎯
