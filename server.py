#!/usr/bin/env python3
"""Local HTTP server + native SQLite .apkg builder for LexiForge Anki Studio."""

import base64
import hashlib
from http.server import HTTPServer, SimpleHTTPRequestHandler
import io
import json
import os
import sqlite3
import sys
import tempfile
import time
import zipfile

DECK_IDS = {
    'français': 1710000001001,
    'italiano': 1710000001002,
    'mandarin (正體字)': 1710000001003,
    'mandarin (簡化字)': 1710000001004,
}

BASIC_MODEL_ID = 1710000002001


def escape_html(text: str) -> str:
  return (
      str(text or '')
      .replace('&', '&amp;')
      .replace('<', '&lt;')
      .replace('>', '&gt;')
      .replace('"', '&quot;')
  )


def compile_anki_fields(card: dict, media_filename: str | None) -> tuple[str, str]:
  word = (card.get('word') or '').strip()
  headword_html = escape_html(word)
  extra_parts = []

  formatted_ctx = (card.get('formattedContext') or '').strip()
  if formatted_ctx:
    ctx_html = escape_html(formatted_ctx).replace('\r\n', '<br>').replace('\n', '<br>')
    extra_parts.append(ctx_html)

  if media_filename:
    extra_parts.append(f'<img src="{escape_html(media_filename)}">')

  front_html = (
      f'{headword_html}<br><br>{"<br><br>".join(extra_parts)}'
      if extra_parts
      else headword_html
  )

  pron = (card.get('pronunciation') or '').strip()
  definition = (card.get('definition') or '').strip()
  back_html = escape_html(f'{word} = {pron} = {definition}')
  return front_html, back_html


def build_apkg_bytes(cards: list[dict]) -> bytes:
  now_sec = int(time.time())
  now_ms = int(time.time() * 1000)

  decks = {
      '1': {
          'id': 1,
          'mod': now_sec,
          'name': 'Default',
          'usn': 0,
          'lrnToday': [0, 0],
          'revToday': [0, 0],
          'newToday': [0, 0],
          'timeToday': [0, 0],
          'collapsed': False,
          'browserCollapsed': False,
          'desc': '',
          'dyn': 0,
          'conf': 1,
          'extendNew': 10,
          'extendRev': 50,
      }
  }
  for deck_name, deck_id in DECK_IDS.items():
    decks[str(deck_id)] = {
        'id': deck_id,
        'mod': now_sec,
        'name': deck_name,
        'usn': -1,
        'lrnToday': [0, 0],
        'revToday': [0, 0],
        'newToday': [0, 0],
        'timeToday': [0, 0],
        'collapsed': False,
        'browserCollapsed': False,
        'desc': f'Merged from LexiForge Anki Studio ({deck_name})',
        'dyn': 0,
        'conf': 1,
        'extendNew': 10,
        'extendRev': 50,
    }

  models = {
      str(BASIC_MODEL_ID): {
          'id': BASIC_MODEL_ID,
          'name': 'Basic',
          'type': 0,
          'mod': now_sec,
          'usn': -1,
          'sortf': 0,
          'did': 1,
          'tmpls': [{
              'name': 'Card 1',
              'ord': 0,
              'qfmt': '{{Front}}',
              'afmt': '{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}',
              'bqfmt': '',
              'bafmt': '',
              'did': None,
              'bfont': '',
              'bsize': 0,
          }],
          'flds': [
              {
                  'name': 'Front',
                  'ord': 0,
                  'sticky': False,
                  'rtl': False,
                  'font': 'Arial',
                  'size': 20,
                  'media': [],
              },
              {
                  'name': 'Back',
                  'ord': 1,
                  'sticky': False,
                  'rtl': False,
                  'font': 'Arial',
                  'size': 20,
                  'media': [],
              },
          ],
          'css': (
              '.card {\n font-family: arial;\n font-size: 20px;\n text-align:'
              ' center;\n color: black;\n background-color: white;\n}\nimg {'
              ' max-width: 100%; height: auto; border-radius: 6px; margin-top:'
              ' 8px; }'
          ),
          'latexPre': '',
          'latexPost': '',
          'latexsvg': False,
          'req': [[0, 'any', [0]]],
          'tags': [],
          'vers': [],
      }
  }

  conf = {
      'nextPos': 1,
      'estTimes': True,
      'activeDecks': [1],
      'sortType': 'noteFld',
      'timeLim': 0,
      'sortBackwards': False,
      'addToCur': True,
      'curDeck': 1,
      'newBury': True,
      'newSpread': 0,
      'dueCounts': True,
      'curModel': str(BASIC_MODEL_ID),
      'collapseTime': 1200,
  }

  dconf = {
      '1': {
          'id': 1,
          'mod': 0,
          'name': 'Default',
          'usn': 0,
          'maxTaken': 60,
          'autoplay': True,
          'timer': 0,
          'replayq': True,
          'new': {
              'bury': False,
              'delays': [1, 10],
              'initialFactor': 2500,
              'ints': [1, 4, 7],
              'order': 1,
              'perDay': 20,
          },
          'rev': {
              'bury': False,
              'ease4': 1.3,
              'ivlFct': 1,
              'maxIvl': 36500,
              'perDay': 200,
              'hardFactor': 1.2,
          },
          'lapse': {
              'delays': [10],
              'leechAction': 1,
              'leechFails': 8,
              'minInt': 1,
              'mult': 0,
          },
      }
  }

  with tempfile.NamedTemporaryFile(suffix='.anki2', delete=False) as tmp_db:
    db_path = tmp_db.name

  try:
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.executescript("""
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
    """)

    cur.execute(
        'INSERT INTO col VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        (
            1,
            now_sec,
            now_ms,
            now_ms,
            11,
            0,
            0,
            0,
            json.dumps(conf),
            json.dumps(models),
            json.dumps(decks, ensure_ascii=False),
            json.dumps(dconf),
            '{}',
        ),
    )

    media_manifest = {}
    media_blobs = {}
    media_idx = 0

    for idx, card in enumerate(cards):
      media_filename = None
      img_data_url = card.get('imageDataUrl')
      if img_data_url and ',' in img_data_url:
        header, b64_data = img_data_url.split(',', 1)
        ext = 'png' if 'png' in header else 'jpg'
        media_filename = f"lexiforge_{card.get('id', idx)}_{idx}.{ext}"
        key = str(media_idx)
        media_idx += 1
        media_manifest[key] = media_filename
        media_blobs[key] = base64.b64decode(b64_data)

      front_html, back_html = compile_anki_fields(card, media_filename)
      note_id = now_ms + idx * 10 + 1
      card_id = now_ms + idx * 10 + 2
      deck_name = card.get('deck', 'français')
      deck_id = DECK_IDS.get(deck_name, DECK_IDS['français'])
      word = (card.get('word') or '').strip()
      guid_seed = f"{deck_name}::{word}::{card.get('id', idx)}"
      guid = hashlib.sha1(guid_seed.encode('utf-8')).hexdigest()[:10]
      flds = f'{front_html}\x1f{back_html}'
      csum = int(hashlib.sha1(word.encode('utf-8')).hexdigest()[:8], 16)

      cur.execute(
          'INSERT INTO notes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          (
              note_id,
              guid,
              BASIC_MODEL_ID,
              now_sec,
              -1,
              ' lexiforge ',
              flds,
              word,
              csum,
              0,
              '',
          ),
      )

      cur.execute(
          'INSERT INTO cards VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          (
              card_id,
              note_id,
              deck_id,
              0,
              now_sec,
              -1,
              0,
              0,
              idx + 1,
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              '',
          ),
      )

    conn.commit()
    conn.close()

    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
      zf.write(db_path, arcname='collection.anki2')
      zf.writestr('media', json.dumps(media_manifest, ensure_ascii=False))
      for key, raw_bytes in media_blobs.items():
        zf.writestr(key, raw_bytes)

    return zip_buf.getvalue()
  finally:
    if os.path.exists(db_path):
      os.remove(db_path)


class LexiForgeHandler(SimpleHTTPRequestHandler):

  def do_POST(self):
    if self.path == '/api/export-apkg':
      length = int(self.headers.get('Content-Length', '0'))
      body = self.rfile.read(length)
      payload = json.loads(body.decode('utf-8'))
      cards = payload.get('cards', [])
      apkg_bytes = build_apkg_bytes(cards)
      self.send_response(200)
      self.send_header('Content-Type', 'application/octet-stream')
      self.send_header('Content-Length', str(len(apkg_bytes)))
      self.end_headers()
      self.wfile.write(apkg_bytes)
      return
    self.send_error(404, 'Not Found')


if __name__ == '__main__':
  port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
  os.chdir(os.path.dirname(os.path.abspath(__file__)))
  server = HTTPServer(('0.0.0.0', port), LexiForgeHandler)
  print(f'LexiForge Anki Studio running at http://localhost:{port}')
  server.serve_forever()
