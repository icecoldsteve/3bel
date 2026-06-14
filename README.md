# 3BEL — Ramenwasplanning (PWA)

Offline-first Progressive Web App voor ramenwasbedrijf **3BEL** (zaakvoerder Andry).
Pure HTML/CSS/Vanilla JS + IndexedDB. Geen frameworks, geen build-stap.

## Functies
- **Kalender** — maand- en dagweergave. Werkblok standaard 17:00–22:00; hoofdberoep (07–17) en nacht (22–03) geblokkeerd.
- **Klantenbeheer** — naam, adres, telefoon (WhatsApp), frequentie (1/2/4 weken). IndexedDB.
- **WhatsApp-flow** — klik op afspraak → `wa.me` met vooraf ingevuld bericht. Status/kleur: geel (gepland) → groen (bericht verstuurd) → grijsblauw (voltooid).
- **Auto-plannen** — verdeelt "due" klanten over de week, geclusterd per gemeente met nearest-neighbour route (postcode-coördinaten kust/Westhoek, geen externe API).
- **Dagafsluiting** — platte tekstlijst van voltooide afspraken, één knop "Kopieer voor Dexxter".
- **Back-up** — export/import van alle data als JSON (toestel naar toestel).

## Lokaal draaien
```bash
npx serve .        # of: python3 -m http.server 8000
```
Open via `http://localhost:8000`. PWA-installatie & service worker werken enkel over https of localhost.

## Deploy
Statische site — Vercel serveert de root rechtstreeks. Geen build command nodig.

---
Gebouwd door [SMSAK](https://www.smsak.be) · KBO BE1035.506.672
