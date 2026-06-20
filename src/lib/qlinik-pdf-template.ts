// ---------------------------------------------------------------------------
// Qlinik soru bankası PDF şablonu (saf, bağımsız HTML üreteci)
//
// Bu modül HİÇBİR bağımlılık kullanmaz ve HİÇBİR I/O yapmaz: tipli soru verisi
// + belge meta verisi alır, A4 dikey / print-PDF uyumlu, 2 sütun × 3 satır
// (sayfa başına min. 6 soru) kart düzeninde, kendi kendine yeten bir HTML
// belgesi döndürür. Logolar inline SVG'dir; dış görsel/font bağımlılığı yoktur.
//
// Tasarım referansı: Qlinik Tıp Soru Bankası şablonu (kompakt header, bilgi
// chip'leri, ince güvenlik barı, diagonal filigran, renkli ama sistematik
// kartlar, ince lacivert footer). Tüm alanlar dinamik veriden doldurulur —
// statik örnek/mock yoktur.
// ---------------------------------------------------------------------------

export type Discipline = "tip" | "dis" | "hemsirelik" | "vet" | "saglik";

/** Tek bir sorunun şablona girdi tipi (DB satırından eşlenir). */
export type QlinikQuestion = {
  id?: string;
  /** subject → Branş / Ders (kart konu etiketinin sol tarafı). */
  subject?: string | null;
  /** topic → Konu etiketi. */
  topic?: string | null;
  /** difficulty → zorluk noktaları (easy|medium|hard veya 1-3 / 1-5). */
  difficulty?: string | number | null;
  /** text → soru metni. */
  text?: string | null;
  /** options → A-E şıkları. */
  options?: unknown;
  /** correct_index → doğru şık (0 tabanlı). */
  correct_index?: number | null;
  /** explanation → açıklama alanı. */
  explanation?: string | null;
  /** option_rationales → şık analizi (varsa gösterilir). */
  option_rationales?: unknown;
  /** tags → soru tipi / yüksek verim / klinik odak vb. etiketler. */
  tags?: unknown;
  /** metadata.discipline → tıp/diş/hemşirelik şablon seçimi (opsiyonel override). */
  metadata?: Record<string, unknown> | null;
};

/** Belge başlığı / güvenlik / sayfalama meta verisi. */
export type QlinikDocumentMeta = {
  /** Şablon disiplini → başlık, branş rengi, ikon, konu dili. */
  discipline?: Discipline;
  /** "Qlinik Tıp Soru Bankası" başlığını override eder (opsiyonel). */
  titleOverride?: string;
  /** Header chip: Branş. Verilmezse ilk sorunun subject'i kullanılır. */
  branch?: string;
  /** Header chip: Konu. Verilmezse sorulardan türetilir. */
  topic?: string;
  /** Header chip + filigran: Kullanıcı adı soyadı (kişiye özel belge). */
  userName?: string;
  /** Header chip: Belge ID (kullanıcıya özel; doğrulama/izleme anahtarı). */
  documentId?: string;
  /** Header chip: Sınav (TUS/DUS vb.). */
  exam?: string;
  /** Header chip: Tarih / Saat. Verilmezse üretim anı kullanılır. */
  dateLabel?: string;
  /** Doğru cevapları ve açıklamaları göster (cevap anahtarlı çıktı). */
  withAnswers?: boolean;
  /** Filigranı tamamen kapat (varsayılan: açık, çok hafif). */
  noWatermark?: boolean;
};

type Theme = {
  /** Başlıktaki branş kelimesi: "Tıp", "Diş" ... */
  word: string;
  /** Ana lacivert (header / footer). */
  ink: string;
  /** Branş aksan rengi (numara rozeti, vurgular). */
  accent: string;
  /** İkincil aksan (chip kenarları, ışıltı). */
  accent2: string;
  /** Branş ikonu (inline SVG path veya emoji). */
  icon: string;
};

const THEMES: Record<Discipline, Theme> = {
  tip: { word: "Tıp", ink: "#0b1f4d", accent: "#2563eb", accent2: "#06b6d4", icon: "🩺" },
  dis: { word: "Diş", ink: "#0b1f4d", accent: "#7c3aed", accent2: "#06b6d4", icon: "🦷" },
  hemsirelik: {
    word: "Hemşirelik",
    ink: "#0b1f4d",
    accent: "#0d9488",
    accent2: "#22c55e",
    icon: "💉",
  },
  vet: { word: "Veteriner", ink: "#0b1f4d", accent: "#ea580c", accent2: "#f59e0b", icon: "🐾" },
  saglik: { word: "Sağlık", ink: "#0b1f4d", accent: "#2563eb", accent2: "#22c55e", icon: "⚕️" },
};

// Sayfa başına soru hedefi: 2 sütun × 3 satır.
const PER_PAGE = 6;
// Açıklama alanı bu satır sayısını aşarsa kart içinde kırpılır ve tam metin
// "Detaylı Açıklamalar" ekine taşınır (layout kuralı 1 & 2).
const EXPLANATION_CLAMP_LINES = 10;
// Soru metni bu uzunluğu aşarsa kart kompakt fonta düşer (kuralı 7).
const LONG_TEXT_THRESHOLD = 320;

// --------------------------------------------------------------------------
// Yardımcılar
// --------------------------------------------------------------------------

function esc(value: unknown): string {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}

// Türkçe büyük/küçük harf güvenli eşleştirme: "İ".toLowerCase() → "i̇" (i +
// birleşik nokta) olduğu için ham regex "değildir" gibi kalıpları kaçırır.
// NFKD ile ayrıştırıp birleşik işaretleri (ve breve/cedilla) düşürerek
// ASCII-katlanmış forma indirgeriz: DEĞİLDİR → degildir, GÖRSELLİ → gorselli.
function normalizeForMatch(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => (typeof v === "string" ? v : v == null ? "" : String(v)));
}

/** option_rationales çeşitli şekillerde gelebilir: string[], {A:..} veya {0:..}. */
function rationaleFor(rationales: unknown, index: number, optionCount: number): string | null {
  if (rationales == null) return null;
  if (Array.isArray(rationales)) {
    const v = rationales[index];
    return v == null || v === "" ? null : String(v);
  }
  if (typeof rationales === "object") {
    const obj = rationales as Record<string, unknown>;
    const letter = String.fromCharCode(65 + index);
    const candidate = obj[letter] ?? obj[letter.toLowerCase()] ?? obj[String(index)];
    return candidate == null || candidate === "" ? null : String(candidate);
  }
  void optionCount;
  return null;
}

function hasAnyRationale(rationales: unknown, optionCount: number): boolean {
  for (let i = 0; i < optionCount; i++) {
    if (rationaleFor(rationales, i, optionCount)) return true;
  }
  return false;
}

/** difficulty → 1-3 dolu nokta (kolay/orta/zor). */
function difficultyDots(difficulty: unknown): number {
  if (typeof difficulty === "number") {
    if (difficulty <= 1) return 1;
    if (difficulty >= 5) return 3;
    if (difficulty >= 4) return 3;
    if (difficulty <= 2) return 1;
    return 2;
  }
  const s = String(difficulty ?? "")
    .toLowerCase()
    .trim();
  if (["1", "easy", "kolay", "basit"].includes(s)) return 1;
  if (["3", "4", "5", "hard", "zor", "ileri", "uzman"].includes(s)) return 3;
  return 2; // medium/orta/varsayılan
}

/** tags / metadata.type → soru tipi etiketi (Kısa Soru / Vaka Sorusu / Görselli Soru). */
function questionTypeLabel(q: QlinikQuestion): string {
  const tags = asStringArray(q.tags).map(normalizeForMatch);
  const metaType = normalizeForMatch(q.metadata?.["type"] ?? q.metadata?.["question_type"]);
  const haystack = [...tags, metaType].join(" ");
  if (/vaka|case|klinik\s*senaryo|scenario/.test(haystack)) return "Vaka Sorusu";
  if (/gorsel|image|radyoloj|sekil|visual|grafik/.test(haystack)) return "Görselli Soru";
  return "Kısa Soru";
}

/** "yanlıştır / değildir / hariç" tipi sorular doğru şıkkı kırmızı vurgular. */
function isNegativeStem(text: unknown): boolean {
  // ASCII-katlanmış kalıplar (normalizeForMatch sonrası): degildir, yanlis, haric…
  return /yanlis|degildir|hangisi degil|haric|olmaz|beklenmez|kontrendike|sayilamaz/.test(
    normalizeForMatch(text),
  );
}

function clampLines(text: string): { html: string; truncated: boolean } {
  // Kabaca satır tahmini: ~62 karakter/satır. 10 satırı aşarsa kırp.
  const approxLines = Math.ceil(text.length / 62) + (text.match(/\n/g)?.length ?? 0);
  if (approxLines <= EXPLANATION_CLAMP_LINES) return { html: esc(text), truncated: false };
  const limit = EXPLANATION_CLAMP_LINES * 62;
  const cut = text.slice(0, limit).replace(/\s+\S*$/, "");
  return { html: esc(cut) + "…", truncated: true };
}

// --------------------------------------------------------------------------
// SVG markalar (kendi kendine yeten — dış asset yok)
// --------------------------------------------------------------------------

function qlinikLogo(accent: string, accent2: string): string {
  return `<svg viewBox="0 0 40 40" width="26" height="26" aria-hidden="true">
    <defs><linearGradient id="qg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${accent}"/><stop offset="1" stop-color="${accent2}"/>
    </linearGradient></defs>
    <circle cx="20" cy="20" r="14" fill="none" stroke="url(#qg)" stroke-width="4.5"/>
    <line x1="27" y1="27" x2="35" y2="35" stroke="url(#qg)" stroke-width="4.5" stroke-linecap="round"/>
    <circle cx="20" cy="20" r="4.2" fill="${accent2}"/>
  </svg>`;
}

function medasiLogo(color: string): string {
  return `<svg viewBox="0 0 44 40" width="22" height="20" aria-hidden="true">
    <path d="M22 36 C2 22 6 6 16 6 C20 6 22 9 22 12 C22 9 24 6 28 6 C38 6 42 22 22 36 Z"
      fill="${color}"/>
  </svg>`;
}

// --------------------------------------------------------------------------
// Kart üreteci
// --------------------------------------------------------------------------

type RenderedCard = {
  html: string;
  /** Kırpıldıysa ekte gösterilecek tam açıklama (yoksa null). */
  overflow: { number: number; subject: string; topic: string; text: string } | null;
};

function renderCard(
  q: QlinikQuestion,
  number: number,
  theme: Theme,
  meta: QlinikDocumentMeta,
): RenderedCard {
  const options = asStringArray(q.options);
  const correct = Number(q.correct_index ?? -1);
  const showAnswers = meta.withAnswers !== false;
  const negative = isNegativeStem(q.text);

  const typeLabel = questionTypeLabel(q);
  const dots = difficultyDots(q.difficulty);
  const topicTag = [q.subject, q.topic].filter(Boolean).join(" • ") || theme.word;

  const text = String(q.text ?? "");
  const longText = text.length > LONG_TEXT_THRESHOLD;

  const dotsHtml = [0, 1, 2]
    .map((i) => `<span class="dot${i < dots ? " on" : ""}"></span>`)
    .join("");

  const optionsHtml = options
    .map((opt, j) => {
      const letter = String.fromCharCode(65 + j);
      const isCorrect = showAnswers && j === correct;
      const cls = isCorrect ? (negative ? "opt correct neg" : "opt correct") : "opt";
      const check = isCorrect ? `<span class="check">${negative ? "✕" : "✓"}</span>` : "";
      return `<div class="${cls}"><span class="ol">${letter}</span><span class="ot">${esc(opt)}</span>${check}</div>`;
    })
    .join("");

  // Açıklama (koşullu) — kuralı 4/5/6: yoksa tamamen gizle.
  let explanationHtml = "";
  let overflow: RenderedCard["overflow"] = null;
  if (showAnswers && q.explanation && String(q.explanation).trim()) {
    const { html, truncated } = clampLines(String(q.explanation).trim());
    const tail = truncated ? `<span class="cont">→ Detaylı açıklama ekte</span>` : "";
    explanationHtml = `<div class="exp"><span class="ei">💡</span><div class="et">${html}${tail}</div></div>`;
    if (truncated) {
      overflow = {
        number,
        subject: String(q.subject ?? ""),
        topic: String(q.topic ?? ""),
        text: String(q.explanation).trim(),
      };
    }
  }

  // Şık analizi (koşullu) — option_rationales varsa göster, yoksa gizle.
  let rationaleHtml = "";
  if (showAnswers && hasAnyRationale(q.option_rationales, options.length)) {
    const rows = options
      .map((_, j) => {
        const r = rationaleFor(q.option_rationales, j, options.length);
        if (!r) return "";
        const letter = String.fromCharCode(65 + j);
        const ok = j === correct;
        return `<div class="ra-row"><span class="ra-l${ok ? " ok" : ""}">${letter}</span><span class="ra-t">${esc(r)}</span></div>`;
      })
      .filter(Boolean)
      .join("");
    rationaleHtml = `<div class="rationale"><div class="ra-head">📋 Şık Analizi</div>${rows}</div>`;
  }

  const html = `<article class="card${longText ? " compact" : ""}">
    <header class="c-head">
      <span class="c-num">${number}</span>
      <span class="c-type">${esc(typeLabel)}</span>
      <span class="c-diff"><span class="c-diff-lbl">Zorluk</span>${dotsHtml}</span>
      <span class="c-topic">${esc(topicTag)}</span>
    </header>
    <div class="c-text">${esc(text)}</div>
    <div class="c-opts">${optionsHtml}</div>
    ${explanationHtml}
    ${rationaleHtml}
  </article>`;

  return { html, overflow };
}

// --------------------------------------------------------------------------
// CSS
// --------------------------------------------------------------------------

function styles(theme: Theme): string {
  return `
  :root {
    --ink: ${theme.ink};
    --accent: ${theme.accent};
    --accent2: ${theme.accent2};
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    font-family: "Inter", "Segoe UI", -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    color: #1a2236; -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  @page { size: A4 portrait; margin: 0; }

  .page {
    position: relative;
    width: 210mm; min-height: 297mm; height: 297mm;
    padding: 8mm 8mm 0;
    display: flex; flex-direction: column;
    background: #fff; overflow: hidden;
    page-break-after: always; break-after: page;
  }
  .page:last-child { page-break-after: auto; break-after: auto; }

  /* ---- Filigran ---- */
  .watermark {
    position: absolute; inset: 0; z-index: 0; pointer-events: none;
    overflow: hidden; opacity: 0.05;
  }
  .watermark div {
    position: absolute; top: 50%; left: 50%;
    transform: translate(-50%, -50%) rotate(-32deg);
    white-space: nowrap; font-size: 30px; font-weight: 800; letter-spacing: 3px;
    color: var(--ink); line-height: 2.9;
  }
  .watermark span { display: block; }

  /* ---- Header ---- */
  .head {
    position: relative; z-index: 2;
    display: flex; align-items: center; justify-content: space-between;
    border-bottom: 2px solid var(--ink); padding-bottom: 5px;
  }
  .brand { display: flex; align-items: center; gap: 6px; }
  .brand .name { font-size: 17px; font-weight: 800; color: var(--ink); letter-spacing: -.3px; }
  .head-title { font-size: 16px; font-weight: 800; color: var(--ink); text-align: center; }
  .powered { text-align: right; line-height: 1.1; }
  .powered .lbl { font-size: 7px; font-weight: 700; color: #8a94a6; text-transform: uppercase; letter-spacing: 1px; }
  .powered .mname { display: flex; align-items: center; gap: 4px; justify-content: flex-end; font-size: 13px; font-weight: 800; color: var(--ink); }

  /* ---- Meta chip satırı ---- */
  .meta {
    position: relative; z-index: 2;
    display: flex; flex-wrap: wrap; gap: 4px 6px; margin-top: 5px;
  }
  .chip {
    display: inline-flex; align-items: baseline; gap: 4px;
    background: #f3f6fc; border: 1px solid #e2e8f5; border-radius: 5px;
    padding: 2px 7px; font-size: 8.5px;
  }
  .chip b { color: var(--accent); font-weight: 700; text-transform: uppercase; letter-spacing: .3px; font-size: 7.5px; }
  .chip span { color: #2a3146; font-weight: 600; }

  /* ---- Güvenlik barı ---- */
  .secbar {
    position: relative; z-index: 2; margin-top: 5px;
    background: var(--ink); color: #dfe7fb;
    border-radius: 5px; padding: 3px 0;
    text-align: center; font-size: 9px; font-weight: 600; letter-spacing: .3px;
  }

  /* ---- Grid ---- */
  .grid {
    position: relative; z-index: 2; flex: 1; min-height: 0;
    display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: repeat(3, 1fr);
    gap: 5px; margin: 6px 0;
  }

  /* ---- Kart ---- */
  .card {
    border: 1px solid #dbe3f2; border-radius: 9px; padding: 7px 9px;
    display: flex; flex-direction: column; gap: 4px; overflow: hidden;
    background: #fff;
  }
  .card.compact { font-size: 9px; }
  .c-head { display: flex; align-items: center; gap: 6px; }
  .c-num {
    flex: 0 0 auto; width: 19px; height: 19px; border-radius: 5px;
    background: var(--ink); color: #fff; font-weight: 800; font-size: 11px;
    display: flex; align-items: center; justify-content: center;
  }
  .c-type {
    background: #eef3fc; color: var(--accent); border: 1px solid #d7e2f7;
    border-radius: 4px; padding: 1px 6px; font-size: 8px; font-weight: 700;
  }
  .c-diff { display: flex; align-items: center; gap: 3px; margin-left: auto; }
  .c-diff-lbl { font-size: 7.5px; color: #8a94a6; font-weight: 700; text-transform: uppercase; }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: #e0e6f1; }
  .dot.on { background: var(--accent2); }
  .c-topic {
    background: #f4f1fe; color: #6b46c1; border: 1px solid #e7e0fb;
    border-radius: 4px; padding: 1px 6px; font-size: 8px; font-weight: 700;
    max-width: 42%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .c-text {
    font-weight: 600; font-size: 10.5px; line-height: 1.32; color: #18203a;
    border: 1px solid #e8edf7; border-radius: 6px; padding: 5px 7px; background: #fbfcfe;
  }
  .card.compact .c-text { font-size: 9px; line-height: 1.25; padding: 4px 6px; }

  .c-opts { display: flex; flex-direction: column; gap: 2px; }
  .opt { display: flex; align-items: flex-start; gap: 6px; font-size: 9.5px; line-height: 1.25; padding: 1.5px 4px; border-radius: 5px; }
  .card.compact .opt { font-size: 8.5px; }
  .opt .ol {
    flex: 0 0 auto; width: 14px; height: 14px; border-radius: 3px;
    background: #eef2f9; color: #46506a; font-weight: 800; font-size: 8.5px;
    display: flex; align-items: center; justify-content: center; margin-top: .5px;
  }
  .opt .ot { flex: 1; }
  .opt.correct { background: #e7f7ec; border: 1px solid #b6e6c4; }
  .opt.correct .ol { background: #16a34a; color: #fff; }
  .opt.correct .ot { color: #14702f; font-weight: 700; }
  .opt.correct.neg { background: #fdecec; border-color: #f4b9b9; }
  .opt.correct.neg .ol { background: #dc2626; }
  .opt.correct.neg .ot { color: #a31313; }
  .opt .check { color: #16a34a; font-weight: 900; font-size: 11px; }
  .opt.correct.neg .check { color: #dc2626; }

  .exp {
    display: flex; gap: 5px; align-items: flex-start;
    background: #f1faf2; border: 1px dashed #b9e0c2; border-radius: 6px;
    padding: 5px 7px; font-size: 8.8px; line-height: 1.3; color: #2f4733;
  }
  .exp .ei { flex: 0 0 auto; }
  .exp .et { flex: 1; }
  .exp .cont { color: var(--accent); font-weight: 700; margin-left: 4px; white-space: nowrap; }

  .rationale {
    background: #f2f6fd; border: 1px solid #d9e4f8; border-radius: 6px;
    padding: 5px 7px; display: flex; flex-direction: column; gap: 2px;
  }
  .ra-head { font-size: 8.5px; font-weight: 800; color: var(--accent); }
  .ra-row { display: flex; gap: 5px; font-size: 8.4px; line-height: 1.25; color: #33405c; }
  .ra-l {
    flex: 0 0 auto; width: 12px; height: 12px; border-radius: 3px;
    background: #e1e9f7; color: #46506a; font-weight: 800; font-size: 7.5px;
    display: flex; align-items: center; justify-content: center;
  }
  .ra-l.ok { background: #16a34a; color: #fff; }
  .ra-t { flex: 1; }

  /* ---- Footer ---- */
  .foot {
    position: relative; z-index: 2; margin-top: auto;
    display: flex; align-items: center; justify-content: space-between;
    background: var(--ink); color: #dfe7fb;
    border-radius: 6px 6px 0 0; padding: 5px 12px; font-size: 9px;
  }
  .foot .f-left { display: flex; align-items: center; gap: 5px; font-weight: 800; }
  .foot .f-center { font-weight: 600; opacity: .92; }
  .foot .f-right { display: flex; align-items: center; gap: 5px; font-weight: 800; }

  /* ---- Detaylı açıklamalar eki ---- */
  .appendix { position: relative; z-index: 2; flex: 1; padding-top: 4px; }
  .appendix h2 { font-size: 13px; color: var(--ink); margin-bottom: 6px; }
  .ap-item { border: 1px solid #e3e9f5; border-radius: 7px; padding: 7px 9px; margin-bottom: 6px; page-break-inside: avoid; }
  .ap-item .ap-h { font-size: 9.5px; font-weight: 800; color: var(--accent); margin-bottom: 3px; }
  .ap-item .ap-b { font-size: 9.5px; line-height: 1.4; color: #2a3349; white-space: pre-wrap; }
  `;
}

// --------------------------------------------------------------------------
// Sayfa parçaları
// --------------------------------------------------------------------------

function watermarkBlock(meta: QlinikDocumentMeta): string {
  if (meta.noWatermark) return "";
  const name = (meta.userName ?? "").trim().toUpperCase();
  const line = [name || "KİŞİYE ÖZEL", "QLINIK", "MEDASI", "KİŞİYE ÖZEL"].join(" • ");
  const rows = Array.from({ length: 9 }, () => `<span>${esc(line)}</span>`).join("");
  return `<div class="watermark"><div>${rows}</div></div>`;
}

function headerBlock(theme: Theme, meta: QlinikDocumentMeta): string {
  const title = meta.titleOverride ?? `Qlinik ${theme.word} Soru Bankası`;
  return `<div class="head">
    <div class="brand">${qlinikLogo(theme.accent, theme.accent2)}<span class="name">Qlinik</span></div>
    <div class="head-title">${esc(title)}</div>
    <div class="powered">
      <div class="lbl">Powered by</div>
      <div class="mname">${medasiLogo(theme.ink)}MEDASI</div>
    </div>
  </div>`;
}

function metaBlock(meta: QlinikDocumentMeta, pageNo: number, pageCount: number): string {
  const chips: Array<[string, string]> = [];
  if (meta.branch) chips.push(["Branş", meta.branch]);
  if (meta.topic) chips.push(["Konu", meta.topic]);
  if (meta.userName) chips.push(["Kullanıcı", meta.userName]);
  if (meta.documentId) chips.push(["Belge ID", meta.documentId]);
  if (meta.exam) chips.push(["Sınav", meta.exam]);
  chips.push([
    "Tarih / Saat",
    meta.dateLabel ??
      new Date().toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" }),
  ]);
  chips.push(["Sayfa", `${pageNo} / ${pageCount}`]);
  const html = chips
    .map(([k, v]) => `<span class="chip"><b>${esc(k)}</b><span>${esc(v)}</span></span>`)
    .join("");
  return `<div class="meta">${html}</div>`;
}

function securityBar(): string {
  return `<div class="secbar">🛡 Bu belge kişiye özeldir • izleme aktif</div>`;
}

function footerBlock(): string {
  return `<div class="foot">
    <div class="f-left">Qlinik</div>
    <div class="f-center">Qlinik bir Medasi teknolojisidir.</div>
    <div class="f-right">MEDASI</div>
  </div>`;
}

function appendixBlock(items: NonNullable<RenderedCard["overflow"]>[]): string {
  const rows = items
    .map(
      (it) =>
        `<div class="ap-item">
          <div class="ap-h">Soru ${it.number}${it.subject || it.topic ? " · " + esc([it.subject, it.topic].filter(Boolean).join(" • ")) : ""}</div>
          <div class="ap-b">${esc(it.text)}</div>
        </div>`,
    )
    .join("");
  return `<div class="appendix"><h2>Detaylı Açıklamalar</h2>${rows}</div>`;
}

// --------------------------------------------------------------------------
// Ana giriş noktası
// --------------------------------------------------------------------------

/**
 * Tipli soru listesi + belge meta verisinden, A4 print/PDF uyumlu, kendi
 * kendine yeten tam HTML belgesi üretir. Bağımlılık yok; deterministik.
 * Sayfa başına 6 soru (2×3), dinamik kart yüksekliği, koşullu açıklama / şık
 * analizi, taşan açıklamalar için "Detaylı Açıklamalar" eki içerir.
 */
export function buildQlinikQuestionHtml(
  questions: QlinikQuestion[],
  meta: QlinikDocumentMeta = {},
): string {
  const discipline: Discipline =
    meta.discipline ?? (questions[0]?.metadata?.["discipline"] as Discipline | undefined) ?? "tip";
  const theme = THEMES[discipline] ?? THEMES.tip;

  // Header chip varsayılanlarını sorulardan türet.
  const resolvedMeta: QlinikDocumentMeta = {
    ...meta,
    discipline,
    branch: meta.branch ?? questions[0]?.subject ?? theme.word,
    topic:
      meta.topic ??
      (Array.from(new Set(questions.map((q) => q.topic).filter(Boolean)))
        .slice(0, 2)
        .join(", ") ||
        undefined),
  };

  // Kartları render et ve taşan açıklamaları topla.
  const overflowItems: NonNullable<RenderedCard["overflow"]>[] = [];
  const cards = questions.map((q, i) => {
    const rendered = renderCard(q, i + 1, theme, resolvedMeta);
    if (rendered.overflow) overflowItems.push(rendered.overflow);
    return rendered.html;
  });

  // 6'lı sayfalara böl (kuralı 8: kalanı sonraki sayfaya taşı).
  const pages: string[][] = [];
  for (let i = 0; i < cards.length; i += PER_PAGE) {
    pages.push(cards.slice(i, i + PER_PAGE));
  }
  if (pages.length === 0) pages.push([]);

  const hasAppendix = overflowItems.length > 0;
  const totalPages = pages.length + (hasAppendix ? 1 : 0);

  const watermark = watermarkBlock(resolvedMeta);

  const pageHtml = pages
    .map((cardSet, idx) => {
      // Son satırda boş hücre kalmasın diye eksikleri görünmez placeholder ile
      // doldurmuyoruz; grid 1fr satırları otomatik eşit dağıtır (kuralı 10:
      // son sayfada 6'dan az soru varsa kartlar satırları eşit paylaşır).
      return `<section class="page">
        ${watermark}
        ${headerBlock(theme, resolvedMeta)}
        ${metaBlock(resolvedMeta, idx + 1, totalPages)}
        ${securityBar()}
        <div class="grid">${cardSet.join("")}</div>
        ${footerBlock()}
      </section>`;
    })
    .join("");

  const appendixHtml = hasAppendix
    ? `<section class="page">
        ${watermark}
        ${headerBlock(theme, resolvedMeta)}
        ${metaBlock(resolvedMeta, totalPages, totalPages)}
        ${securityBar()}
        ${appendixBlock(overflowItems)}
        ${footerBlock()}
      </section>`
    : "";

  const title = resolvedMeta.titleOverride ?? `Qlinik ${theme.word} Soru Bankası`;

  return `<!doctype html><html lang="tr"><head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <title>${esc(title)}</title>
    <style>${styles(theme)}</style>
  </head><body>${pageHtml}${appendixHtml}</body></html>`;
}
