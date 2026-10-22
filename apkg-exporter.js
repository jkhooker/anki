/**
 * LexiForge Anki Exporter Engine
 * Supports:
 * 1. Native .apkg (Anki Deck Package with collection.anki2 SQLite DB + embedded media images)
 *    - Works client-side via sql.js + Pure-JS PKZIP builder (for static hosting on GitHub Pages / Cloudflare / Netlify)
 *    - Automatically falls back to local /api/export-apkg (Python sqlite3) when offline/airgapped
 * 2. Multi-Deck Anki .txt / TSV (with #deck column:1 header for instant multi-deck merging)
 * 3. Direct AnkiConnect sync (http://127.0.0.1:8765)
 */

(function (global) {
  'use strict';

  const DECK_IDS = {
    'français': 1710000001001,
    'italiano': 1710000001002,
    'mandarin (正體字)': 1710000001003,
    'mandarin (簡化字)': 1710000001004
  };

  const BASIC_MODEL_ID = 1710000002001;

  // =========================================================================
  // 1. Pure-JS PKZIP Builder (Zero External Dependencies)
  // =========================================================================

  const CRC_TABLE = (function () {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
      crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xff];
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function createZipUint8Array(files) {
    // files: Array of { name: string, data: Uint8Array }
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    for (const file of files) {
      const nameBytes = encoder.encode(file.name);
      const dataBytes = file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data);
      const crc = crc32(dataBytes);
      const size = dataBytes.length;

      // Local file header (30 bytes + filename)
      const localHeader = new Uint8Array(30 + nameBytes.length);
      const lv = new DataView(localHeader.buffer);
      lv.setUint32(0, 0x04034b50, true); // Signature
      lv.setUint16(4, 20, true);         // Version needed (2.0)
      lv.setUint16(6, 0x0800, true);     // UTF-8 flag
      lv.setUint16(8, 0, true);          // Compression: 0 (STORE)
      lv.setUint16(10, 0, true);         // Mod time
      lv.setUint16(12, 0x21, true);      // Mod date
      lv.setUint32(14, crc, true);       // CRC-32
      lv.setUint32(18, size, true);      // Compressed size
      lv.setUint32(22, size, true);      // Uncompressed size
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);         // Extra length
      localHeader.set(nameBytes, 30);

      localParts.push(localHeader, dataBytes);

      // Central directory header (46 bytes + filename)
      const centralHeader = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(centralHeader.buffer);
      cv.setUint32(0, 0x02014b50, true); // Signature
      cv.setUint16(4, 20, true);         // Version made by
      cv.setUint16(6, 20, true);         // Version needed
      cv.setUint16(8, 0x0800, true);     // UTF-8 flag
      cv.setUint16(10, 0, true);         // Compression: 0 (STORE)
      cv.setUint16(12, 0, true);
      cv.setUint16(14, 0x21, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, size, true);
      cv.setUint32(24, size, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);    // Relative offset of local header
      centralHeader.set(nameBytes, 46);

      centralParts.push(centralHeader);
      offset += localHeader.length + dataBytes.length;
    }

    let centralSize = 0;
    for (const part of centralParts) centralSize += part.length;

    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);
    ev.setUint16(20, 0, true);

    const totalLength = offset + centralSize + 22;
    const out = new Uint8Array(totalLength);
    let pos = 0;
    for (const part of localParts) {
      out.set(part, pos);
      pos += part.length;
    }
    for (const part of centralParts) {
      out.set(part, pos);
      pos += part.length;
    }
    out.set(eocd, pos);
    return out;
  }

  // =========================================================================
  // 2. Card HTML & Media Formatting Helpers
  // =========================================================================

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function dataUrlToUint8Array(dataUrl) {
    const parts = dataUrl.split(',');
    const mimeMatch = parts[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const bstr = atob(parts[1]);
    const u8 = new Uint8Array(bstr.length);
    for (let i = 0; i < bstr.length; i++) {
      u8[i] = bstr.charCodeAt(i);
    }
    const ext = mime.includes('png')
      ? 'png'
      : mime.includes('webp')
        ? 'webp'
        : mime.includes('gif')
          ? 'gif'
          : 'jpg';
    return { u8, ext, mime };
  }

  /**
   * Formats the Front and Back strings for Anki according to exact user specs:
   * - Front:
   *   Line 1: Word or phrase being learned
   *   Two lines down (<br><br>): Context text (with **word or phrase**) and/or Context image
   * - Back:
   *   [A] = [B] = [C]
   */
  function compileAnkiFields(card, mediaFilename) {
    const headwordHtml = escapeHtml(card.word.trim());
    const extraParts = [];

    if (card.formattedContext && card.formattedContext.trim()) {
      const ctxHtml = escapeHtml(card.formattedContext.trim()).replace(/\r?\n/g, '<br>');
      extraParts.push(ctxHtml);
    }

    if (mediaFilename) {
      extraParts.push(`<img src="${escapeHtml(mediaFilename)}">`);
    }

    const frontHtml = extraParts.length > 0
      ? `${headwordHtml}<br><br>${extraParts.join('<br><br>')}`
      : headwordHtml;

    const backText = `${card.word.trim()} = ${card.pronunciation.trim()} = ${card.definition.trim()}`;
    const backHtml = escapeHtml(backText);

    return { frontHtml, backHtml, backText };
  }

  function deterministicChecksum(str) {
    // Simple 32-bit positive integer checksum for Anki csum column
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return Math.abs(h | 0);
  }

  function deterministicGuid(deck, word, id) {
    const seed = `${deck}::${word}::${id}`;
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%&()*+,-./:;<=>?@[]^_`{|}~';
    let out = '';
    let h = 5381;
    for (let i = 0; i < seed.length; i++) {
      h = ((h << 5) + h) ^ seed.charCodeAt(i);
    }
    let val = Math.abs(h);
    for (let i = 0; i < 10; i++) {
      out += chars[(val + i * 31 + seed.charCodeAt(i % seed.length)) % chars.length];
      val = Math.floor(val / 3) + seed.charCodeAt(i % seed.length) * 17;
    }
    return out;
  }

  // =========================================================================
  // 3. Client-Side SQLite (sql.js) .apkg Builder + Local Python Fallback
  // =========================================================================

  let sqlJsPromise = null;

  function loadSqlJsFromCdn() {
    if (sqlJsPromise) return sqlJsPromise;
    sqlJsPromise = new Promise((resolve, reject) => {
      if (global.initSqlJs) {
        global.initSqlJs({
          locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${file}`
        }).then(resolve).catch(reject);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.js';
      script.async = true;
      script.onload = () => {
        if (!global.initSqlJs) {
          reject(new Error('initSqlJs not available'));
          return;
        }
        global.initSqlJs({
          locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${file}`
        }).then(resolve).catch(reject);
      };
      script.onerror = () => reject(new Error('Could not load sql-wasm.js from CDN'));
      document.head.appendChild(script);
    });
    return sqlJsPromise;
  }

  function buildAnkiMetadataObjects(nowSec) {
    const decks = {
      '1': {
        id: 1,
        mod: nowSec,
        name: 'Default',
        usn: 0,
        lrnToday: [0, 0],
        revToday: [0, 0],
        newToday: [0, 0],
        timeToday: [0, 0],
        collapsed: false,
        browserCollapsed: false,
        desc: '',
        dyn: 0,
        conf: 1,
        extendNew: 10,
        extendRev: 50
      }
    };

    for (const [deckName, deckId] of Object.entries(DECK_IDS)) {
      decks[String(deckId)] = {
        id: deckId,
        mod: nowSec,
        name: deckName,
        usn: -1,
        lrnToday: [0, 0],
        revToday: [0, 0],
        newToday: [0, 0],
        timeToday: [0, 0],
        collapsed: false,
        browserCollapsed: false,
        desc: `Imported from LexiForge Anki Studio (${deckName})`,
        dyn: 0,
        conf: 1,
        extendNew: 10,
        extendRev: 50
      };
    }

    const models = {
      [String(BASIC_MODEL_ID)]: {
        id: BASIC_MODEL_ID,
        name: 'Basic',
        type: 0,
        mod: nowSec,
        usn: -1,
        sortf: 0,
        did: 1,
        tmpls: [
          {
            name: 'Card 1',
            ord: 0,
            qfmt: '{{Front}}',
            afmt: '{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}',
            bqfmt: '',
            bafmt: '',
            did: null,
            bfont: '',
            bsize: 0
          }
        ],
        flds: [
          { name: 'Front', ord: 0, sticky: false, rtl: false, font: 'Arial', size: 20, media: [] },
          { name: 'Back', ord: 1, sticky: false, rtl: false, font: 'Arial', size: 20, media: [] }
        ],
        css: '.card {\n font-family: arial;\n font-size: 20px;\n text-align: center;\n color: black;\n background-color: white;\n}\nimg { max-width: 100%; height: auto; border-radius: 6px; margin-top: 8px; }',
        latexPre: '',
        latexPost: '',
        latexsvg: false,
        req: [[0, 'any', [0]]],
        tags: [],
        vers: []
      }
    };

    const conf = {
      nextPos: 1,
      estTimes: true,
      activeDecks: [1],
      sortType: 'noteFld',
      timeLim: 0,
      sortBackwards: false,
      addToCur: true,
      curDeck: 1,
      newBury: true,
      newSpread: 0,
      dueCounts: true,
      curModel: String(BASIC_MODEL_ID),
      collapseTime: 1200
    };

    const dconf = {
      '1': {
        id: 1,
        mod: 0,
        name: 'Default',
        usn: 0,
        maxTaken: 60,
        autoplay: true,
        timer: 0,
        replayq: true,
        new: { bury: false, delays: [1, 10], initialFactor: 2500, ints: [1, 4, 7], order: 1, perDay: 20 },
        rev: { bury: false, ease4: 1.3, ivlFct: 1, maxIvl: 36500, perDay: 200, hardFactor: 1.2 },
        lapse: { delays: [10], leechAction: 1, leechFails: 8, minInt: 1, mult: 0 }
      }
    };

    return { decks, models, conf, dconf };
  }

  async function buildApkgClientSide(cards) {
    const SQL = await loadSqlJsFromCdn();
    const db = new SQL.Database();
    const nowSec = Math.floor(Date.now() / 1000);
    const nowMs = Date.now();

    db.run(`
      CREATE TABLE col (
        id integer primary key,
        crt integer not null,
        mod integer not null,
        scm integer not null,
        ver integer not null,
        dty integer not null,
        usn integer not null,
        ls integer not null,
        conf text not null,
        models text not null,
        decks text not null,
        dconf text not null,
        tags text not null
      );
      CREATE TABLE notes (
        id integer primary key,
        guid text not null,
        mid integer not null,
        mod integer not null,
        usn integer not null,
        tags text not null,
        flds text not null,
        sfld integer not null,
        csum integer not null,
        flags integer not null,
        data text not null
      );
      CREATE TABLE cards (
        id integer primary key,
        nid integer not null,
        did integer not null,
        ord integer not null,
        mod integer not null,
        usn integer not null,
        type integer not null,
        queue integer not null,
        due integer not null,
        ivl integer not null,
        factor integer not null,
        reps integer not null,
        lapses integer not null,
        left integer not null,
        odue integer not null,
        odid integer not null,
        flags integer not null,
        data text not null
      );
      CREATE TABLE revlog (
        id integer primary key,
        cid integer not null,
        usn integer not null,
        ease integer not null,
        ivl integer not null,
        lastIvl integer not null,
        factor integer not null,
        time integer not null,
        type integer not null
      );
      CREATE TABLE graves (
        usn integer not null,
        oid integer not null,
        type integer not null
      );
    `);

    const { decks, models, conf, dconf } = buildAnkiMetadataObjects(nowSec);

    db.run(
      `INSERT INTO col VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        1,
        nowSec,
        nowMs,
        nowMs,
        11,
        0,
        0,
        0,
        JSON.stringify(conf),
        JSON.stringify(models),
        JSON.stringify(decks),
        JSON.stringify(dconf),
        '{}'
      ]
    );

    const mediaManifest = {};
    const zipEntries = [];
    let mediaIndex = 0;

    cards.forEach((card, idx) => {
      let mediaFilename = null;
      if (card.imageDataUrl) {
        const { u8, ext } = dataUrlToUint8Array(card.imageDataUrl);
        mediaFilename = `lexiforge_${card.id}_${idx}.${ext}`;
        const key = String(mediaIndex++);
        mediaManifest[key] = mediaFilename;
        zipEntries.push({ name: key, data: u8 });
      }

      const { frontHtml, backHtml } = compileAnkiFields(card, mediaFilename);
      const noteId = nowMs + idx * 10 + 1;
      const cardId = nowMs + idx * 10 + 2;
      const deckId = DECK_IDS[card.deck] || DECK_IDS['français'];
      const guid = deterministicGuid(card.deck, card.word, card.id);
      const flds = `${frontHtml}\x1f${backHtml}`;
      const sfld = card.word.trim();
      const csum = deterministicChecksum(sfld);

      db.run(
        `INSERT INTO notes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [noteId, guid, BASIC_MODEL_ID, nowSec, -1, ' lexiforge ', flds, sfld, csum, 0, '']
      );

      db.run(
        `INSERT INTO cards VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [cardId, noteId, deckId, 0, nowSec, -1, 0, 0, idx + 1, 0, 0, 0, 0, 0, 0, 0, 0, '']
      );
    });

    const dbBytes = db.export();
    db.close();

    const encoder = new TextEncoder();
    zipEntries.unshift(
      { name: 'collection.anki2', data: dbBytes },
      { name: 'media', data: encoder.encode(JSON.stringify(mediaManifest)) }
    );

    const apkgBytes = createZipUint8Array(zipEntries);
    return new Blob([apkgBytes], { type: 'application/octet-stream' });
  }

  async function buildApkgViaServerFallback(cards) {
    const res = await fetch('/api/export-apkg', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cards })
    });
    if (!res.ok) {
      throw new Error(`Server export failed: ${res.status}`);
    }
    return await res.blob();
  }

  async function exportToApkg(cards) {
    try {
      return await buildApkgClientSide(cards);
    } catch (_cdnErr) {
      // Fallback to local server endpoint if sql.js CDN is unreachable (e.g. offline/airgapped)
      return await buildApkgViaServerFallback(cards);
    }
  }

  // =========================================================================
  // 4. Multi-Deck Anki TSV (.txt) Exporter (with #deck column:1 header)
  // =========================================================================

  function exportToAnkiTxt(cards, { embedImagesAsDataUri = false } = {}) {
    const lines = [
      '#separator:tab',
      '#html:true',
      '#notetype:Basic',
      '#deck column:1'
    ];

    const mediaFiles = [];

    cards.forEach((card, idx) => {
      let mediaReference = null;
      if (card.imageDataUrl) {
        if (embedImagesAsDataUri) {
          mediaReference = card.imageDataUrl;
        } else {
          const { u8, ext } = dataUrlToUint8Array(card.imageDataUrl);
          mediaReference = `lexiforge_${card.id}_${idx}.${ext}`;
          mediaFiles.push({ name: mediaReference, data: u8 });
        }
      }

      const { frontHtml, backHtml } = compileAnkiFields(card, mediaReference);
      // Escape tabs/newlines inside TSV fields
      const safeDeck = card.deck.replace(/\t|\r|\n/g, ' ');
      const safeFront = frontHtml.replace(/\t/g, ' ').replace(/\r?\n/g, '<br>');
      const safeBack = backHtml.replace(/\t/g, ' ').replace(/\r?\n/g, '<br>');

      lines.push(`${safeDeck}\t${safeFront}\t${safeBack}`);
    });

    const txtContent = lines.join('\n') + '\n';
    const txtBlob = new Blob([txtContent], { type: 'text/tab-separated-values;charset=utf-8' });

    let mediaZipBlob = null;
    if (mediaFiles.length > 0 && !embedImagesAsDataUri) {
      const zipBytes = createZipUint8Array(mediaFiles);
      mediaZipBlob = new Blob([zipBytes], { type: 'application/zip' });
    }

    return { txtBlob, mediaZipBlob, mediaCount: mediaFiles.length };
  }

  // =========================================================================
  // 5. Direct AnkiConnect Push (Optional Desktop 1-Click Sync)
  // =========================================================================

  async function invokeAnkiConnect(action, params = {}) {
    const response = await fetch('http://127.0.0.1:8765', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, version: 6, params })
    });
    const result = await response.json();
    if (result.error) {
      throw new Error(result.error);
    }
    return result.result;
  }

  async function syncViaAnkiConnect(cards) {
    // 1. Ensure all target decks exist
    const uniqueDecks = [...new Set(cards.map(c => c.deck))];
    for (const deckName of uniqueDecks) {
      await invokeAnkiConnect('createDeck', { deck: deckName });
    }

    // 2. Store media files & add notes
    const notesPayload = [];
    for (let idx = 0; idx < cards.length; idx++) {
      const card = cards[idx];
      let mediaFilename = null;

      if (card.imageDataUrl) {
        const parts = card.imageDataUrl.split(',');
        const ext = parts[0].includes('png') ? 'png' : 'jpg';
        mediaFilename = `lexiforge_${card.id}_${idx}.${ext}`;
        await invokeAnkiConnect('storeMediaFile', {
          filename: mediaFilename,
          data: parts[1]
        });
      }

      const { frontHtml, backHtml } = compileAnkiFields(card, mediaFilename);
      notesPayload.push({
        deckName: card.deck,
        modelName: 'Basic',
        fields: {
          Front: frontHtml,
          Back: backHtml
        },
        options: {
          allowDuplicate: false,
          duplicateScope: 'deck'
        },
        tags: ['lexiforge']
      });
    }

    const addedIds = await invokeAnkiConnect('addNotes', { notes: notesPayload });
    return addedIds;
  }

  global.LexiExporter = {
    DECK_IDS,
    compileAnkiFields,
    exportToApkg,
    exportToAnkiTxt,
    syncViaAnkiConnect
  };
})(window);
