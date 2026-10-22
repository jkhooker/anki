/**
 * LexiForge Linguistic & Phonetic Engine
 * Supports:
 * - français: [B] = IPA, [C] = Concise French definition
 * - italiano: [B] = IPA, [C] = Concise Italian definition
 * - mandarin (正體字): [B] = Zhuyin (Bopomofo), [C] = Concise English definition
 * - mandarin (簡化字): [B] = Zhuyin (Bopomofo), [C] = Concise English definition
 */

(function (global) {
  'use strict';

  // =========================================================================
  // 1. Complete Pinyin -> Zhuyin (Bopomofo) Syllable Transducer
  // =========================================================================

  const TONE_CHAR_MAP = {
    'ā': ['a', 1], 'á': ['a', 2], 'ǎ': ['a', 3], 'à': ['a', 4],
    'ē': ['e', 1], 'é': ['e', 2], 'ě': ['e', 3], 'è': ['e', 4],
    'ī': ['i', 1], 'í': ['i', 2], 'ǐ': ['i', 3], 'ì': ['i', 4],
    'ō': ['o', 1], 'ó': ['o', 2], 'ǒ': ['o', 3], 'ò': ['o', 4],
    'ū': ['u', 1], 'ú': ['u', 2], 'ǔ': ['u', 3], 'ù': ['u', 4],
    'ǖ': ['v', 1], 'ǘ': ['v', 2], 'ǚ': ['v', 3], 'ǜ': ['v', 4], 'ü': ['v', 5],
    'ń': ['n', 2], 'ň': ['n', 3], 'ǹ': ['n', 4],
    'ḿ': ['m', 2]
  };

  const TONE_MARKS = {
    1: '',
    2: 'ˊ',
    3: 'ˇ',
    4: 'ˋ',
    5: '˙'
  };

  // Whole-syllable overrides (standalone or special Pinyin spelling rules)
  const WHOLE_SYLLABLES = {
    'zhi': 'ㄓ', 'chi': 'ㄔ', 'shi': 'ㄕ', 'ri': 'ㄖ',
    'zi': 'ㄗ', 'ci': 'ㄘ', 'si': 'ㄙ',
    'yi': 'ㄧ', 'ya': 'ㄧㄚ', 'yo': 'ㄧㄛ', 'ye': 'ㄧㄝ', 'yai': 'ㄧㄞ',
    'yao': 'ㄧㄠ', 'you': 'ㄧㄡ', 'yan': 'ㄧㄢ', 'yin': 'ㄧㄣ',
    'yang': 'ㄧㄤ', 'ying': 'ㄧㄥ', 'yong': 'ㄩㄥ',
    'wu': 'ㄨ', 'wa': 'ㄨㄚ', 'wo': 'ㄨㄛ', 'wai': 'ㄨㄞ',
    'wei': 'ㄨㄟ', 'wan': 'ㄨㄢ', 'wen': 'ㄨㄣ', 'wang': 'ㄨㄤ', 'weng': 'ㄨㄥ',
    'yu': 'ㄩ', 'yue': 'ㄩㄝ', 'yuan': 'ㄩㄢ', 'yun': 'ㄩㄣ',
    'er': 'ㄦ', 'ng': 'ㄫ', 'hm': 'ㄏㄇ', 'hng': 'ㄏㄫ', 'm': 'ㄇ', 'n': 'ㄋ'
  };

  const INITIALS = [
    ['zh', 'ㄓ'], ['ch', 'ㄔ'], ['sh', 'ㄕ'],
    ['b', 'ㄅ'], ['p', 'ㄆ'], ['m', 'ㄇ'], ['f', 'ㄈ'],
    ['d', 'ㄉ'], ['t', 'ㄊ'], ['n', 'ㄋ'], ['l', 'ㄌ'],
    ['g', 'ㄍ'], ['k', 'ㄎ'], ['h', 'ㄏ'],
    ['j', 'ㄐ'], ['q', 'ㄑ'], ['x', 'ㄒ'],
    ['r', 'ㄖ'], ['z', 'ㄗ'], ['c', 'ㄘ'], ['s', 'ㄙ']
  ];

  const FINALS = {
    'a': 'ㄚ', 'o': 'ㄛ', 'e': 'ㄜ', 'ê': 'ㄝ',
    'ai': 'ㄞ', 'ei': 'ㄟ', 'ao': 'ㄠ', 'ou': 'ㄡ',
    'an': 'ㄢ', 'en': 'ㄣ', 'ang': 'ㄤ', 'eng': 'ㄥ', 'er': 'ㄦ',
    'i': 'ㄧ', 'ia': 'ㄧㄚ', 'io': 'ㄧㄛ', 'ie': 'ㄧㄝ', 'iai': 'ㄧㄞ',
    'iao': 'ㄧㄠ', 'iu': 'ㄧㄡ', 'iou': 'ㄧㄡ',
    'ian': 'ㄧㄢ', 'in': 'ㄧㄣ', 'iang': 'ㄧㄤ', 'ing': 'ㄧㄥ',
    'u': 'ㄨ', 'ua': 'ㄨㄚ', 'uo': 'ㄨㄛ', 'uai': 'ㄨㄞ',
    'ui': 'ㄨㄟ', 'uei': 'ㄨㄟ', 'uan': 'ㄨㄢ', 'un': 'ㄨㄣ', 'uen': 'ㄨㄣ',
    'uang': 'ㄨㄤ', 'ueng': 'ㄨㄥ', 'ong': 'ㄨㄥ',
    'v': 'ㄩ', 've': 'ㄩㄝ', 'ue': 'ㄩㄝ', 'van': 'ㄩㄢ', 'vn': 'ㄩㄣ',
    'iong': 'ㄩㄥ'
  };

  function convertSinglePinyinSyllable(rawSyl) {
    if (!rawSyl) return '';
    let s = rawSyl.toLowerCase().trim().replace(/u:/g, 'v');
    let tone = 5;

    // Check trailing digit tone (1-5)
    const digitMatch = s.match(/^([a-zvê]+)([1-5])$/);
    if (digitMatch) {
      s = digitMatch[1];
      tone = parseInt(digitMatch[2], 10);
    } else {
      // Check diacritic tone marks
      let normalized = '';
      for (const ch of s) {
        if (TONE_CHAR_MAP[ch]) {
          normalized += TONE_CHAR_MAP[ch][0];
          if (TONE_CHAR_MAP[ch][1] !== 5) {
            tone = TONE_CHAR_MAP[ch][1];
          }
        } else {
          normalized += ch;
        }
      }
      s = normalized;
    }

    if (WHOLE_SYLLABLES[s]) {
      return WHOLE_SYLLABLES[s] + (TONE_MARKS[tone] || '');
    }

    // Match initial
    let zhInitial = '';
    let rest = s;
    for (const [pinInit, bopInit] of INITIALS) {
      if (s.startsWith(pinInit)) {
        zhInitial = bopInit;
        rest = s.slice(pinInit.length);
        break;
      }
    }

    // After j, q, x, 'u' is actually 'v' (ㄩ)
    if (['ㄐ', 'ㄑ', 'ㄒ'].includes(zhInitial) && rest.startsWith('u')) {
      rest = 'v' + rest.slice(1);
    }

    const zhFinal = FINALS[rest];
    if (!zhFinal) {
      return rawSyl;
    }
    return zhInitial + zhFinal + (TONE_MARKS[tone] || '');
  }

  // Segment continuous Pinyin like "shèngdànshù" or "sheng4 dan4 shu4" into syllables
  function segmentPinyinString(input) {
    const cleaned = input
      .trim()
      .replace(/['’]/g, ' ')
      .replace(/[-/]+/g, ' ');

    const rawTokens = cleaned.split(/\s+/).filter(Boolean);
    const allSyllables = [];

    for (const token of rawTokens) {
      // Split by numbered tones first if present, e.g. "sheng4dan4shu4"
      if (/[1-5]/.test(token)) {
        const parts = token.match(/[a-zA-ZüÜvVāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]+[1-5]?/g);
        if (parts) {
          allSyllables.push(...parts);
          continue;
        }
      }
      // Greedy maximal munch from left to right for joined Pinyin without numbers
      let pos = 0;
      while (pos < token.length) {
        let matched = null;
        for (let len = Math.min(7, token.length - pos); len >= 1; len--) {
          const sub = token.slice(pos, pos + len);
          const converted = convertSinglePinyinSyllable(sub);
          if (converted !== sub) {
            // Avoid splitting before final 'n' or 'ng' if followed by vowel
            const nextChar = token[pos + len] ? token[pos + len].toLowerCase() : '';
            const lastChar = sub[sub.length - 1].toLowerCase();
            if (
              (lastChar === 'n' || lastChar === 'g') &&
              pos + len < token.length &&
              /[aeiouvāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/.test(nextChar)
            ) {
              // Check if shorter match without 'n'/'g' works so 'n'/'g' can be next syllable's initial
              const shorter = token.slice(pos, pos + len - 1);
              if (shorter && convertSinglePinyinSyllable(shorter) !== shorter) {
                continue;
              }
            }
            matched = sub;
            break;
          }
        }
        if (matched) {
          allSyllables.push(matched);
          pos += matched.length;
        } else {
          pos += 1;
        }
      }
    }
    return allSyllables;
  }

  function pinyinToZhuyin(pinyinText) {
    if (!pinyinText) return '';
    // If already contains Zhuyin symbols, return as-is
    if (/[\u3105-\u3129]/.test(pinyinText)) {
      return pinyinText.trim();
    }
    const syllables = segmentPinyinString(pinyinText);
    if (!syllables.length) return pinyinText;
    return syllables.map(convertSinglePinyinSyllable).join(' ');
  }

  // =========================================================================
  // 2. Curated Lexicon & Character Table (Offline Ready + Instant Examples)
  // =========================================================================

  const FR_LEXICON = {
    'arbre de noël': {
      ipa: 'aʁbʁ də nɔ.ɛl',
      def: 'sapin décoré pour célébrer la fête de Noël'
    },
    'sapin de noël': {
      ipa: 'sa.pɛ̃ də nɔ.ɛl',
      def: 'conifère décoré de guirlandes et de boules à Noël'
    },
    'flâner': {
      ipa: 'flɑ.ne',
      def: 'se promener sans but précis, au hasard, pour le plaisir'
    },
    'dépaysement': {
      ipa: 'de.pɛ.iz.mɑ̃',
      def: 'sentiment agréable de changement d’habitudes ou de lieu'
    },
    'avoir le cafard': {
      ipa: 'a.vwaʁ lə ka.faʁ',
      def: 'être triste, mélancolique, avoir des idées noires'
    },
    'coup de foudre': {
      ipa: 'ku də fudʁ',
      def: 'amour ou enthousiasme soudain et irrésistible'
    },
    'enchanteur': {
      ipa: 'ɑ̃.ʃɑ̃.tœʁ',
      def: 'qui charme, séduit et ravit par sa beauté'
    },
    'quotidien': {
      ipa: 'kɔ.ti.djɛ̃',
      def: 'qui se fait ou revient chaque jour'
    },
    'accueillant': {
      ipa: 'a.kœ.jɑ̃',
      def: 'qui reçoit avec amabilité et chaleur'
    },
    'éphémère': {
      ipa: 'e.fe.mɛʁ',
      def: 'qui ne dure qu’un temps très court, passager'
    },
    'apprivoiser': {
      ipa: 'a.pʁi.vwa.ze',
      def: 'rendre moins sauvage ou gagner la confiance de quelqu’un'
    },
    'crépuscule': {
      ipa: 'kʁe.pys.kyl',
      def: 'lumière faible qui suit le coucher du soleil'
    },
    'bouleverser': {
      ipa: 'bul.vɛʁ.se',
      def: 'émouvoir profondément ou perturber complètement'
    },
    'malgré': {
      ipa: 'mal.ɡʁe',
      def: 'en dépit de, sans être empêché par'
    }
  };

  const IT_LEXICON = {
    'chiacchierare': {
      ipa: 'kjak.kjeˈra.re',
      def: 'conversare amichevolmente del più e del meno'
    },
    'passeggiata': {
      ipa: 'pas.sedˈdʒa.ta',
      def: 'breve camminata fatta per svago o riposo'
    },
    'albero di natale': {
      ipa: 'ˈal.be.ro di naˈta.le',
      def: 'abete addobbato con luci e decorazioni per il Natale'
    },
    'spensierato': {
      ipa: 'spen.sjeˈra.to',
      def: 'libero da preoccupazioni, allegro e sereno'
    },
    'in bocca al lupo': {
      ipa: 'in ˈbok.ka al ˈlu.po',
      def: 'augurio scherzoso di buona fortuna prima di una prova'
    },
    'meriggiare': {
      ipa: 'me.ridˈdʒa.re',
      def: 'riposare all’ombra nelle ore più calde del pomeriggio'
    },
    'mozzafiato': {
      ipa: 'mot.tsaˈfja.to',
      def: 'che suscita grande stupore ed emozione per la sua bellezza'
    },
    'accogliente': {
      ipa: 'ak.koʎˈʎɛn.te',
      def: 'ospitale, confortevole e piacevole'
    },
    'abitudine': {
      ipa: 'a.biˈtu.di.ne',
      def: 'tendenza a ripetere un comportamento acquisito nel tempo'
    },
    'senz’altro': {
      ipa: 'senˈtsal.tro',
      def: 'certamente, senza alcun dubbio'
    },
    'tramonto': {
      ipa: 'traˈmon.to',
      def: 'il calare del sole sotto l’orizzonte a fine giornata'
    }
  };

  const ZH_PHRASE_LEXICON = {
    '聖誕樹': { zhuyin: 'ㄕㄥˋ ㄉㄢˋ ㄕㄨˋ', def: 'Christmas tree' },
    '圣诞树': { zhuyin: 'ㄕㄥˋ ㄉㄢˋ ㄕㄨˋ', def: 'Christmas tree' },
    '未雨綢繆': { zhuyin: 'ㄨㄟˋ ㄩˇ ㄔㄡˊ ㄇㄡˊ', def: 'to prepare ahead before trouble arises' },
    '未雨绸缪': { zhuyin: 'ㄨㄟˋ ㄩˇ ㄔㄡˊ ㄇㄡˊ', def: 'to prepare ahead before trouble arises' },
    '車水馬龍': { zhuyin: 'ㄔㄜ ㄕㄨㄟˇ ㄇㄚˇ ㄌㄨㄥˊ', def: 'heavy, bustling traffic of vehicles and people' },
    '车水马龙': { zhuyin: 'ㄔㄜ ㄕㄨㄟˇ ㄇㄚˇ ㄌㄨㄥˊ', def: 'heavy, bustling traffic of vehicles and people' },
    '舉一反三': { zhuyin: 'ㄐㄩˇ ㄧ ㄈㄢˇ ㄙㄢ', def: 'to infer many things from a single example' },
    '举一反三': { zhuyin: 'ㄐㄩˇ ㄧ ㄈㄢˇ ㄙㄢ', def: 'to infer many things from a single example' },
    '隨遇而安': { zhuyin: 'ㄙㄨㄟˊ ㄩˋ ㄦˊ ㄢ', def: 'to feel at home wherever one is; adaptable' },
    '随遇而安': { zhuyin: 'ㄙㄨㄟˊ ㄩˋ ㄦˊ ㄢ', def: 'to feel at home wherever one is; adaptable' },
    '畫龍點睛': { zhuyin: 'ㄏㄨㄚˋ ㄌㄨㄥˊ ㄉㄧㄢˇ ㄐㄧㄥ', def: 'to add the crucial finishing touch' },
    '画龙点睛': { zhuyin: 'ㄏㄨㄚˋ ㄌㄨㄥˊ ㄉㄧㄢˇ ㄐㄧㄥ', def: 'to add the crucial finishing touch' },
    '咖啡館': { zhuyin: 'ㄎㄚ ㄈㄟ ㄍㄨㄢˇ', def: 'café; coffee shop' },
    '咖啡馆': { zhuyin: 'ㄎㄚ ㄈㄟ ㄍㄨㄢˇ', def: 'café; coffee shop' },
    '圖書館': { zhuyin: 'ㄊㄨˊ ㄕㄨ ㄍㄨㄢˇ', def: 'library' },
    '图书馆': { zhuyin: 'ㄊㄨˊ ㄕㄨ ㄍㄨㄢˇ', def: 'library' },
    '腳踏車': { zhuyin: 'ㄐㄧㄠˇ ㄊㄚˋ ㄔㄜ', def: 'bicycle' },
    '自行車': { zhuyin: 'ㄗˋ ㄒㄧㄥˊ ㄔㄜ', def: 'bicycle' },
    '自行车': { zhuyin: 'ㄗˋ ㄒㄧㄥˊ ㄔㄜ', def: 'bicycle' },
    '夜市': { zhuyin: 'ㄧㄝˋ ㄕˋ', def: 'night market' },
    '習慣': { zhuyin: 'ㄒㄧˊ ㄍㄨㄢˋ', def: 'habit; to be accustomed to' },
    '习惯': { zhuyin: 'ㄒㄧˊ ㄍㄨㄢˋ', def: 'habit; to be accustomed to' },
    '溫馨': { zhuyin: 'ㄨㄣ ㄒㄧㄣ', def: 'warm, cozy, and comforting' },
    '温馨': { zhuyin: 'ㄨㄣ ㄒㄧㄣ', def: 'warm, cozy, and comforting' }
  };

  // Character-level fallback table for common Traditional & Simplified Hanzi
  const HANZI_CHAR_MAP = {
    '我': ['ㄨㄛˇ', 'I; me'], '你': ['ㄋㄧˇ', 'you'], '他': ['ㄊㄚ', 'he; him'], '她': ['ㄊㄚ', 'she; her'],
    '們': ['ㄇㄣ˙', 'plural marker'], '们': ['ㄇㄣ˙', 'plural marker'], '的': ['ㄉㄜ˙', 'possessive particle'],
    '是': ['ㄕˋ', 'to be'], '不': ['ㄅㄨˋ', 'not; no'], '在': ['ㄗㄞˋ', 'at; in; located at'],
    '有': ['ㄧㄡˇ', 'to have; there is'], '人': ['ㄖㄣˊ', 'person; people'], '這': ['ㄓㄜˋ', 'this'],
    '这': ['ㄓㄜˋ', 'this'], '那': ['ㄋㄚˋ', 'that'], '來': ['ㄌㄞˊ', 'to come'], '来': ['ㄌㄞˊ', 'to come'],
    '去': ['ㄑㄩˋ', 'to go'], '說': ['ㄕㄨㄛ', 'to speak; to say'], '说': ['ㄕㄨㄛ', 'to speak; to say'],
    '看': ['ㄎㄢˋ', 'to look; to read'], '聽': ['ㄊㄧㄥ', 'to listen'], '听': ['ㄊㄧㄥ', 'to listen'],
    '寫': ['ㄒㄧㄝˇ', 'to write'], '写': ['ㄒㄧㄝˇ', 'to write'], '讀': ['ㄉㄨˊ', 'to read; to study'],
    '读': ['ㄉㄨˊ', 'to read; to study'], '學': ['ㄒㄩㄝˊ', 'to learn; to study'], '学': ['ㄒㄩㄝˊ', 'to learn; to study'],
    '習': ['ㄒㄧˊ', 'to practice'], '习': ['ㄒㄧˊ', 'to practice'], '好': ['ㄏㄠˇ', 'good; well'],
    '大': ['ㄉㄚˋ', 'big; large'], '小': ['ㄒㄧㄠˇ', 'small; little'], '多': ['ㄉㄨㄛ', 'many; much'],
    '少': ['ㄕㄠˇ', 'few; little'], '天': ['ㄊㄧㄢ', 'sky; day'], '地': ['ㄉㄧˋ', 'earth; ground'],
    '水': ['ㄕㄨㄟˇ', 'water'], '火': ['ㄏㄨㄛˇ', 'fire'], '風': ['ㄈㄥ', 'wind'], '风': ['ㄈㄥ', 'wind'],
    '雨': ['ㄩˇ', 'rain'], '雪': ['ㄒㄩㄝˇ', 'snow'], '山': ['ㄕㄢ', 'mountain'], '樹': ['ㄕㄨˋ', 'tree'],
    '树': ['ㄕㄨˋ', 'tree'], '木': ['ㄇㄨˋ', 'wood; tree'], '花': ['ㄏㄨㄚ', 'flower'], '草': ['ㄘㄠˇ', 'grass'],
    '日': ['ㄖˋ', 'sun; day'], '月': ['ㄩㄝˋ', 'moon; month'], '星': ['ㄒㄧㄥ', 'star'], '光': ['ㄍㄨㄤ', 'light'],
    '時': ['ㄕˊ', 'time; hour'], '时': ['ㄕˊ', 'time; hour'], '間': ['ㄐㄧㄢ', 'space; between'],
    '间': ['ㄐㄧㄢ', 'space; between'], '年': ['ㄋㄧㄢˊ', 'year'], '今': ['ㄐㄧㄣ', 'today; now'],
    '明': ['ㄇㄧㄥˊ', 'bright; tomorrow'], '昨': ['ㄗㄨㄛˊ', 'yesterday'], '早': ['ㄗㄠˇ', 'early; morning'],
    '晚': ['ㄨㄢˇ', 'evening; late'], '夜': ['ㄧㄝˋ', 'night'], '家': ['ㄐㄧㄚ', 'home; family'],
    '國': ['ㄍㄨㄛˊ', 'country; nation'], '国': ['ㄍㄨㄛˊ', 'country; nation'], '城': ['ㄔㄥˊ', 'city; wall'],
    '市': ['ㄕˋ', 'market; city'], '路': ['ㄌㄨˋ', 'road; way'], '街': ['ㄐㄧㄝ', 'street'],
    '車': ['ㄔㄜ', 'vehicle; car'], '车': ['ㄔㄜ', 'vehicle; car'], '馬': ['ㄇㄚˇ', 'horse'],
    '马': ['ㄇㄚˇ', 'horse'], '龍': ['ㄌㄨㄥˊ', 'dragon'], '龙': ['ㄌㄨㄥˊ', 'dragon'],
    '鳥': ['ㄋㄧㄠˇ', 'bird'], '鸟': ['ㄋㄧㄠˇ', 'bird'], '魚': ['ㄩˊ', 'fish'], '鱼': ['ㄩˊ', 'fish'],
    '吃': ['ㄔ', 'to eat'], '喝': ['ㄏㄜ', 'to drink'], '茶': ['ㄔㄚˊ', 'tea'], '飯': ['ㄈㄢˋ', 'cooked rice; meal'],
    '饭': ['ㄈㄢˋ', 'cooked rice; meal'], '書': ['ㄕㄨ', 'book'], '书': ['ㄕㄨ', 'book'],
    '字': ['ㄗˋ', 'character; word'], '文': ['ㄨㄣˊ', 'language; culture'], '語': ['ㄩˇ', 'language; speech'],
    '语': ['ㄩˇ', 'language; speech'], '言': ['ㄧㄢˊ', 'words; speech'], '心': ['ㄒㄧㄣ', 'heart; mind'],
    '愛': ['ㄞˋ', 'love; to love'], '爱': ['ㄞˋ', 'love; to love'], '想': ['ㄒㄧㄤˇ', 'to think; to want'],
    '知': ['ㄓ', 'to know'], '道': ['ㄉㄠˋ', 'way; path; to know'], '高': ['ㄍㄠ', 'tall; high'],
    '興': ['ㄒㄧㄥˋ', 'excited; cheerful'], '兴': ['ㄒㄧㄥˋ', 'excited; cheerful'], '快': ['ㄎㄨㄞˋ', 'fast; happy'],
    '樂': ['ㄌㄜˋ', 'happy; joy'], '乐': ['ㄌㄜˋ', 'happy; joy'], '慢': ['ㄇㄢˋ', 'slow'],
    '新': ['ㄒㄧㄣ', 'new'], '舊': ['ㄐㄧㄡˋ', 'old; used'], '旧': ['ㄐㄧㄡˋ', 'old; used'],
    '美': ['ㄇㄟˇ', 'beautiful'], '麗': ['ㄌㄧˋ', 'beautiful'], '丽': ['ㄌㄧˋ', 'beautiful'],
    '聖': ['ㄕㄥˋ', 'holy; sacred'], '圣': ['ㄕㄥˋ', 'holy; sacred'], '誕': ['ㄉㄢˋ', 'birth; birthday'],
    '诞': ['ㄉㄢˋ', 'birth; birthday'], '節': ['ㄐㄧㄝˊ', 'festival; holiday'], '节': ['ㄐㄧㄝˊ', 'festival; holiday'],
    '春': ['ㄔㄨㄣ', 'spring'], '夏': ['ㄒㄧㄚˋ', 'summer'], '秋': ['ㄑㄧㄡ', 'autumn'], '冬': ['ㄉㄨㄥ', 'winter'],
    '冷': ['ㄌㄥˇ', 'cold'], '熱': ['ㄖㄜˋ', 'hot'], '热': ['ㄖㄜˋ', 'hot'], '溫': ['ㄨㄣ', 'warm; mild'],
    '温': ['ㄨㄣ', 'warm; mild'], '馨': ['ㄒㄧㄣ', 'fragrant; cozy'], '未': ['ㄨㄟˋ', 'not yet'],
    '綢': ['ㄔㄡˊ', 'silk; to bind'], '绸': ['ㄔㄡˊ', 'silk; to bind'], '繆': ['ㄇㄡˊ', 'to entwine; prepare'],
    '缪': ['ㄇㄡˊ', 'to entwine; prepare'], '隨': ['ㄙㄨㄟˊ', 'to follow; along with'], '随': ['ㄙㄨㄟˊ', 'to follow; along with'],
    '遇': ['ㄩˋ', 'to meet; encounter'], '而': ['ㄦˊ', 'and; yet'], '安': ['ㄢ', 'peaceful; calm'],
    '畫': ['ㄏㄨㄚˋ', 'to paint; picture'], '画': ['ㄏㄨㄚˋ', 'to paint; picture'], '點': ['ㄉㄧㄢˇ', 'dot; point; o’clock'],
    '点': ['ㄉㄧㄢˇ', 'dot; point; o’clock'], '睛': ['ㄐㄧㄥ', 'eyeball; pupil'], '舉': ['ㄐㄩˇ', 'to lift; to cite'],
    '举': ['ㄐㄩˇ', 'to lift; to cite'], '一': ['ㄧ', 'one'], '反': ['ㄈㄢˇ', 'to turn over; on the contrary'],
    '三': ['ㄙㄢ', 'three'], '二': ['ㄦˋ', 'two'], '四': ['ㄙˋ', 'four'], '五': ['ㄨˇ', 'five'],
    '六': ['ㄌㄧㄡˋ', 'six'], '七': ['ㄑㄧ', 'seven'], '八': ['ㄅㄚ', 'eight'], '九': ['ㄐㄧㄡˇ', 'nine'],
    '十': ['ㄕˊ', 'ten'], '百': ['ㄅㄞˇ', 'hundred'], '千': ['ㄑㄧㄢ', 'thousand'], '萬': ['ㄨㄢˋ', 'ten thousand'],
    '万': ['ㄨㄢˋ', 'ten thousand'], '買': ['ㄇㄞˇ', 'to buy'], '买': ['ㄇㄞˇ', 'to buy'], '賣': ['ㄇㄞˋ', 'to sell'],
    '卖': ['ㄇㄞˋ', 'to sell'], '開': ['ㄎㄞ', 'to open; to start'], '开': ['ㄎㄞ', 'to open; to start'],
    '關': ['ㄍㄨㄢ', 'to close; pass'], '关': ['ㄍㄨㄢ', 'to close; pass'], '門': ['ㄇㄣˊ', 'door; gate'],
    '门': ['ㄇㄣˊ', 'door; gate'], '窗': ['ㄔㄨㄤ', 'window'], '燈': ['ㄉㄥ', 'lamp; light'], '灯': ['ㄉㄥ', 'lamp; light'],
    '桌': ['ㄓㄨㄛ', 'table; desk'], '椅': ['ㄧˇ', 'chair'], '房': ['ㄈㄤˊ', 'house; room'],
    '朋': ['ㄆㄥˊ', 'friend'], '友': ['ㄧㄡˇ', 'friend'], '老': ['ㄌㄠˇ', 'old; experienced'],
    '師': ['ㄕ', 'teacher; master'], '师': ['ㄕ', 'teacher; master'], '生': ['ㄕㄥ', 'life; student; born']
  };

  // =========================================================================
  // 3. Rule-Based French & Italian Grapheme-to-IPA Phonetic Fallbacks
  // =========================================================================

  function frenchWordToIPA(word) {
    let w = word.toLowerCase().trim();
    if (!w) return '';
    if (FR_LEXICON[w]) return FR_LEXICON[w].ipa;

    // Common short function words
    const funcMap = {
      'de': 'də', 'du': 'dy', 'des': 'de', 'le': 'lə', 'la': 'la', 'les': 'le',
      'un': 'œ̃', 'une': 'yn', 'au': 'o', 'aux': 'o', 'en': 'ɑ̃', 'et': 'e',
      'ou': 'u', 'où': 'u', 'à': 'a', 'dans': 'dɑ̃', 'sur': 'syʁ', 'sous': 'su',
      'pour': 'puʁ', 'par': 'paʁ', 'sans': 'sɑ̃', 'avec': 'a.vɛk', 'chez': 'ʃe',
      'être': 'ɛtʁ', 'avoir': 'a.vwaʁ', 'noël': 'nɔ.ɛl', 'arbre': 'aʁbʁ'
    };
    if (funcMap[w]) return funcMap[w];

    let s = w;
    // Strip common silent final endings before digraph replacements
    s = s.replace(/er$/, 'E_INF');
    s = s.replace(/ez$/, 'E_INF');
    s = s.replace(/es$/, '');
    s = s.replace(/e$/, '');
    s = s.replace(/[dsxtz]$/, '');

    // Multi-character French graphemes
    s = s
      .replace(/eaux?/g, 'o')
      .replace(/aux?/g, 'o')
      .replace(/oix/g, 'wa')
      .replace(/oi/g, 'wa')
      .replace(/ou/g, 'u')
      .replace(/eu|œu/g, 'ø')
      .replace(/ai|ei|è|ê|ë/g, 'ɛ')
      .replace(/é|E_INF/g, 'e')
      .replace(/ain|ein|im|in(?![aeiouyéèê])/g, 'ɛ̃')
      .replace(/an|am|en|em(?![aeiouyéèê])/g, 'ɑ̃')
      .replace(/on|om(?![aeiouyéèê])/g, 'ɔ̃')
      .replace(/ch/g, 'ʃ')
      .replace(/ph/g, 'f')
      .replace(/gn/g, 'ɲ')
      .replace(/qu/g, 'k')
      .replace(/gu(?=[eéèêi])/g, 'ɡ')
      .replace(/ge(?=[aouɑ̃ɔ̃])/g, 'ʒ')
      .replace(/g(?=[eéèêiɛy])/g, 'ʒ')
      .replace(/g/g, 'ɡ')
      .replace(/c(?=[eéèêiɛy])/g, 's')
      .replace(/ç/g, 's')
      .replace(/c/g, 'k')
      .replace(/ill/g, 'j')
      .replace(/u/g, 'y')
      .replace(/r+/g, 'ʁ')
      .replace(/j/g, 'ʒ')
      .replace(/h/g, '')
      .replace(/([pbtdkɡfvszʃʒmnlʁ])\1+/g, '$1');

    return s || w;
  }

  function frenchPhraseToIPA(phrase) {
    const clean = phrase.toLowerCase().trim();
    if (FR_LEXICON[clean]) return FR_LEXICON[clean].ipa;
    return clean
      .split(/\s+/)
      .map(frenchWordToIPA)
      .filter(Boolean)
      .join(' ');
  }

  function italianWordToIPA(word) {
    let w = word.toLowerCase().trim();
    if (!w) return '';
    if (IT_LEXICON[w]) return IT_LEXICON[w].ipa;

    let s = w
      .replace(/gli(?=[aeiou])/g, 'ʎ')
      .replace(/gli/g, 'ʎi')
      .replace(/gn/g, 'ɲ')
      .replace(/sci(?=[aou])/g, 'ʃ')
      .replace(/sce/g, 'ʃe')
      .replace(/sci/g, 'ʃi')
      .replace(/ch/g, 'k')
      .replace(/gh/g, 'ɡ')
      .replace(/ci(?=[aou])/g, 'tʃ')
      .replace(/ce/g, 'tʃe')
      .replace(/ci/g, 'tʃi')
      .replace(/gi(?=[aou])/g, 'dʒ')
      .replace(/ge/g, 'dʒe')
      .replace(/gi/g, 'dʒi')
      .replace(/qu/g, 'kw')
      .replace(/zz/g, 'tts')
      .replace(/z/g, 'ts')
      .replace(/c/g, 'k')
      .replace(/g/g, 'ɡ')
      .replace(/h/g, '');

    return s;
  }

  function italianPhraseToIPA(phrase) {
    const clean = phrase.toLowerCase().trim();
    if (IT_LEXICON[clean]) return IT_LEXICON[clean].ipa;
    return clean
      .split(/\s+/)
      .map(italianWordToIPA)
      .filter(Boolean)
      .join(' ');
  }

  // =========================================================================
  // 4. Online Wiktionary CORS Parser (Zero API Key Needed)
  // =========================================================================

  function cleanWikitextDefinition(rawLine) {
    if (!rawLine) return '';
    let text = rawLine
      .replace(/^#+\s*/, '')
      // Remove leading grammar/domain templates like {{lexique|...|fr}} or {{term|...|it}}
      .replace(/^\{\{[^}]+\}\}\s*/g, '')
      .replace(/^\{\{[^}]+\}\}\s*/g, '')
      // Convert [[target|label]] -> label, [[word]] -> word
      .replace(/\[\[(?:[^|\]]+\|)?([^\]]+)\]\]/g, '$1')
      // Convert simple formatting templates
      .replace(/\{\{(?:lien|l|m|w|f)\|([^|}]+)(?:\|[^}]*)?\}\}/g, '$1')
      // Strip remaining templates
      .replace(/\{\{[^}]*\}\}/g, '')
      // Strip bold/italics wiki quotes
      .replace(/'''?/g, '')
      // Clean HTML tags
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Keep concise: take first clause if overly long
    text = text.replace(/\.\s+.*$/, '');
    text = text.replace(/\.$/, '');
    if (text.length > 110) {
      text = text.slice(0, 107).trim() + '…';
    }
    if (text.length > 1) {
      text = text[0].toLowerCase() + text.slice(1);
    }
    return text;
  }

  async function fetchWiktionaryWikitext(langSubdomain, pageTitle) {
    const url = `https://${langSubdomain}.wiktionary.org/w/api.php?action=parse&prop=wikitext&format=json&origin=*&redirects=1&page=${encodeURIComponent(pageTitle)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) return null;
      const data = await res.json();
      return data?.parse?.wikitext?.['*'] || null;
    } catch (_err) {
      clearTimeout(timer);
      return null;
    }
  }

  async function lookupFrenchOnline(phrase) {
    const candidates = [phrase.trim(), phrase.trim().toLowerCase()];
    // Also handle "arbre de noël" -> "arbre de Noël"
    if (phrase.toLowerCase().includes('noël')) {
      candidates.unshift(phrase.replace(/noël/gi, 'Noël'));
    }

    for (const candidate of candidates) {
      const wt = await fetchWiktionaryWikitext('fr', candidate);
      if (!wt) continue;

      // Extract French IPA from {{pron|...|fr}}
      let ipa = '';
      const pronMatch = wt.match(/\{\{pron\|([^|}]+)\|fr/);
      if (pronMatch && pronMatch[1]) {
        ipa = pronMatch[1].trim();
      }

      // Extract first definition line (# ...) after French section
      let def = '';
      const lines = wt.split('\n');
      for (const line of lines) {
        if (/^#\s+[^*:]/.test(line)) {
          const cleaned = cleanWikitextDefinition(line);
          if (cleaned && cleaned.length >= 4) {
            def = cleaned;
            break;
          }
        }
      }

      if (ipa || def) {
        return { ipa, def };
      }
    }
    return null;
  }

  async function lookupItalianOnline(phrase) {
    const candidates = [phrase.trim(), phrase.trim().toLowerCase()];
    for (const candidate of candidates) {
      const wt = await fetchWiktionaryWikitext('it', candidate);
      if (!wt) continue;

      let ipa = '';
      const ipaMatch = wt.match(/\{\{IPA\|\/?([^/|}+]+)\/?/);
      if (ipaMatch && ipaMatch[1]) {
        ipa = ipaMatch[1].trim();
      }

      let def = '';
      const lines = wt.split('\n');
      for (const line of lines) {
        if (/^#\s+[^*:]/.test(line)) {
          const cleaned = cleanWikitextDefinition(line);
          if (cleaned && cleaned.length >= 4) {
            def = cleaned;
            break;
          }
        }
      }

      if (ipa || def) {
        return { ipa, def };
      }
    }
    return null;
  }

  async function lookupMandarinOnline(phrase) {
    const wt = await fetchWiktionaryWikitext('en', phrase.trim());
    if (!wt) return null;

    let zhuyin = '';
    const mMatch = wt.match(/\|m=([^|\n}]+)/);
    if (mMatch && mMatch[1]) {
      const firstPinyin = mMatch[1].split(',')[0].trim();
      zhuyin = pinyinToZhuyin(firstPinyin);
    }

    let def = '';
    const lines = wt.split('\n');
    for (const line of lines) {
      if (/^#\s+[^*:]/.test(line)) {
        const cleaned = cleanWikitextDefinition(line);
        if (cleaned && cleaned.length >= 2 && !cleaned.startsWith('see ')) {
          def = cleaned;
          break;
        }
      }
    }

    if (zhuyin || def) {
      return { zhuyin, def };
    }
    return null;
  }

  // =========================================================================
  // 5. Optional Gemini AI Generation (Context-Aware + Multimodal)
  // =========================================================================

  async function lookupWithGemini(word, contextText, deck, apiKey) {
    if (!apiKey) return null;

    const isMandarin = deck.startsWith('mandarin');
    const defLang = deck === 'français'
      ? 'French (français)'
      : deck === 'italiano'
        ? 'Italian (italiano)'
        : 'English';
    const pronType = isMandarin
      ? 'Taiwan Mandarin Zhuyin / Bopomofo (e.g. ㄕㄥˋ ㄉㄢˋ ㄕㄨˋ)'
      : `IPA phonetic transcription for ${deck} without slashes (e.g. aʁbʁ də nɔ.ɛl)`;

    const prompt = [
      `You are creating the back of an Anki language flashcard for the deck "${deck}".`,
      `Target word or phrase [A]: "${word}"`,
      contextText ? `Context sentence: "${contextText}"` : '',
      `Provide JSON with two keys:`,
      `1. "pronunciation": ${pronType}`,
      `2. "definition": A very concise definition (maximum 10-12 words) written strictly in ${defLang}.`,
      `Respond ONLY with valid JSON: {"pronunciation": "...", "definition": "..."}`
    ].filter(Boolean).join('\n');

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.2
            }
          })
        }
      );
      if (!response.ok) return null;
      const data = await response.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) return null;
      const parsed = JSON.parse(rawText);
      return {
        pronunciation: (parsed.pronunciation || '').trim().replace(/^\/|\/$/g, ''),
        definition: (parsed.definition || '').trim()
      };
    } catch (_e) {
      return null;
    }
  }

  // =========================================================================
  // 6. Unified Auto-Generator for [B] (Pronunciation) & [C] (Definition)
  // =========================================================================

  function lookupMandarinOffline(phrase) {
    const clean = phrase.trim();
    if (ZH_PHRASE_LEXICON[clean]) {
      return {
        pronunciation: ZH_PHRASE_LEXICON[clean].zhuyin,
        definition: ZH_PHRASE_LEXICON[clean].def
      };
    }

    // Character-by-character Zhuyin & gloss assembly
    const chars = Array.from(clean);
    const zhuyinParts = [];
    const glossParts = [];
    let matchedChars = 0;

    for (const ch of chars) {
      if (HANZI_CHAR_MAP[ch]) {
        zhuyinParts.push(HANZI_CHAR_MAP[ch][0]);
        glossParts.push(HANZI_CHAR_MAP[ch][1].split(';')[0]);
        matchedChars++;
      }
    }

    return {
      pronunciation: matchedChars > 0 ? zhuyinParts.join(' ') : '',
      definition: matchedChars === chars.length && chars.length === 1
        ? glossParts[0]
        : matchedChars > 0
          ? glossParts.join(' + ')
          : ''
    };
  }

  async function generatePronunciationAndDefinition({ word, contextText, deck, apiKey }) {
    const cleanWord = (word || '').trim();
    if (!cleanWord) {
      return { pronunciation: '', definition: '', source: 'empty' };
    }

    // 1. Try Gemini AI if user provided an API key
    if (apiKey) {
      const aiResult = await lookupWithGemini(cleanWord, contextText, deck, apiKey);
      if (aiResult && (aiResult.pronunciation || aiResult.definition)) {
        return {
          pronunciation: aiResult.pronunciation,
          definition: aiResult.definition,
          source: 'Gemini AI'
        };
      }
    }

    const lowerWord = cleanWord.toLowerCase();

    // 2. Check curated built-in lexicon first for instant zero-latency accuracy
    if (deck === 'français' && FR_LEXICON[lowerWord]) {
      return {
        pronunciation: FR_LEXICON[lowerWord].ipa,
        definition: FR_LEXICON[lowerWord].def,
        source: 'Lexique Français'
      };
    }
    if (deck === 'italiano' && IT_LEXICON[lowerWord]) {
      return {
        pronunciation: IT_LEXICON[lowerWord].ipa,
        definition: IT_LEXICON[lowerWord].def,
        source: 'Lessico Italiano'
      };
    }
    if (deck.startsWith('mandarin') && ZH_PHRASE_LEXICON[cleanWord]) {
      return {
        pronunciation: ZH_PHRASE_LEXICON[cleanWord].zhuyin,
        definition: ZH_PHRASE_LEXICON[cleanWord].def,
        source: 'Mandarin Lexicon'
      };
    }

    // 3. Try live online Wiktionary CORS lookup
    if (deck === 'français') {
      const online = await lookupFrenchOnline(cleanWord);
      const ipa = online?.ipa || frenchPhraseToIPA(cleanWord);
      const def = online?.def || '';
      return {
        pronunciation: ipa,
        definition: def,
        source: online?.def ? 'Wiktionnaire (FR)' : 'Phonétique FR'
      };
    }

    if (deck === 'italiano') {
      const online = await lookupItalianOnline(cleanWord);
      const ipa = online?.ipa || italianPhraseToIPA(cleanWord);
      const def = online?.def || '';
      return {
        pronunciation: ipa,
        definition: def,
        source: online?.def ? 'Wikizionario (IT)' : 'Fonetica IT'
      };
    }

    if (deck.startsWith('mandarin')) {
      const online = await lookupMandarinOnline(cleanWord);
      const offline = lookupMandarinOffline(cleanWord);
      return {
        pronunciation: online?.zhuyin || offline.pronunciation,
        definition: online?.def || offline.definition,
        source: online?.def ? 'Wiktionary (ZH)' : 'Zhuyin Engine'
      };
    }

    return { pronunciation: '', definition: '', source: 'manual' };
  }

  global.LexiPhonetics = {
    pinyinToZhuyin,
    frenchPhraseToIPA,
    italianPhraseToIPA,
    generatePronunciationAndDefinition
  };
})(window);
