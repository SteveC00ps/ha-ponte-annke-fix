#!/usr/bin/env node
'use strict';
/*
 * Ponte Annke Sight -> go2rtc
 * ---------------------------------------------------------------
 * Si collega all'NVR wireless Annke (base JuanVision, WebSocket porta 10000)
 * usando la stessa libreria della pagina web dell'NVR (/dist/import.js),
 * apre un canale e scrive il video H.265 "grezzo" (Annex-B) su stdout.
 * go2rtc lo legge con una sorgente "exec:" e lo ripubblica in RTSP/WebRTC.
 *
 * Uso:
 *   node ponte-annke.js <canale 1..8> [sub|main]      -> video su stdout (per go2rtc)
 *   node ponte-annke.js <canale> [sub|main] --test    -> prova di 10 s, nessun video in uscita
 *
 * Tutti i messaggi vanno su stderr: stdout trasporta solo il video.
 * Non modifica nulla sull'NVR: legge soltanto il flusso, come la pagina web.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIR = __dirname;
const log = (...a) => process.stderr.write('[ponte] ' + a.join(' ') + '\n');

// ---------- argomenti ----------
const args = process.argv.slice(2);
const TEST = args.includes('--test');
const pos = args.filter((a) => !a.startsWith('--'));
const CH = Math.max(1, parseInt(pos[0] || '1', 10) || 1);       // 1 = primo canale
const STREAM_NAME = (pos[1] || 'sub').toLowerCase();
const STREAM_ID = STREAM_NAME === 'main' ? 0 : 1;               // 0 principale, 1 secondario

// ---------- configurazione ----------
const cfg = { host: '192.168.1.6', port: 10000, user: 'admin', password: '' };
try {
  const raw = fs.readFileSync(path.join(DIR, 'config.json'), 'utf8').replace(/^﻿/, '');
  Object.assign(cfg, JSON.parse(raw));
} catch (e) {
  log('ATTENZIONE: config.json mancante o non valido (' + e.message + '), uso i valori predefiniti');
}

// ---------- riassemblaggio dei fotogrammi grandi ----------
// The NVR sends each frame as IOT DATA messages carrying at most 64 KB of
// payload. Frames larger than that (high-resolution keyframes) continue in
// further DATA messages that do not start with a frame header. import.js
// treats every message as a complete frame, so it silently drops those
// continuation chunks and keyframes arrive cut off at ~64 KB (grey picture
// below the cut). This wraps WebSocket so the library receives each frame
// whole: continuation payloads are appended to the frame in progress, which
// is handed over when the next frame header arrives.
function installReassembler() {
  const Native = globalThis.WebSocket;
  const IOT_HDR = 32;                   // iot hdr_len
  const DATA = 19, DATA_PRIOR = 43;     // IOT_LINK_CMD_DATA, IOT_LINK_CMD_DATA_PRIOR
  const FRAM = 0x4652414d, FRAN = 0x4652414e; // PROC_FRAME_MAGIC, PROC_FRAME_MAGIC2
  const LE = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

  class ReassemblingWebSocket extends Native {
    addEventListener(type, fn, opts) {
      if (type !== 'message') return super.addEventListener(type, fn, opts);
      let pend = null;                  // { hdr, chunks, size, parts }
      const flush = () => {
        if (!pend) return;
        const p = pend;
        pend = null;
        const out = new Uint8Array(IOT_HDR + p.size);
        out.set(p.hdr, 0);
        let off = IOT_HDR;
        for (const c of p.chunks) { out.set(c, off); off += c.length; }
        new DataView(out.buffer).setUint32(28, p.size, true); // payload_len
        if (p.parts > 1) reassembled++;
        fn.call(this, { type: 'message', target: this, data: out.buffer });
      };
      return super.addEventListener('message', (ev) => {
        const d = ev.data instanceof ArrayBuffer ? new Uint8Array(ev.data) : null;
        if (d && d.length > IOT_HDR) {
          const cmd = LE(d, 4);
          if (cmd === DATA || cmd === DATA_PRIOR) {
            const pl = d.subarray(IOT_HDR);
            const magic = pl.length >= 4 ? LE(pl, 0) : 0;
            if (magic === FRAM || magic === FRAN) {          // start of a new frame
              flush();
              pend = { hdr: d.slice(0, IOT_HDR), chunks: [pl.slice()], size: pl.length, parts: 1 };
              return;
            }
            if (pend && magic !== 0x4b503250) {                // continuation (not an API reply)
              pend.chunks.push(pl.slice());
              pend.size += pl.length;
              pend.parts++;
              return;
            }
          }
        }
        fn.call(this, ev);                                    // everything else unchanged
      }, opts);
    }
  }
  globalThis.WebSocket = ReassemblingWebSocket;
}
let reassembled = 0;

// ---------- libreria dell'NVR ----------
async function loadLib() {
  const local = path.join(DIR, 'import.js');
  let code = null;
  try {
    const r = await fetch(`http://${cfg.host}/dist/import.js`, { signal: AbortSignal.timeout(5000) });
    if (r.ok) {
      code = await r.text();
      try { fs.writeFileSync(local, code); } catch (_) { /* copia locale facoltativa */ }
    } else {
      log('download import.js: HTTP', r.status);
    }
  } catch (e) {
    log('download import.js non riuscito (' + e.message + '), provo la copia locale');
  }
  if (!code) {
    if (!fs.existsSync(local)) throw new Error("impossibile ottenere import.js dall'NVR " + cfg.host);
    code = fs.readFileSync(local, 'utf8');
  }

  if (typeof WebSocket === 'undefined') {
    throw new Error('serve Node.js 22 o piu recente (WebSocket integrato)');
  }
  installReassembler();

  // Ambiente minimo da browser richiesto dalla libreria
  const noop = () => {};
  const fakeEl = () => ({
    style: {}, appendChild: noop, removeChild: noop, setAttribute: noop, addEventListener: noop,
    contentWindow: { document: { open: noop, write: noop, close: noop, F: Object } },
  });
  globalThis.window = globalThis;
  globalThis.self = globalThis;
  globalThis.document = {
    createElement: fakeEl, documentElement: fakeEl(), body: fakeEl(), head: fakeEl(),
    getElementsByTagName: () => [fakeEl()], getElementById: () => null,
    querySelector: () => null, addEventListener: noop,
  };
  globalThis.XMLHttpRequest = class { open() {} send() {} setRequestHeader() {} };

  vm.runInThisContext(code, { filename: 'import.js' });
  const A = globalThis.apip2p;
  if (!A || typeof A.connectbyip !== 'function') throw new Error('apip2p non trovato in import.js');
  return A;
}

// ---------- programma ----------
(async () => {
  let A;
  try {
    A = await loadLib();
  } catch (e) {
    log('ERRORE:', e.message);
    process.exit(1);
  }

  const c = A.create(0);
  c.preview = {};
  let connected = false;
  let gotKey = false;
  let frames = 0;
  let bytes = 0;
  let lastFrame = Date.now();
  const t0 = Date.now();

  const shutdown = (code) => {
    try { A.close_stream(c, CH - 1, STREAM_ID); } catch (_) {}
    try { A.close_socket(c); } catch (_) {}
    setTimeout(() => process.exit(code), 200);
  };
  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));
  process.stdout.on('error', () => shutdown(0)); // go2rtc ha chiuso il flusso

  A.onconnect = (conn, code) => {
    if (conn !== c) return;
    if (code !== 0) { log('connessione non riuscita, codice', code); return shutdown(2); }
    connected = true;
    log(`connesso a ${cfg.host}:${cfg.port}`);
    A.login(c, String(cfg.user), String(cfg.password));
  };
  A.onloginresult = (conn, r) => {
    if (conn !== c) return;
    if (r !== 0) {
      log(`accesso rifiutato (codice ${r}): controlla utente e password in config.json`);
      return shutdown(3);
    }
    log(`accesso OK, apro canale ${CH} (${STREAM_NAME === 'main' ? 'principale' : 'secondario'})`);
    A.open_stream(c, CH - 1, STREAM_ID);
  };
  A.onopenstream = (conn, ch, s, r) => {
    if (conn !== c) return;
    if (r !== 0) { log('apertura canale non riuscita, codice', r); shutdown(4); }
  };
  A.ondisconnect = (conn, code) => {
    if (conn !== c) return;
    log('disconnesso dall\'NVR, codice', code);
    shutdown(5);
  };
  A.onclosestream = () => {};
  A.onptzresult = () => {};

  A.onrecvframeex = (conn, frametype, data, len, ch, w, h, enc) => {
    if (conn !== c) return;
    if (frametype !== 1 && frametype !== 2) return;      // 1 = chiave, 2 = intermedio; 0 = audio
    if (!gotKey) {
      if (frametype !== 1) return;                       // si parte sempre da un fotogramma chiave
      gotKey = true;
      log(`primo fotogramma chiave: ${enc} ${w}x${h}`);
    }
    frames++;
    bytes += len;
    lastFrame = Date.now();
    if (!TEST) process.stdout.write(Buffer.from(data.subarray(0, len)));
  };

  // controlli di sicurezza
  setInterval(() => {
    const now = Date.now();
    if (!connected && now - t0 > 10000) { log('nessuna risposta dall\'NVR in 10 s'); shutdown(6); }
    if (gotKey && now - lastFrame > 15000) { log('nessun video da 15 s, chiudo'); shutdown(7); }
  }, 2000);

  if (TEST) {
    setTimeout(() => {
      const s = (Date.now() - t0) / 1000;
      if (frames > 0) {
        log(`PROVA RIUSCITA: ${frames} fotogrammi, ${(bytes / 1024).toFixed(0)} KB in ${s.toFixed(1)} s, ${reassembled} fotogrammi riassemblati`);
        shutdown(0);
      } else {
        log('PROVA FALLITA: nessun fotogramma video ricevuto');
        shutdown(8);
      }
    }, 10000);
  }

  log(`collegamento a ${cfg.host}:${cfg.port}...`);
  A.connectbyip(c, cfg.host, String(cfg.port));
})();
