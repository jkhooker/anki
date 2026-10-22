/**
 * LexiForge Anki Studio — Main Application Controller
 * Handles:
 * - IndexedDB persistence for cards & images
 * - Smart **phrase** context highlighting (Unicode & CJK safe)
 * - Auto-generation of [B] (IPA / Zhuyin) & [C] (Concise FR/IT/EN definition)
 * - Live Front & Back Anki card preview
 * - Multi-deck export (.apkg & .txt) + duplicate prevention & batch clearing
 */

(function () {
  'use strict';

  // =========================================================================
  // 1. Constants & Deck Specifications
  // =========================================================================

  const DECKS = {
    'français': {
      name: 'français',
      pronLabel: 'IPA (français)',
      pronPlaceholder: 'ex: aʁbʁ də nɔ.ɛl',
      defLabel: 'Définition concise (en français)',
      defPlaceholder: 'ex: sapin décoré pour célébrer la fête de Noël',
      wordPlaceholder: 'ex: arbre de noël',
      contextPlaceholder: 'ex: Nous avons installé un bel arbre de noël près de la fenêtre.',
      chips: ['ɑ̃', 'ɛ̃', 'ɔ̃', 'œ̃', 'ʁ', 'ʃ', 'ʒ', 'ɲ', 'ɥ', 'ə', 'ɛ', 'ɔ', 'ø', 'œ', 'y']
    },
    'italiano': {
      name: 'italiano',
      pronLabel: 'IPA (italiano)',
      pronPlaceholder: 'es: pas.sedˈdʒa.ta',
      defLabel: 'Definizione concisa (in italiano)',
      defPlaceholder: 'es: breve camminata fatta per svago o riposo',
      wordPlaceholder: 'es: passeggiata',
      contextPlaceholder: 'es: Facciamo una bella passeggiata lungo il fiume prima di cena.',
      chips: ['ˈ', 'ˌ', 'ʎ', 'ɲ', 'ʃ', 'tʃ', 'dʒ', 'ts', 'dz', 'ɛ', 'ɔ']
    },
    'mandarin (正體字)': {
      name: 'mandarin (正體字)',
      pronLabel: 'Zhuyin / 注音符號 (或輸入拼音自動轉換)',
      pronPlaceholder: '例: ㄨㄟˋ ㄩˇ ㄔㄡˊ ㄇㄡˊ (or type Pinyin: wei4 yu3 chou2 mou2)',
      defLabel: 'Concise Definition (in English)',
      defPlaceholder: 'e.g. to prepare ahead before trouble happens',
      wordPlaceholder: '例: 未雨綢繆',
      contextPlaceholder: '例: 面對未知的挑戰，我們應該未雨綢繆，提早做好準備。',
      chips: ['ˊ', 'ˇ', 'ˋ', '˙', 'ㄅ', 'ㄆ', 'ㄇ', 'ㄈ', 'ㄉ', 'ㄊ', 'ㄋ', 'ㄌ', 'ㄍ', 'ㄎ', 'ㄏ', 'ㄐ', 'ㄑ', 'ㄒ', 'ㄓ', 'ㄔ', 'ㄕ', 'ㄖ', 'ㄗ', 'ㄘ', 'ㄙ', 'ㄧ', 'ㄨ', 'ㄩ']
    },
    'mandarin (簡化字)': {
      name: 'mandarin (簡化字)',
      pronLabel: 'Zhuyin / 注音符号 (或输入拼音自动转换)',
      pronPlaceholder: '例: ㄕㄥˋ ㄉㄢˋ ㄕㄨˋ (or type Pinyin: sheng4 dan4 shu4)',
      defLabel: 'Concise Definition (in English)',
      defPlaceholder: 'e.g. Christmas tree',
      wordPlaceholder: '例: 圣诞树',
      contextPlaceholder: '例: 客厅的角落里摆放着一棵闪闪发光的圣诞树。',
      chips: ['ˊ', 'ˇ', 'ˋ', '˙', 'ㄅ', 'ㄆ', 'ㄇ', 'ㄈ', 'ㄉ', 'ㄊ', 'ㄋ', 'ㄌ', 'ㄍ', 'ㄎ', 'ㄏ', 'ㄐ', 'ㄑ', 'ㄒ', 'ㄓ', 'ㄔ', 'ㄕ', 'ㄖ', 'ㄗ', 'ㄘ', 'ㄙ', 'ㄧ', 'ㄨ', 'ㄩ']
    }
  };

  // =========================================================================
  // 2. IndexedDB Storage Layer
  // =========================================================================

  const DB_NAME = 'lexiforge_anki_studio_db';
  const DB_VERSION = 1;
  const STORE_CARDS = 'cards';

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_CARDS)) {
          const store = db.createObjectStore(STORE_CARDS, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt', { unique: false });
          store.createIndex('deck', 'deck', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function dbGetAllCards() {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CARDS, 'readonly');
      const store = tx.objectStore(STORE_CARDS);
      const req = store.getAll();
      req.onsuccess = () => {
        const list = req.result || [];
        list.sort((a, b) => b.createdAt - a.createdAt);
        resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async function dbPutCard(card) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CARDS, 'readwrite');
      tx.objectStore(STORE_CARDS).put(card);
      tx.oncomplete = () => resolve(card);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function dbDeleteCard(id) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CARDS, 'readwrite');
      tx.objectStore(STORE_CARDS).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function dbClearCards(onlyExported = false) {
    const all = await dbGetAllCards();
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CARDS, 'readwrite');
      const store = tx.objectStore(STORE_CARDS);
      if (!onlyExported) {
        store.clear();
      } else {
        for (const c of all) {
          if (c.exported) {
            store.delete(c.id);
          }
        }
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // =========================================================================
  // 3. Smart Context **Word or Phrase** Highlighter
  // =========================================================================

  function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Surrounds all occurrences of `word` in `rawContext` with `**`
   * Example: word = "arbre de noël", context = "Un bel arbre de noël illuminé."
   * Result: "Un bel **arbre de noël** illuminé."
   */
  function formatContextWithAsterisks(word, rawContext) {
    if (!rawContext || !rawContext.trim()) {
      return { formatted: '', matched: false, hasManualAsterisks: false };
    }
    const text = rawContext.trim();
    const cleanWord = (word || '').trim();

    if (!cleanWord) {
      const hasManual = /\*\*[^*]+\*\*/.test(text);
      return { formatted: text, matched: hasManual, hasManualAsterisks: hasManual };
    }

    // Temporarily strip existing ** around the exact target phrase to prevent ****double**** wrapping
    const escaped = escapeRegExp(cleanWord);
    const unWrapRegex = new RegExp(`\\*\\*(${escaped})\\*\\*`, 'gi');
    const normalizedText = text.replace(unWrapRegex, '$1');

    const matchRegex = new RegExp(`(${escaped})`, 'gi');
    let matchFound = false;
    const replaced = normalizedText.replace(matchRegex, (m) => {
      matchFound = true;
      return `**${m}**`;
    });

    const hasManualAsterisks = /\*\*[^*]+\*\*/.test(replaced);
    return {
      formatted: replaced,
      matched: matchFound || hasManualAsterisks,
      hasManualAsterisks
    };
  }

  // =========================================================================
  // 4. Image Compression Helper (Keeps Anki Decks Fast on Mobile & Desktop)
  // =========================================================================

  function compressImageToDataUrl(fileOrBlob, maxDim = 900, quality = 0.84) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            if (width >= height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          const outDataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve({
            dataUrl: outDataUrl,
            width,
            height,
            byteSize: Math.round((outDataUrl.length * 3) / 4)
          });
        };
        img.onerror = () => reject(new Error('Invalid image file'));
        img.src = ev.target.result;
      };
      reader.onerror = () => reject(new Error('Could not read file'));
      reader.readAsDataURL(fileOrBlob);
    });
  }

  async function fetchSampleImageAsDataUrl(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const blob = await res.blob();
      const compressed = await compressImageToDataUrl(blob, 760, 0.82);
      return compressed.dataUrl;
    } catch (_e) {
      return null;
    }
  }

  // =========================================================================
  // 5. Application State
  // =========================================================================

  const state = {
    selectedDeck: 'français',
    activeFilterDeck: 'ALL',
    editingCardId: null,
    currentImage: null, // { dataUrl, name, sizeBytes }
    cards: [],
    lookupInProgress: false,
    lastLookupSource: '',
    settings: {
      geminiApiKey: localStorage.getItem('lexiforge_gemini_key') || '',
      autoClearAfterExport: localStorage.getItem('lexiforge_auto_clear') === 'true',
      exportScope: 'unexported', // 'unexported' | 'all'
      exportFormat: 'apkg',      // 'apkg' | 'txt'
      theme: localStorage.getItem('lexiforge_theme') || 'light'
    }
  };

  // =========================================================================
  // 6. DOM References & Initialization
  // =========================================================================

  const dom = {};

  function bindDomElements() {
    dom.deckButtons = document.querySelectorAll('.deck-option-btn');
    dom.wordInput = document.getElementById('input-word');
    dom.contextInput = document.getElementById('input-context');
    dom.pronInput = document.getElementById('input-pronunciation');
    dom.defInput = document.getElementById('input-definition');
    dom.pronLabel = document.getElementById('label-pronunciation');
    dom.defLabel = document.getElementById('label-definition');
    dom.lookupSourceBadge = document.getElementById('lookup-source-badge');

    dom.btnAutoGenerate = document.getElementById('btn-auto-generate');
    dom.btnConvertPinyin = document.getElementById('btn-convert-pinyin');
    dom.btnWrapSelection = document.getElementById('btn-wrap-asterisk');
    dom.contextMatchPill = document.getElementById('context-match-status');
    dom.phoneticChipsBar = document.getElementById('phonetic-chips-bar');

    dom.imageDropzone = document.getElementById('image-dropzone');
    dom.imageFileInput = document.getElementById('input-image-file');
    dom.btnChooseImage = document.getElementById('btn-choose-image');
    dom.btnPasteImage = document.getElementById('btn-paste-image');
    dom.imagePreviewContainer = document.getElementById('image-preview-container');
    dom.imagePreviewThumb = document.getElementById('image-preview-thumb');
    dom.imagePreviewName = document.getElementById('image-preview-name');
    dom.imagePreviewSize = document.getElementById('image-preview-size');
    dom.btnRemoveImage = document.getElementById('btn-remove-image');

    dom.previewDeckBadge = document.getElementById('preview-deck-badge');
    dom.previewFrontHeadword = document.getElementById('preview-front-headword');
    dom.previewFrontBody = document.getElementById('preview-front-body');
    dom.previewFrontImage = document.getElementById('preview-front-image');
    dom.previewBackFormula = document.getElementById('preview-back-formula');

    dom.btnSaveCard = document.getElementById('btn-save-card');
    dom.btnCancelEdit = document.getElementById('btn-cancel-edit');
    dom.duplicateWarning = document.getElementById('duplicate-warning-banner');

    dom.statTotalCount = document.getElementById('stat-total-count');
    dom.statNewCount = document.getElementById('stat-new-count');
    dom.btnOpenExportModal = document.getElementById('btn-open-export-modal');
    dom.btnQuickExportNew = document.getElementById('btn-quick-export-new');
    dom.btnClearExported = document.getElementById('btn-clear-exported');
    dom.btnClearAll = document.getElementById('btn-clear-all');

    dom.filterTabs = document.querySelectorAll('.filter-tab');
    dom.cardsListContainer = document.getElementById('cards-list-container');

    // Modals
    dom.exportModal = document.getElementById('modal-export');
    dom.btnCloseExportModal = document.getElementById('btn-close-export-modal');
    dom.btnConfirmExport = document.getElementById('btn-confirm-export');
    dom.btnAnkiConnectSync = document.getElementById('btn-ankiconnect-sync');
    dom.chkAutoClearExport = document.getElementById('chk-auto-clear-export');
    dom.exportSummaryText = document.getElementById('export-summary-text');

    dom.hostingModal = document.getElementById('modal-hosting');
    dom.btnOpenHostingModal = document.getElementById('btn-open-hosting');
    dom.btnCloseHostingModal = document.getElementById('btn-close-hosting-modal');

    dom.settingsModal = document.getElementById('modal-settings');
    dom.btnOpenSettingsModal = document.getElementById('btn-open-settings');
    dom.btnCloseSettingsModal = document.getElementById('btn-close-settings-modal');
    dom.btnSaveSettings = document.getElementById('btn-save-settings');
    dom.inputGeminiKey = document.getElementById('input-gemini-key');

    dom.btnThemeToggle = document.getElementById('btn-theme-toggle');
    dom.toastContainer = document.getElementById('toast-container');
  }

  function showToast(message) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    dom.toastContainer.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 200ms ease';
      setTimeout(() => el.remove(), 220);
    }, 3200);
  }

  // =========================================================================
  // 7. Deck Selection & Live Preview Rendering
  // =========================================================================

  function selectDeck(deckName) {
    if (!DECKS[deckName]) return;
    state.selectedDeck = deckName;

    dom.deckButtons.forEach((btn) => {
      const isSelected = btn.getAttribute('data-deck') === deckName;
      btn.classList.toggle('active', isSelected);
      btn.setAttribute('aria-pressed', String(isSelected));
    });

    const spec = DECKS[deckName];
    dom.pronLabel.textContent = `[B] ${spec.pronLabel}`;
    dom.pronInput.placeholder = spec.pronPlaceholder;
    dom.defLabel.textContent = `[C] ${spec.defLabel}`;
    dom.defInput.placeholder = spec.defPlaceholder;
    dom.wordInput.placeholder = spec.wordPlaceholder;
    dom.contextInput.placeholder = spec.contextPlaceholder;

    // Show Pinyin -> Zhuyin helper button for Mandarin decks
    const isMandarin = deckName.startsWith('mandarin');
    dom.btnConvertPinyin.style.display = isMandarin ? 'inline-flex' : 'none';

    // Render phonetic symbol helper chips
    dom.phoneticChipsBar.innerHTML = '';
    spec.chips.forEach((sym) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'symbol-chip';
      chip.textContent = sym;
      chip.title = `Insert ${sym}`;
      chip.addEventListener('click', () => {
        insertAtCursor(dom.pronInput, sym);
        updateLivePreview();
      });
      dom.phoneticChipsBar.appendChild(chip);
    });

    updateLivePreview();
  }

  function insertAtCursor(inputEl, textToInsert) {
    const start = inputEl.selectionStart ?? inputEl.value.length;
    const end = inputEl.selectionEnd ?? inputEl.value.length;
    const val = inputEl.value;
    inputEl.value = val.slice(0, start) + textToInsert + val.slice(end);
    inputEl.focus();
    const newPos = start + textToInsert.length;
    inputEl.setSelectionRange(newPos, newPos);
  }

  function renderHighlightedPreviewDom(container, formattedText) {
    container.innerHTML = '';
    if (!formattedText) return;

    // Split on **...** so we show the literal **...** visibly highlighted
    const parts = formattedText.split(/(\*\*[^*]+\*\*)/g);
    for (const part of parts) {
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        const span = document.createElement('span');
        span.className = 'anki-asterisk-highlight';
        span.textContent = part;
        container.appendChild(span);
      } else {
        container.appendChild(document.createTextNode(part));
      }
    }
  }

  function checkDuplicateWord(word, deck) {
    const clean = (word || '').trim().toLowerCase();
    if (!clean) return null;
    return state.cards.find(
      (c) =>
        c.id !== state.editingCardId &&
        c.deck === deck &&
        c.word.trim().toLowerCase() === clean
    );
  }

  function updateLivePreview() {
    const word = dom.wordInput.value.trim();
    const rawContext = dom.contextInput.value;
    const pron = dom.pronInput.value.trim();
    const def = dom.defInput.value.trim();

    // Update deck badge on preview
    dom.previewDeckBadge.textContent = state.selectedDeck;
    dom.previewDeckBadge.setAttribute('data-deck', state.selectedDeck);

    // Check duplicate warning
    const existingDup = checkDuplicateWord(word, state.selectedDeck);
    if (existingDup) {
      dom.duplicateWarning.style.display = 'flex';
      dom.duplicateWarning.textContent = `Note: "${word}" already exists in your ${state.selectedDeck} queue (${existingDup.exported ? 'already exported' : 'unexported'}).`;
    } else {
      dom.duplicateWarning.style.display = 'none';
    }

    // Format context text with **...**
    const { formatted, matched } = formatContextWithAsterisks(word, rawContext);

    if (!rawContext.trim()) {
      dom.contextMatchPill.style.display = 'none';
    } else {
      dom.contextMatchPill.style.display = 'inline-flex';
      if (matched) {
        dom.contextMatchPill.className = 'context-match-pill matched';
        dom.contextMatchPill.textContent = '✓ Surrounded target phrase with **...**';
      } else {
        dom.contextMatchPill.className = 'context-match-pill unmatched';
        dom.contextMatchPill.textContent = 'Inflected in context? Select word & click "** Wrap Selection"';
      }
    }

    // Render Front Preview:
    // Line 1: Word/Phrase
    // Two lines down (\n\n): Context text (with **phrase**) and/or Image
    dom.previewFrontHeadword.textContent = word || 'arbre de noël';

    if (formatted) {
      dom.previewFrontBody.style.display = 'block';
      renderHighlightedPreviewDom(dom.previewFrontBody, `\n${formatted}`);
    } else if (!word && !state.currentImage) {
      dom.previewFrontBody.style.display = 'block';
      renderHighlightedPreviewDom(
        dom.previewFrontBody,
        '\nNous avons installé un bel **arbre de noël** dans le salon.'
      );
    } else {
      dom.previewFrontBody.style.display = 'none';
      dom.previewFrontBody.textContent = '';
    }

    if (state.currentImage && state.currentImage.dataUrl) {
      dom.previewFrontImage.src = state.currentImage.dataUrl;
      dom.previewFrontImage.style.display = 'block';
    } else {
      dom.previewFrontImage.style.display = 'none';
      dom.previewFrontImage.removeAttribute('src');
    }

    // Render Back Preview: [A] = [B] = [C]
    const dispA = word || (state.selectedDeck === 'français' ? 'arbre de noël' : '[A]');
    const dispB = pron || (state.selectedDeck === 'français' ? 'aʁbʁ də nɔ.ɛl' : '[B]');
    const dispC = def || (state.selectedDeck === 'français' ? 'sapin décoré pour célébrer la fête de Noël' : '[C]');
    dom.previewBackFormula.textContent = `${dispA} = ${dispB} = ${dispC}`;
  }

  // =========================================================================
  // 8. Auto-Lookup for [B] Pronunciation & [C] Concise Definition
  // =========================================================================

  async function triggerAutoLookup({ overwriteExisting = true } = {}) {
    const word = dom.wordInput.value.trim();
    if (!word) {
      showToast('Please enter a word or phrase first.');
      dom.wordInput.focus();
      return;
    }

    state.lookupInProgress = true;
    dom.btnAutoGenerate.disabled = true;
    dom.lookupSourceBadge.textContent = 'Looking up [B] & [C]…';

    try {
      const res = await window.LexiPhonetics.generatePronunciationAndDefinition({
        word,
        contextText: dom.contextInput.value.trim(),
        deck: state.selectedDeck,
        apiKey: state.settings.geminiApiKey
      });

      if (res.pronunciation && (overwriteExisting || !dom.pronInput.value.trim())) {
        dom.pronInput.value = res.pronunciation;
      }
      if (res.definition && (overwriteExisting || !dom.defInput.value.trim())) {
        dom.defInput.value = res.definition;
      }

      dom.lookupSourceBadge.textContent = res.source
        ? `Auto-filled via ${res.source}`
        : 'Ready';
      updateLivePreview();
    } catch (_err) {
      dom.lookupSourceBadge.textContent = 'Manual entry mode';
    } finally {
      state.lookupInProgress = false;
      dom.btnAutoGenerate.disabled = false;
    }
  }

  // =========================================================================
  // 9. Card Creation, Editing & Queue Management
  // =========================================================================

  async function handleSaveCard(e) {
    if (e) e.preventDefault();

    const word = dom.wordInput.value.trim();
    if (!word) {
      showToast('Please enter the target word or phrase.');
      dom.wordInput.focus();
      return;
    }

    // If pronunciation or definition is still empty, attempt auto-fill first
    if (!dom.pronInput.value.trim() || !dom.defInput.value.trim()) {
      await triggerAutoLookup({ overwriteExisting: false });
    }

    // For Mandarin decks, ensure any Pinyin typed in [B] is converted to Zhuyin
    if (state.selectedDeck.startsWith('mandarin') && dom.pronInput.value.trim()) {
      dom.pronInput.value = window.LexiPhonetics.pinyinToZhuyin(dom.pronInput.value.trim());
    }

    const pronunciation = dom.pronInput.value.trim() || '—';
    const definition = dom.defInput.value.trim() || '—';
    const rawContext = dom.contextInput.value.trim();
    const { formatted } = formatContextWithAsterisks(word, rawContext);

    const now = Date.now();
    const cardObj = {
      id: state.editingCardId || `card_${now}_${Math.random().toString(36).slice(2, 7)}`,
      deck: state.selectedDeck,
      word,
      rawContext,
      formattedContext: formatted,
      pronunciation,
      definition,
      imageDataUrl: state.currentImage ? state.currentImage.dataUrl : null,
      imageName: state.currentImage ? state.currentImage.name : null,
      exported: false,
      exportedAt: null,
      createdAt: state.editingCardId
        ? (state.cards.find((c) => c.id === state.editingCardId)?.createdAt || now)
        : now,
      updatedAt: now
    };

    await dbPutCard(cardObj);
    state.cards = await dbGetAllCards();

    const wasEditing = Boolean(state.editingCardId);
    resetComposerForm();
    renderQueueAndStats();
    showToast(
      wasEditing
        ? `Updated card "${cardObj.word}" in ${cardObj.deck}`
        : `Added "${cardObj.word}" to ${cardObj.deck}`
    );
  }

  function resetComposerForm() {
    state.editingCardId = null;
    dom.wordInput.value = '';
    dom.contextInput.value = '';
    dom.pronInput.value = '';
    dom.defInput.value = '';
    dom.lookupSourceBadge.textContent = 'Auto-fills on word entry';
    clearSelectedImage();
    dom.btnSaveCard.textContent = 'Add Card to Deck Queue';
    dom.btnCancelEdit.style.display = 'none';
    updateLivePreview();
  }

  function startEditingCard(cardId) {
    const card = state.cards.find((c) => c.id === cardId);
    if (!card) return;

    state.editingCardId = card.id;
    selectDeck(card.deck);
    dom.wordInput.value = card.word;
    dom.contextInput.value = card.rawContext || card.formattedContext || '';
    dom.pronInput.value = card.pronunciation;
    dom.defInput.value = card.definition;

    if (card.imageDataUrl) {
      state.currentImage = {
        dataUrl: card.imageDataUrl,
        name: card.imageName || 'context-image.jpg',
        sizeBytes: Math.round((card.imageDataUrl.length * 3) / 4)
      };
      renderSelectedImagePreview();
    } else {
      clearSelectedImage();
    }

    dom.btnSaveCard.textContent = 'Save Card Changes';
    dom.btnCancelEdit.style.display = 'inline-flex';
    updateLivePreview();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleDeleteCard(cardId) {
    await dbDeleteCard(cardId);
    state.cards = await dbGetAllCards();
    if (state.editingCardId === cardId) {
      resetComposerForm();
    }
    renderQueueAndStats();
    showToast('Card removed from queue.');
  }

  // =========================================================================
  // 10. Image Picker, Drag & Drop, and Clipboard Paste
  // =========================================================================

  async function handleImageFileSelected(file) {
    if (!file || !file.type.startsWith('image/')) {
      showToast('Please select a valid image file (PNG, JPG, WebP).');
      return;
    }
    try {
      const compressed = await compressImageToDataUrl(file);
      state.currentImage = {
        dataUrl: compressed.dataUrl,
        name: file.name || 'context-photo.jpg',
        sizeBytes: compressed.byteSize
      };
      renderSelectedImagePreview();
      updateLivePreview();
    } catch (_err) {
      showToast('Could not process image.');
    }
  }

  function renderSelectedImagePreview() {
    if (!state.currentImage) {
      dom.imagePreviewContainer.style.display = 'none';
      return;
    }
    dom.imagePreviewContainer.style.display = 'flex';
    dom.imagePreviewThumb.src = state.currentImage.dataUrl;
    dom.imagePreviewName.textContent = state.currentImage.name;
    const kb = Math.max(1, Math.round(state.currentImage.sizeBytes / 1024));
    dom.imagePreviewSize.textContent = `${kb} KB (optimized for Anki media)`;
  }

  function clearSelectedImage() {
    state.currentImage = null;
    dom.imageFileInput.value = '';
    dom.imagePreviewContainer.style.display = 'none';
    dom.imagePreviewThumb.removeAttribute('src');
    updateLivePreview();
  }

  // =========================================================================
  // 11. Rendering Queue List & Deck Counts
  // =========================================================================

  function renderQueueAndStats() {
    const total = state.cards.length;
    const unexportedCards = state.cards.filter((c) => !c.exported);
    const exportedCards = state.cards.filter((c) => c.exported);

    dom.statTotalCount.textContent = String(total);
    dom.statNewCount.textContent = String(unexportedCards.length);

    dom.btnQuickExportNew.disabled = total === 0;
    dom.btnOpenExportModal.disabled = total === 0;
    dom.btnClearExported.disabled = exportedCards.length === 0;
    dom.btnClearAll.disabled = total === 0;

    // Update per-deck counts in filter tabs
    dom.filterTabs.forEach((tab) => {
      const deckFilter = tab.getAttribute('data-filter');
      const countSpan = tab.querySelector('.tab-count');
      if (!countSpan) return;
      if (deckFilter === 'ALL') {
        countSpan.textContent = `(${total})`;
      } else {
        const count = state.cards.filter((c) => c.deck === deckFilter).length;
        countSpan.textContent = `(${count})`;
      }
    });

    // Filter cards for display
    const visibleCards = state.activeFilterDeck === 'ALL'
      ? state.cards
      : state.cards.filter((c) => c.deck === state.activeFilterDeck);

    dom.cardsListContainer.innerHTML = '';

    if (visibleCards.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-queue-state';
      empty.innerHTML = `
        <div class="empty-queue-title">No cards in ${state.activeFilterDeck === 'ALL' ? 'your queue yet' : state.activeFilterDeck}</div>
        <p class="empty-queue-desc">Use the composer on the left to create cards for français, italiano, mandarin (正體字), or mandarin (簡化字).</p>
      `;
      const loadSamplesBtn = document.createElement('button');
      loadSamplesBtn.type = 'button';
      loadSamplesBtn.className = 'btn btn-outline btn-sm';
      loadSamplesBtn.textContent = 'Load 4 Sample Cards';
      loadSamplesBtn.addEventListener('click', () => seedSampleCards(true));
      empty.appendChild(loadSamplesBtn);
      dom.cardsListContainer.appendChild(empty);
      return;
    }

    for (const card of visibleCards) {
      const item = document.createElement('article');
      item.className = `card-item ${card.exported ? 'is-exported' : ''}`;

      const topBar = document.createElement('div');
      topBar.className = 'card-item-top';

      const badges = document.createElement('div');
      badges.className = 'card-badges';

      const deckBadge = document.createElement('span');
      deckBadge.className = 'deck-badge';
      deckBadge.setAttribute('data-deck', card.deck);
      deckBadge.textContent = card.deck;

      const statusBadge = document.createElement('span');
      statusBadge.className = `export-state-badge ${card.exported ? 'exported' : 'new'}`;
      statusBadge.textContent = card.exported ? 'Exported' : 'New • Ready to Export';

      badges.append(deckBadge, statusBadge);

      const actions = document.createElement('div');
      actions.className = 'card-item-actions';

      const btnEdit = document.createElement('button');
      btnEdit.type = 'button';
      btnEdit.className = 'btn btn-ghost btn-sm';
      btnEdit.textContent = 'Edit';
      btnEdit.addEventListener('click', () => startEditingCard(card.id));

      const btnDel = document.createElement('button');
      btnDel.type = 'button';
      btnDel.className = 'btn btn-ghost btn-sm';
      btnDel.style.color = 'var(--status-danger-text)';
      btnDel.textContent = 'Delete';
      btnDel.addEventListener('click', () => handleDeleteCard(card.id));

      actions.append(btnEdit, btnDel);
      topBar.append(badges, actions);

      // Front summary
      const frontRow = document.createElement('div');
      frontRow.className = 'card-item-front';

      const frontTextCol = document.createElement('div');
      frontTextCol.className = 'card-item-front-text';

      const wordEl = document.createElement('div');
      wordEl.className = 'card-item-word';
      wordEl.textContent = card.word;
      frontTextCol.appendChild(wordEl);

      if (card.formattedContext) {
        const ctxEl = document.createElement('div');
        ctxEl.className = 'card-item-context';
        renderHighlightedPreviewDom(ctxEl, card.formattedContext);
        frontTextCol.appendChild(ctxEl);
      }

      frontRow.appendChild(frontTextCol);

      if (card.imageDataUrl) {
        const thumb = document.createElement('img');
        thumb.className = 'card-item-thumb';
        thumb.src = card.imageDataUrl;
        thumb.alt = `Context for ${card.word}`;
        frontRow.appendChild(thumb);
      }

      // Back formula summary: [A] = [B] = [C]
      const backRow = document.createElement('div');
      backRow.className = 'card-item-back';
      backRow.textContent = `${card.word} = ${card.pronunciation} = ${card.definition}`;

      item.append(topBar, frontRow, backRow);
      dom.cardsListContainer.appendChild(item);
    }
  }

  // =========================================================================
  // 12. Export & Merge Workflow + Duplicate Prevention
  // =========================================================================

  function getCardsForExportScope(scope) {
    if (scope === 'unexported') {
      const unexported = state.cards.filter((c) => !c.exported);
      return unexported.length > 0 ? unexported : state.cards;
    }
    return state.cards;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 500);
  }

  async function markCardsAsExported(exportedCards) {
    const now = Date.now();
    if (state.settings.autoClearAfterExport) {
      for (const c of exportedCards) {
        await dbDeleteCard(c.id);
      }
    } else {
      for (const c of exportedCards) {
        c.exported = true;
        c.exportedAt = now;
        await dbPutCard(c);
      }
    }
    state.cards = await dbGetAllCards();
    renderQueueAndStats();
  }

  async function executeExport({ scope, format }) {
    const targetCards = getCardsForExportScope(scope);
    if (!targetCards.length) {
      showToast('No cards to export.');
      return;
    }

    const dateStamp = new Date().toISOString().slice(0, 10);

    try {
      if (format === 'apkg') {
        showToast(`Packaging ${targetCards.length} card(s) into Anki .apkg…`);
        const apkgBlob = await window.LexiExporter.exportToApkg(targetCards);
        downloadBlob(apkgBlob, `anki_cards_merge_${dateStamp}.apkg`);
        await markCardsAsExported(targetCards);
        dom.exportModal.classList.remove('open');
        showToast(
          state.settings.autoClearAfterExport
            ? `Exported ${targetCards.length} card(s) (.apkg) and cleared exported batch!`
            : `Exported ${targetCards.length} card(s) (.apkg) — marked as exported to prevent duplicates!`
        );
      } else {
        const { txtBlob, mediaZipBlob, mediaCount } = window.LexiExporter.exportToAnkiTxt(targetCards);
        downloadBlob(txtBlob, `anki_cards_merge_${dateStamp}.txt`);
        if (mediaZipBlob) {
          setTimeout(() => {
            downloadBlob(mediaZipBlob, `anki_media_${dateStamp}.zip`);
          }, 350);
        }
        await markCardsAsExported(targetCards);
        dom.exportModal.classList.remove('open');
        showToast(
          mediaCount > 0
            ? `Exported ${targetCards.length} card(s) (.txt + ${mediaCount} media image zip)!`
            : `Exported ${targetCards.length} card(s) (.txt with #deck column:1)!`
        );
      }
    } catch (err) {
      showToast(`Export error: ${err.message || err}`);
    }
  }

  function updateExportModalSummary() {
    const scopeRadio = document.querySelector('input[name="export-scope"]:checked');
    const formatRadio = document.querySelector('input[name="export-format"]:checked');
    state.settings.exportScope = scopeRadio ? scopeRadio.value : 'unexported';
    state.settings.exportFormat = formatRadio ? formatRadio.value : 'apkg';

    const unexportedCount = state.cards.filter((c) => !c.exported).length;
    const targetCards = getCardsForExportScope(state.settings.exportScope);
    const deckBreakdown = {};
    for (const c of targetCards) {
      deckBreakdown[c.deck] = (deckBreakdown[c.deck] || 0) + 1;
    }
    const breakdownStr = Object.entries(deckBreakdown)
      .map(([d, n]) => `${d}: ${n}`)
      .join(' • ');

    if (state.settings.exportScope === 'unexported' && unexportedCount === 0 && state.cards.length > 0) {
      dom.exportSummaryText.textContent = `All ${state.cards.length} card(s) were already exported earlier. Exporting will re-export all ${state.cards.length} card(s) (${breakdownStr}).`;
    } else {
      dom.exportSummaryText.textContent = `Ready to export ${targetCards.length} card(s) (${breakdownStr || 'none'}). Decks will automatically merge into your existing Anki decks with the exact same names.`;
    }
  }

  // =========================================================================
  // 13. Starter Sample Cards (Demonstrates All 4 Decks + "arbre de noël")
  // =========================================================================

  async function seedSampleCards(force = false) {
    if (!force && localStorage.getItem('lexiforge_seeded_v1') === 'true') {
      return;
    }

    const sampleImgDataUrl = await fetchSampleImageAsDataUrl('sample-arbre-de-noel.jpg');
    const now = Date.now();

    const samples = [
      {
        id: 'sample_fr_arbre',
        deck: 'français',
        word: 'arbre de noël',
        rawContext: 'Nous avons décoré un bel arbre de noël près de la fenêtre du salon.',
        formattedContext: 'Nous avons décoré un bel **arbre de noël** près de la fenêtre du salon.',
        pronunciation: 'aʁbʁ də nɔ.ɛl',
        definition: 'sapin décoré pour célébrer la fête de Noël',
        imageDataUrl: sampleImgDataUrl,
        imageName: 'sample-arbre-de-noel.jpg',
        exported: false,
        exportedAt: null,
        createdAt: now + 40
      },
      {
        id: 'sample_it_passeggiata',
        deck: 'italiano',
        word: 'passeggiata',
        rawContext: 'Ogni sera facciamo una tranquilla passeggiata nel centro storico.',
        formattedContext: 'Ogni sera facciamo una tranquilla **passeggiata** nel centro storico.',
        pronunciation: 'pas.sedˈdʒa.ta',
        definition: 'breve camminata fatta per svago o riposo',
        imageDataUrl: null,
        imageName: null,
        exported: false,
        exportedAt: null,
        createdAt: now + 30
      },
      {
        id: 'sample_zh_trad',
        deck: 'mandarin (正體字)',
        word: '未雨綢繆',
        rawContext: '面對未來的變化，我們應該未雨綢繆，提前做好規劃。',
        formattedContext: '面對未來的變化，我們應該**未雨綢繆**，提前做好規劃。',
        pronunciation: 'ㄨㄟˋ ㄩˇ ㄔㄡˊ ㄇㄡˊ',
        definition: 'to prepare ahead before trouble arises',
        imageDataUrl: null,
        imageName: null,
        exported: false,
        exportedAt: null,
        createdAt: now + 20
      },
      {
        id: 'sample_zh_simp',
        deck: 'mandarin (簡化字)',
        word: '车水马龙',
        rawContext: '傍晚时分，市中心的街道上总是车水马龙，热闹非凡。',
        formattedContext: '傍晚时分，市中心的街道上总是**车水马龙**，热闹非凡。',
        pronunciation: 'ㄔㄜ ㄕㄨㄟˇ ㄇㄚˇ ㄌㄨㄥˊ',
        definition: 'heavy, bustling traffic of vehicles and people',
        imageDataUrl: null,
        imageName: null,
        exported: false,
        exportedAt: null,
        createdAt: now + 10
      }
    ];

    for (const s of samples) {
      await dbPutCard(s);
    }
    localStorage.setItem('lexiforge_seeded_v1', 'true');
    state.cards = await dbGetAllCards();
    renderQueueAndStats();
    if (force) {
      showToast('Loaded 4 sample cards across all 4 decks.');
    }
  }

  // =========================================================================
  // 14. Event Listeners & Lifecycle
  // =========================================================================

  function applyTheme(theme) {
    state.settings.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('lexiforge_theme', theme);
    if (dom.btnThemeToggle) {
      dom.btnThemeToggle.textContent = theme === 'dark' ? '☀ Light' : '☾ Dark';
    }
  }

  function setupEventListeners() {
    // Deck selection buttons
    dom.deckButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const deck = btn.getAttribute('data-deck');
        selectDeck(deck);
        if (dom.wordInput.value.trim()) {
          triggerAutoLookup({ overwriteExisting: true });
        }
      });
    });

    // Debounced auto-lookup when typing word/phrase
    let wordDebounceTimer = null;
    dom.wordInput.addEventListener('input', () => {
      updateLivePreview();
      clearTimeout(wordDebounceTimer);
      const val = dom.wordInput.value.trim();
      if (val.length >= 2) {
        wordDebounceTimer = setTimeout(() => {
          triggerAutoLookup({ overwriteExisting: true });
        }, 520);
      }
    });

    dom.contextInput.addEventListener('input', updateLivePreview);
    dom.pronInput.addEventListener('input', updateLivePreview);
    dom.defInput.addEventListener('input', updateLivePreview);

    // Auto-convert Pinyin to Zhuyin on blur or button click for Mandarin decks
    dom.btnConvertPinyin.addEventListener('click', () => {
      if (dom.pronInput.value.trim()) {
        dom.pronInput.value = window.LexiPhonetics.pinyinToZhuyin(dom.pronInput.value.trim());
        updateLivePreview();
        showToast('Converted Pinyin to Zhuyin (注音符號)!');
      }
    });

    dom.pronInput.addEventListener('blur', () => {
      if (state.selectedDeck.startsWith('mandarin') && /[a-zA-Z]/.test(dom.pronInput.value)) {
        dom.pronInput.value = window.LexiPhonetics.pinyinToZhuyin(dom.pronInput.value.trim());
        updateLivePreview();
      }
    });

    dom.btnAutoGenerate.addEventListener('click', () => {
      triggerAutoLookup({ overwriteExisting: true });
    });

    // Wrap selected text in context with **...**
    dom.btnWrapSelection.addEventListener('click', () => {
      const ta = dom.contextInput;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      if (start !== end) {
        const sel = ta.value.slice(start, end);
        ta.value = ta.value.slice(0, start) + `**${sel}**` + ta.value.slice(end);
        updateLivePreview();
      } else {
        showToast('Highlight a word in the context sentence first to wrap it in **...**');
      }
    });

    // Image upload events
    dom.btnChooseImage.addEventListener('click', (e) => {
      e.stopPropagation();
      dom.imageFileInput.click();
    });

    dom.imageDropzone.addEventListener('click', () => {
      dom.imageFileInput.click();
    });

    dom.imageFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleImageFileSelected(e.target.files[0]);
      }
    });

    dom.imageDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dom.imageDropzone.classList.add('dragover');
    });

    dom.imageDropzone.addEventListener('dragleave', () => {
      dom.imageDropzone.classList.remove('dragover');
    });

    dom.imageDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dom.imageDropzone.classList.remove('dragover');
      if (e.dataTransfer?.files?.[0]) {
        handleImageFileSelected(e.dataTransfer.files[0]);
      }
    });

    dom.btnPasteImage.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        if (!navigator.clipboard || !navigator.clipboard.read) {
          showToast('Press Ctrl+V (or Cmd+V) anywhere on the page to paste an image.');
          return;
        }
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const imgType = item.types.find((t) => t.startsWith('image/'));
          if (imgType) {
            const blob = await item.getType(imgType);
            await handleImageFileSelected(new File([blob], 'clipboard-image.png', { type: imgType }));
            showToast('Pasted image from clipboard!');
            return;
          }
        }
        showToast('No image found in clipboard.');
      } catch (_err) {
        showToast('Press Ctrl+V / Cmd+V to paste an image from your clipboard.');
      }
    });

    document.addEventListener('paste', (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            handleImageFileSelected(file);
            showToast('Pasted context image from clipboard!');
          }
          break;
        }
      }
    });

    dom.btnRemoveImage.addEventListener('click', clearSelectedImage);

    // Save / Cancel Card
    document.getElementById('card-composer-form').addEventListener('submit', handleSaveCard);
    dom.btnCancelEdit.addEventListener('click', resetComposerForm);

    // Filter tabs
    dom.filterTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        dom.filterTabs.forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        state.activeFilterDeck = tab.getAttribute('data-filter');
        renderQueueAndStats();
      });
    });

    // Quick Export & Export Modal
    dom.btnQuickExportNew.addEventListener('click', () => {
      executeExport({ scope: 'unexported', format: 'apkg' });
    });

    dom.btnOpenExportModal.addEventListener('click', () => {
      dom.chkAutoClearExport.checked = state.settings.autoClearAfterExport;
      updateExportModalSummary();
      dom.exportModal.classList.add('open');
    });

    dom.btnCloseExportModal.addEventListener('click', () => {
      dom.exportModal.classList.remove('open');
    });

    document.querySelectorAll('input[name="export-scope"], input[name="export-format"]').forEach((el) => {
      el.addEventListener('change', (e) => {
        const groupName = e.target.name;
        document.querySelectorAll(`input[name="${groupName}"]`).forEach((radio) => {
          radio.closest('.option-card')?.classList.toggle('selected', radio.checked);
        });
        updateExportModalSummary();
      });
    });

    dom.chkAutoClearExport.addEventListener('change', (e) => {
      state.settings.autoClearAfterExport = e.target.checked;
      localStorage.setItem('lexiforge_auto_clear', String(e.target.checked));
    });

    dom.btnConfirmExport.addEventListener('click', () => {
      executeExport({
        scope: state.settings.exportScope,
        format: state.settings.exportFormat
      });
    });

    dom.btnAnkiConnectSync.addEventListener('click', async () => {
      const targetCards = getCardsForExportScope(state.settings.exportScope);
      if (!targetCards.length) return;
      try {
        showToast('Connecting to Anki Desktop via AnkiConnect (127.0.0.1:8765)…');
        await window.LexiExporter.syncViaAnkiConnect(targetCards);
        await markCardsAsExported(targetCards);
        dom.exportModal.classList.remove('open');
        showToast(`Synced ${targetCards.length} card(s) directly into Anki Desktop!`);
      } catch (_err) {
        showToast('Could not reach AnkiConnect on 127.0.0.1:8765. Use the .apkg download instead!');
      }
    });

    // Clear Exported & Clear All
    dom.btnClearExported.addEventListener('click', async () => {
      const count = state.cards.filter((c) => c.exported).length;
      if (!count) return;
      await dbClearCards(true);
      state.cards = await dbGetAllCards();
      renderQueueAndStats();
      showToast(`Cleared ${count} already-exported card(s).`);
    });

    dom.btnClearAll.addEventListener('click', async () => {
      if (!state.cards.length) return;
      const unexp = state.cards.filter((c) => !c.exported).length;
      const msg = unexp > 0
        ? `Clear all ${state.cards.length} cards (including ${unexp} unexported card(s))?`
        : `Clear all ${state.cards.length} cards from the workspace?`;
      if (!window.confirm(msg)) return;
      await dbClearCards(false);
      state.cards = [];
      resetComposerForm();
      renderQueueAndStats();
      showToast('All cards cleared.');
    });

    // Hosting & Settings Modals
    dom.btnOpenHostingModal.addEventListener('click', () => {
      dom.hostingModal.classList.add('open');
    });
    dom.btnCloseHostingModal.addEventListener('click', () => {
      dom.hostingModal.classList.remove('open');
    });

    dom.btnOpenSettingsModal.addEventListener('click', () => {
      dom.inputGeminiKey.value = state.settings.geminiApiKey;
      dom.settingsModal.classList.add('open');
    });
    dom.btnCloseSettingsModal.addEventListener('click', () => {
      dom.settingsModal.classList.remove('open');
    });
    dom.btnSaveSettings.addEventListener('click', () => {
      state.settings.geminiApiKey = dom.inputGeminiKey.value.trim();
      localStorage.setItem('lexiforge_gemini_key', state.settings.geminiApiKey);
      dom.settingsModal.classList.remove('open');
      showToast('Settings saved.');
    });

    // Close modals when clicking backdrop
    [dom.exportModal, dom.hostingModal, dom.settingsModal].forEach((modal) => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('open');
      });
    });

    // Theme toggle
    dom.btnThemeToggle.addEventListener('click', () => {
      applyTheme(state.settings.theme === 'dark' ? 'light' : 'dark');
    });
  }

  async function initApp() {
    bindDomElements();
    applyTheme(state.settings.theme);
    selectDeck('français');
    setupEventListeners();

    state.cards = await dbGetAllCards();
    if (state.cards.length === 0) {
      await seedSampleCards(false);
    }
    renderQueueAndStats();
    updateLivePreview();
  }

  document.addEventListener('DOMContentLoaded', initApp);
})();
