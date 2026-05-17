# Irida Wellness

PWA personale di benessere per Irida. Single-user, dati locali su iPhone, export manuale.

## Stack

- HTML + Tailwind via CDN + JS vanilla (zero build step, zero npm)
- IndexedDB per storage locale
- Service Worker per offline
- Design system: palette terracotta (#8b4e3e), Noto Serif + Be Vietnam Pro

## Funzionalità v1

- **Home** — saluto orario, card peso/acqua/ciclo, insight del giorno generato da regole locali, anteprima pasti, export markdown
- **Diario** — 14 chip categorie (verdura, frutta, cereali int/raf, legumi, pesce, carni, uova, latticini, grassi buoni, dolci, alcol, snack), 3 porzioni S/M/L, acqua a bicchieri, navigazione fra giorni, vista *ideale vs reale* su 7gg con barre colorate, editor del diario ideale
- **Salute** — peso con grafico SVG trend 30gg, ciclo con calendario 28gg + predizione prossimo ciclo + ovulazione + media lunghezza calcolata dai dati reali, 12 sintomi tap-to-log, esami sangue con datalist (Ferritina, vit D, TSH, ecc.) e trend per marker

## Sviluppo locale

Service Worker e IndexedDB richiedono HTTP, non `file://`. Usa il server Python:

```powershell
./dev.ps1
```

Oppure manualmente:

```powershell
python -m http.server 8000
# poi apri http://localhost:8000
```

## Deploy GitHub Pages

```powershell
git init
git add .
git commit -m "Irida Wellness v1"
git branch -M main
git remote add origin git@github.com:<tuo-user>/irida-wellness.git
git push -u origin main
```

Poi su GitHub: **Settings → Pages → Source = `main` / `(root)`**. Dopo ~30s avrai l'URL HTTPS:
`https://<tuo-user>.github.io/irida-wellness/`

### Installazione su iPhone

1. Apri l'URL su **Safari** (non Chrome — su iOS solo Safari supporta install PWA)
2. Tocca il pulsante **Condividi** (quadrato con freccia in su)
3. Scorri e tocca **"Aggiungi a Home"**
4. L'app comparirà sull'home come una normale app, si aprirà a tutto schermo

### Note importanti

- I dati sono **locali al dispositivo**. Se Irida installa l'app su iPhone e iPad, sono due archivi diversi.
- Per migrare/condividere usa il bottone **⇩** in Home (export JSON).
- iOS Safari pulisce IndexedDB dopo ~30 giorni di non utilizzo. Usa l'app almeno una volta al mese, o fai export periodico.

## Notifiche su iPhone

L'app non invia notifiche push (richiederebbero un server). Quando Irida apre l'app, la sezione **"Promemoria di oggi"** in Home mostra proattivamente cosa manca (Sideral non preso, acqua bassa per l'orario, peso non registrato da 7gg, ciclo in arrivo, ecc.).

Per **avvisi a orario fisso anche senza aprire l'app**, usa l'app **Promemoria** di iPhone (30 secondi una volta sola):

1. Apri **Promemoria** → **+ Nuovo promemoria**
2. Titolo: `Sideral` · Data: oggi · Ora: es. 08:00
3. Tocca **i** (info) → attiva **Ripeti: Ogni giorno**
4. Salva

Ripeti per:
- 💊 Sideral — 08:00 ogni giorno
- 💧 Acqua — 10:00, 14:00, 18:00 ogni giorno
- ⚖️ Peso — 07:30 lunedì (settimanale)
- 🩸 Esami del sangue — ogni 3 mesi

Quando suona il promemoria, basta tornare sull'app e tappare per registrare.

## Backup

- **Export Markdown** (Home → "Copia markdown"): copia negli appunti gli ultimi 7gg in formato leggibile. Incolla in una chat Claude/ChatGPT per analisi approfondite.
- **Export JSON** (Home → bottone ⇩): scarica un file JSON con tutto lo storico. Salvalo dove vuoi (Drive, Mail, iCloud).

## Personalizzazione

- **Diario ideale**: tocca "Modifica diario ideale" nel Diary per impostare i target settimanali per categoria.
- **Categorie**: per aggiungerne/rimuovere modifica l'array `CATEGORIES` in [app.js](app.js).
- **Insight**: le regole sono in `computeInsight()` in [app.js](app.js). Aggiungi pattern personalizzati lì.
- **Goal acqua**: di default 8 bicchieri/die. Modifica via console: `IridaDB.setConfig("waterGoal", 10)`.

## Struttura dati

In IndexedDB, vedi `STORES` in [app.js](app.js):

| Store | Campi |
|---|---|
| food | id, ts, category, portion (S/M/L) |
| water | id, ts, glasses |
| weight | id, ts, kg |
| cycle | id, startDate, length? |
| labs | id, ts, marker, value, unit |
| symptom | id, ts, tag, intensity |
| config | key, value |

## Roadmap futura (idee)

- Sezione Fitness (rimandata da v1)
- Foto pasto opzionale
- Sync via Supabase free tier se serve multi-device
- Reminder push (richiede app Capacitor/PWABuilder)
