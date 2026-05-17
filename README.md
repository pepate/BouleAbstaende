# Bouli — Live-AR Boule-Abstandsmessung

Eine **PWA**, die per Live-Kamera Boule-Kugeln erkennt und in Echtzeit anzeigt, welche Kugel am nächsten zum Schweinchen liegt. Kein Backend, läuft komplett im Browser.

![Bouli Logo](icons/icon-192.png)

## Was kann Bouli?

- **Live-Kamera mit AR-Overlay**: Fadenkreuz in der Bildmitte markiert das Schweinchen, Kugeln werden automatisch erkannt.
- **Sofort-Ranking**: Nächste Kugel grün hervorgehoben, andere mit Rang + Prozent (relativ zur nächsten).
- **Wasserwaage**: Bubble-Indikator unten zentriert, warnt bei Schräglage — die Kamera soll waagerecht über dem Schweinchen liegen.
- **Vollautomatisch**: Keine manuelle Korrektur, kein Antippen, kein Foto-Knopf.
- **Offline-fähig**: Service Worker cached die App nach dem ersten Aufruf.
- **Installierbar**: Als PWA auf iOS/Android/Desktop hinzufügen.

## Bedienung

1. App öffnen, Kamera erlauben.
2. Smartphone waagerecht über das Schweinchen halten — Bubble-Wasserwaage zeigt, wie gerade.
3. Bildmitte = Schweinchen-Position. Erkannte Kugeln werden nach Pixel-Abstand sortiert.

## Tech-Stack

- **Vanilla JS / HTML / CSS** — keine Frameworks, keine Build-Tools
- **Canvas 2D** für AR-Overlay
- **Hough Circle Transform** für Live-Kugel-Erkennung (selbst implementiert)
- **DeviceOrientation API** für Wasserwaage
- **getUserMedia** für Live-Kamera
- **Service Worker** für Offline-Cache
- **PWA Manifest** für Installation

## Architektur

```
app.js                    Frame-Loop + Verkabelung
modules/
  camera.js               getUserMedia + Frame-Grabbing
  detector.js             Graustufen → Blur → Sobel → Hough → NMS
  ranker.js               Bälle nach Pixel-Abstand zur Bildmitte sortieren
  renderer.js             Canvas-Overlay: Fadenkreuz, Linien, Marker, Labels
  level.js                Wasserwaage via DeviceOrientation
  pwa.js                  Service Worker Registration + Install Prompt
```

## Lokal entwickeln

```bash
python3 -m http.server 8765

# App:   http://localhost:8765
# Tests: http://localhost:8765/tests/runner.html
```

PWA-Features (Service Worker, Kamera) brauchen **HTTPS oder localhost**. Für Smartphone-Tests im lokalen Netz: `ngrok http 8765` oder ein selbst-signiertes Zertifikat.

## Deployment

Da rein statisch, läuft die App auf jedem CDN mit HTTPS:

- **GitHub Pages** — direkt aus diesem Repo (Settings → Pages → main branch).
- **Cloudflare Pages** — schnellster CDN, kostenlos.
- **Netlify** / **Vercel** — Drag-and-Drop oder Git-Integration.

## Struktur

```
.
├── index.html            UI + Layout
├── styles.css            Styles
├── app.js                Bootstrap + Frame-Loop
├── modules/              Logik-Module (camera, detector, ranker, renderer, level, pwa)
├── sw.js                 Service Worker
├── manifest.json         PWA Manifest
├── icons/                App-Icons
├── tests/                Browser-Test-Runner + Unit-Tests
└── docs/superpowers/     Spec + Implementation Plan
```

## Lizenz

Privates Projekt. Use at your own risk. 🎯
