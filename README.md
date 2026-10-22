# LexiForge Anki Studio

A static Progressive Web App (PWA) for creating and exporting Anki flashcards that merge directly into your existing decks:
- `français`
- `italiano`
- `mandarin (正體字)`
- `mandarin (簡化字)`

## Card Formatting Specifications

### Front of the Card
- **Line 1:** The target word or phrase being learned (`[A]`).
- **Two lines down (`<br><br>`):** The context text and/or context image.
  - When context text is included, every occurrence of the target word/phrase is automatically surrounded by `**` (for example, `arbre de noël` becomes `**arbre de noël**`).

### Back of the Card
- Formatted as `[A] = [B] = [C]` where:
  - `[A]` = Target word or phrase
  - `[B]` = Pronunciation (`IPA` for `français` and `italiano`; `Zhuyin / 注音符號` for `mandarin (正體字)` and `mandarin (簡化字)`)
  - `[C]` = Very concise definition (in **French** for `français`, in **Italian** for `italiano`, or in **English** for `mandarin (正體字)` and `mandarin (簡化字)`)

## Running Locally

```bash
python3 server.py 8080
```
Then open `http://localhost:8080`.

## Free Internet Hosting (Desktop & Android Mobile)

Because the app is a self-contained static PWA using IndexedDB storage and client-side `.apkg` / `.txt` generation, you can host it for free on any static host:

1. **Netlify Drop (30 seconds, no CLI required):**
   - Drag and drop the `anki-card-studio` folder onto `https://app.netlify.com/drop`.
2. **GitHub Pages:**
   - Push this folder to a GitHub repository and enable **Settings → Pages** (`main` branch).
3. **Cloudflare Pages / Vercel:**
   - Connect your GitHub repo or upload the folder as a static site.

### Installing on Android
Open your hosted URL in Chrome on Android and tap **⋮ → Add to Home screen / Install app**. When you export an `.apkg` file on Android, tapping the downloaded file opens **AnkiDroid** and automatically merges the new cards (and embedded images) into your existing `français`, `italiano`, `mandarin (正體字)`, and `mandarin (簡化字)` decks.
