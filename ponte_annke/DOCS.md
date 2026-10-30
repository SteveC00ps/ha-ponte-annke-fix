# Ponte Annke

Porta in Home Assistant le telecamere di un NVR wireless **Annke** (app *Annke Sight*, base JuanVision, es. N48WHR) che non offre RTSP.

## Come funziona
Il ponte si collega all'NVR come la sua pagina web (WebSocket, porta 10000), apre il canale e passa il video H.265 a **go2rtc**, che lo ripubblica in RTSP. L'NVR non viene modificato. Ogni flusso si attiva solo quando qualcuno lo guarda.

## Opzioni
| Opzione | Significato |
|---|---|
| `host` | indirizzo IP dell'NVR |
| `port` | porta WebSocket dell'NVR (10000) |
| `user` / `password` | credenziali dell'NVR (le stesse della pagina web) |
| `channels` | numero di telecamere (1–8) |

## Indirizzi
- `rtsp://127.0.0.1:8654/cam1` flusso secondario (leggero) del canale 1
- `rtsp://127.0.0.1:8654/cam1_hd` flusso principale del canale 1
- e cosi via per `cam2`, `cam3`, …

La pagina di go2rtc si apre dal pannello **Telecamere Annke** nella barra laterale.

## Aggiungere le telecamere a Home Assistant
Impostazioni → Dispositivi e servizi → Aggiungi integrazione → **Telecamera generica**:
- *URL del flusso*: `rtsp://127.0.0.1:8654/cam1`
- *URL immagine fissa*: lasciare vuoto
- protocollo RTSP: TCP

## Note
- Video H.265: dipende dal browser/dispositivo; se non si vede, impostare H.264 nell'NVR (Encoding Settings), se disponibile.
- Solo video (l'audio G.711 non e' ancora inoltrato).
- La pagina di go2rtc (porta 1994) e' raggiungibile anche dalla rete locale.
