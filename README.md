# Tetris Web

Versione web di Tetris con classifica persistente su file JSON.

## Funzionalita principali
- Board 10x20 con 7 tetramini e randomizer a sacchetto (7-bag)
- Punteggio con linee, T-Spin, Back-to-Back, combo, soft drop e hard drop
- Ghost piece (luce soffusa) per vedere la posizione di atterraggio
- Animazione glow quando fai un Tetris
- Pausa e reset
- Modalita schermo intero
- Classifica permanente (top 10) salvata su `scores.json`

## Comandi
- Frecce sinistra/destra: muovi
- Freccia su: ruota
- Freccia giu: soft drop
- Spazio: hard drop
- P: pausa
- R: reset
- F: schermo intero

## Avvio (con classifica persistente)
Serve un piccolo server locale che salva su `scores.json`.

```bash
cd tetris-web
node server.js
```

Poi apri `http://localhost:3000` nel browser.

## API (server interno)
- `GET /api/scores` -> restituisce la top 10
- `POST /api/scores` -> salva un punteggio e restituisce la top 10 + la posizione del giocatore se fuori dalla top 10

Payload esempio:
```json
{ "name": "Mario", "score": 12345 }
```

Risposta esempio (POST):
```json
{
  "top": [{ "name": "Mario", "score": 12345, "time": 1730000000000 }],
  "extra": { "rank": 14, "name": "Luca", "score": 1200 }
}
```

## Docker (Raspberry Pi e non solo)

L'immagine e basata su `node:lts-alpine` e supporta ARM (Raspberry Pi 3/4/5) e x86_64.

```bash
docker compose up -d
```

Apri `http://<ip-del-raspberry>:3000` nel browser.

I punteggi vengono salvati in `./data/scores.json` sull'host e sopravvivono a riavvii e rebuild.

Comandi utili:

```bash
docker compose build    # rebuilda l'immagine dopo modifiche al codice
docker compose logs     # vedi i log del server
docker compose down     # ferma e rimuove il container
```

## Struttura progetto
- `index.html` - markup della pagina
- `styles.css` - stile dell'interfaccia
- `script.js` - logica di gioco
- `server.js` - server HTTP e API classifica
- `scores.json` - database JSON dei punteggi (avvio locale)
- `data/scores.json` - database JSON dei punteggi (avvio Docker)
- `Dockerfile` - immagine Docker
- `docker-compose.yml` - orchestrazione Docker

## Note
Il progetto e realizzato in HTML/CSS/JS puro, senza dipendenze esterne.
