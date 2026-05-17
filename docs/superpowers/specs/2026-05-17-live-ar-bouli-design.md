# Bouli Live-AR — Design

**Status:** Draft
**Datum:** 2026-05-17
**Scope:** Komplette Neuschrift der Bouli-PWA. Bestehender Foto-basierter Workflow wird durch Live-Kamera mit AR-Overlay ersetzt.

## Ziel

Boule-Spieler sollen über die Smartphone-Kamera in Echtzeit erkennen können, welche Kugel am nächsten zum Schweinchen liegt — ohne Foto schießen, ohne Meterstab, ohne manuelle Eingabe.

## Kern-Idee

- Live-Kamera-Stream als Hintergrund (Vollbild).
- Center der Kamera = Position des Schweinchens. Nutzer hält das Smartphone waagerecht über das Schweinchen.
- Boule-Kugeln werden automatisch im Stream erkannt.
- Pixel-Abstand jeder Kugel zum Bild-Center wird laufend berechnet und visuell angezeigt.
- Keine cm-Einheit — nur relative/prozentuale Abstände, da die Frage "welche Kugel ist am nächsten?" reicht.

## Nicht-Ziele

- Keine cm-genaue Messung.
- Keine manuelle Korrektur erkannter Kugeln (rein automatisch).
- Keine Team-Unterscheidung nach Farbe.
- Keine Foto-Aufnahme oder Snapshot-Modus.
- Keine Verlaufsspeicherung oder Punktezählung.

## Annahmen

- **Kamera-Haltung:** Nutzer hält das Smartphone waagerecht (parallel zum Boden) mit Kamera nach unten, ca. 1-2 m über dem Schweinchen. Bubble-Wasserwaage hilft beim Ausrichten.
- **Bei dieser Top-Down-Haltung** sind Pixel-Abstände proportional zu echten Abständen — ausreichend für relative Rangfolge.
- **Boule-Kugeln** erscheinen als nahezu perfekte Kreise mit ähnlichem Pixel-Radius im Bild.
- **Ziel-Plattform:** mobile Browser, primär iOS Safari (15+) und Android Chrome.
- Vanilla JS/HTML/CSS, keine Frameworks. App bleibt installierbare PWA.

## Architektur

```
┌─────────────────────────────────────┐
│  index.html (Live-Kamera-Viewport)  │
└──────────────┬──────────────────────┘
               │
   ┌───────────┴───────────┐
   │  CameraStream         │  getUserMedia → <video>
   │  (modules/camera.js)  │  Stream-Lifecycle
   └───────────┬───────────┘
               │ Frames
   ┌───────────┴───────────┐
   │  Detector              │  Canvas-Frame → Graustufen
   │  (modules/detector.js) │  → Edge → Hough Circles
   └───────────┬───────────┘  → Kreis-Filter (Größe, Kontrast)
               │ Bälle [{x, y, r}]
   ┌───────────┴───────────┐
   │  Ranker                │  Pixel-Abstand zum Bild-Center
   │  (modules/ranker.js)   │  → Sortieren, Prozent berechnen
   └───────────┬───────────┘
               │ Ranked [{x, y, r, rank, percent}]
   ┌───────────┴───────────┐
   │  Renderer              │  Canvas-Overlay auf <video>
   │  (modules/renderer.js) │  Linien + Labels + Hervorhebung
   └────────────────────────┘

   ┌───────────────────────┐
   │  Level (Wasserwaage)  │  DeviceOrientation → Bubble
   │  (modules/level.js)   │
   └───────────────────────┘
```

`app.js` orchestriert: holt Frame → an Detector → an Ranker → an Renderer. Keine Logik dort, nur Verkabelung.

## Module

### `camera.js`
- Startet `getUserMedia({video: {facingMode: 'environment'}})`.
- Hält Referenz auf `<video>`-Element.
- Liefert auf Anforderung das aktuelle Frame als `ImageData` (auf reduzierter Detection-Auflösung, z.B. 480×640).
- API:
  - `start() → Promise<void>` — startet Stream, behandelt Permission-Flow.
  - `stop()` — beendet Stream.
  - `grabFrame() → ImageData` — liefert aktuelles Frame in Detection-Auflösung.

### `detector.js`
- Reine Funktion: `ImageData` rein, Kugel-Liste raus.
- Pipeline:
  1. Graustufen + leichter Gauß-Blur.
  2. Sobel-Edge-Detection (Canvas 2D Implementation).
  3. Hough Circle Transform mit Akkumulator-Array.
  4. Non-Maximum-Suppression für überlappende Kandidaten.
  5. Filter: erwarteter Radius-Bereich (z.B. 15-50 px), Mindest-Akkumulator-Score, Plausibilität (Kugel-Inneres unterscheidet sich von Rand).
- API:
  - `detect(imageData) → Array<{x, y, r}>`

### `ranker.js`
- Reine Funktion.
- Berechnet euklidischen Pixel-Abstand jedes Balls zum Bild-Center.
- Sortiert aufsteigend.
- Berechnet Prozent: `round(abstand / abstand_kugel_1 * 100)`.
- API:
  - `rank(balls, centerX, centerY) → Array<{x, y, r, rank, percent}>`

### `renderer.js`
- Zeichnet auf einem Overlay-Canvas, das über dem `<video>` liegt.
- Pro Frame:
  1. Canvas clearen.
  2. Fadenkreuz im Center zeichnen (dünn, weiß mit Schatten).
  3. Linien vom Center zu jeder Kugel zeichnen — Rank 1: grün, dick. Rest: grau, dünn.
  4. Ring um jede Kugel zeichnen (gleiche Farbcodierung).
  5. Label nahe der Kugel: "1" oder "2 · 127 %".
- API:
  - `render(canvas, rankedBalls, centerX, centerY)`

### `level.js`
- Liest `DeviceOrientationEvent` (mit iOS-Permission-Handling).
- Berechnet Neigung gegen die Horizontale.
- Bubble-Indikator wird im DOM aktualisiert (Position der Bubble = Neigungsvektor).
- Bei Neigung > 5° wird Bubble eingefärbt (gelb/rot) und Hinweis "Halt waagerecht!" eingeblendet.
- Fallback: ohne Sensoren keine Wasserwaage, App funktioniert trotzdem.

### `pwa.js`
- Service-Worker-Registration.
- Install-Prompt (`beforeinstallprompt` Event abfangen, Button im Header anzeigen).

## Frame-Loop & Performance

- **`requestAnimationFrame`-Loop** in `app.js`.
- **Detection-Auflösung:** Frame wird auf 480×640 herunterskaliert vor Detection. Drastische Performance-Verbesserung gegenüber Full HD.
- **Frame-Skipping:** Detection läuft nicht jedes Frame, sondern alle 2-3 Frames. Zwischen Detections wird die letzte Kugel-Liste weiter gerendert (sieht stabil aus).
- **Temporal Smoothing:** Ergebnisse über die letzten 3 Detections matchen (Position-Tracking nach Nähe). Reduziert Flackern und kurzzeitige Aussetzer.
- **Optional Web Worker (Phase 2):** Falls Mainthread-Blocking auftritt, Detection in einen Worker auslagern. Start ohne Worker, messen, dann entscheiden.

## UI / AR-Overlay

**Layout (Hochformat):**
- Header: schmal, halbtransparent. Logo links, Install-Button rechts (nur wenn PWA-Install verfügbar).
- Hauptbereich: Vollbild-`<video>` mit darübergelegtem Overlay-`<canvas>`.
- Fadenkreuz fix im Bild-Center.
- Linien vom Center zu erkannten Kugeln; Marker und Labels an jeder Kugel.
- Wasserwaage-Bubble unten zentriert.

**Visuelle Sprache:**
- Nächste Kugel (Rank 1): grüner Ring, dicke grüne Linie, grünes Label "1".
- Andere Kugeln: grauer Ring, dünne graue Linie, Label "Rank · Prozent" z.B. "2 · 127 %".
- Fadenkreuz: weiß mit Schatten, immer sichtbar.
- Wasserwaage: grün < 5°, gelb 5-10°, rot > 10°. Bei rot zusätzlich Hinweistext "Halt waagerecht!" im Hauptbereich.

**Permissions-Flow beim ersten Start:**
- Start-Screen "App benötigt Kamera-Zugriff".
- Button "Kamera starten" triggert `getUserMedia`.
- Bei Ablehnung: Fehlerseite mit Hinweis, wie der Zugriff im Browser-Setting freigegeben wird.
- Auf iOS zusätzlich Button "Sensoren erlauben" für `DeviceOrientationEvent`.

**Kein Modaler Workflow:**
- Keine Buttons im laufenden Betrieb (kein Pause, kein Snapshot, kein Tap-zum-Korrigieren). Modus ist immer "Live AR".

## Edge Cases

| Situation | Verhalten |
|---|---|
| Keine Kugel erkannt | Nur Fadenkreuz sichtbar, kein Ranking. |
| Genau 1 Kugel erkannt | Marker "1" ohne Prozent (keine Vergleichsbasis). |
| Kamera-Permission abgelehnt | Fehlerseite mit Erklärung. |
| Kein DeviceOrientation verfügbar | Wasserwaage ausgeblendet, App funktioniert. |
| Smartphone schräg gehalten | Wasserwaage rot, Hinweis "Halt waagerecht!". Erkennung läuft trotzdem, kann aber ungenau sein. |
| Detection > 100 ms pro Frame | Frame-Skipping kompensiert. Falls dauerhaft langsam, Detection-Auflösung weiter reduzieren. |

## Testing

- **Unit-Tests pro Modul**, ausgeführt im Browser (bestehende `test.js`-Struktur als Basis):
  - `detector.test.js`: synthetische `ImageData` mit gezeichneten Kreisen (Test-Fixtures als PNG) → erwartete Kugel-Liste.
  - `ranker.test.js`: feste Kugel-Listen → korrekte Rangfolge und Prozente, inkl. Edge Cases (0, 1, viele Kugeln).
- **Manueller Test**: echte Boule-Kugeln auf Sand/Kies. Verschiedene Lichtverhältnisse.
- **Keine Mocks** für Detection — Tests laufen gegen echte Pixel-Daten.

## Datei-Struktur

```
/index.html              — Layout, Video, Canvas, Header
/styles.css              — Stilangaben (neu, aus index.html ausgelagert)
/app.js                  — Bootstrap, Frame-Loop, Orchestrierung
/modules/
  camera.js
  detector.js
  ranker.js
  renderer.js
  level.js
  pwa.js
/sw.js                   — Service Worker (cachen aller Assets)
/manifest.json           — PWA-Manifest, Beschreibung an Live-AR angepasst
/icons/                  — bleibt unverändert
/tests/
  detector.test.js
  ranker.test.js
  fixtures/              — synthetische Test-Bilder (PNG)
```

## Was aus der bestehenden Codebasis übernommen wird

- Service-Worker- und Manifest-Setup als Vorlage (Pfade neu).
- Icons.
- Wasserwaage-Logik (DeviceOrientation) als Basis für `level.js`.

Alles andere wird neu geschrieben. Der bestehende Foto-Workflow, der Hough-/Connected-Components-Code für Meterstab-Erkennung und die manuelle Marker-Korrektur entfallen.

## Offene Fragen

Keine zum jetzigen Zeitpunkt. Alle wesentlichen Annahmen sind oben dokumentiert. Falls beim Implementieren Performance-Probleme auftreten, wird auf Web Worker oder reduzierte Detection-Frequenz ausgewichen — beides ist in der Architektur vorgesehen.
