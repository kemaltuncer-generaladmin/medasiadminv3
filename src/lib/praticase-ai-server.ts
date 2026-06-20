import { createServerFn } from "@tanstack/react-start";
import crypto from "node:crypto";
import { requireAdmin } from "@/integrations/supabase/admin-middleware";
import { aiGenerate } from "@/lib/ai-server";
import { adminRest } from "@/lib/admin-rest-server";

// ---------------------------------------------------------------------------
// PratiCase 5-modül OSCE vaka üretim hattı (v2 PratiCaseAIGeneration portu).
// Her modül sırayla üretilir (önceki modül bağlamı taşınır), normalize/validate
// edilir, sonra god_mode_upsert_generated_checklist RPC ile canlıya alınır.
// ---------------------------------------------------------------------------

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
type Obj = Record<string, Json>;

export type ModuleKey = "history" | "physical_exam" | "laboratory" | "imaging" | "diagnostic";

type ModuleConfig = {
  key: ModuleKey;
  displayName: string;
  sourceFormatFile: string;
  tableName: string;
  databaseContentType: string;
  requiredRootArrays: string[];
  primaryArrayKey: string;
  criticalArrayKeys: string[];
  wrapperKeys: string[];
  instruction: string;
  schema: string;
};

const HISTORY_SCHEMA = `{
  "diagnosisName": "", "course": "", "topic": "", "osceStationType": "",
  "caseAssumptions": {"defaultPatientAge": null, "defaultPatientSex": "", "defaultSetting": "", "presentationStyle": "", "mainComplaint": "", "openingStatement": "", "importantContextNotes": []},
  "historyScoring": {"totalTargetPoints": 100, "estimatedGeneratedPoints": 0, "criticalFailIfMissed": [], "mustAskItems": [], "highYieldItems": [], "commonMistakes": [], "commonUnnecessaryQuestions": []},
  "historyItems": [{"category": "", "subcategory": "", "key": "", "label": "", "questionIntent": "", "expectedQuestionExamples": [], "patientAnswer": "", "alternativePatientAnswers": [], "scorePoints": 0, "isRequired": true, "isCritical": false, "osceWeight": "", "findingType": "", "clinicalReason": "", "differentialValue": "", "relatedDifferentials": [], "answerInterpretation": "", "ifPositiveMeaning": "", "ifNegativeMeaning": "", "conditionalAppliesWhen": "", "sortOrder": 0}],
  "redFlags": [{"category": "red_flags", "key": "", "label": "", "questionIntent": "", "expectedQuestionExamples": [], "patientAnswer": "", "scorePoints": 0, "isRequired": true, "isCritical": true, "osceWeight": "must_ask", "findingType": "red_flag", "clinicalReason": "", "differentialValue": "", "relatedDifferentials": [], "sortOrder": 0}],
  "negativeFindings": [{"category": "", "key": "", "label": "", "questionIntent": "", "expectedQuestionExamples": [], "patientAnswer": "", "scorePoints": 0, "isRequired": true, "isCritical": false, "osceWeight": "", "findingType": "negative", "clinicalReason": "", "differentialValue": "", "relatedDifferentials": [], "sortOrder": 0}],
  "differentialDiagnosisQuestionMap": [{"differentialDiagnosis": "", "whyConsidered": "", "questionsToAsk": [], "expectedPatientAnswer": "", "supportsOrArguesAgainst": "", "mustNotMiss": false}],
  "conditionalHistoryBlocks": [{"condition": "", "appliesWhen": "", "items": []}],
  "databaseInsertHints": {"recommendedHistoryItemCount": 0, "recommendedRedFlagCount": 0, "recommendedNegativeFindingCount": 0, "recommendedDifferentialQuestionCount": 0, "suggestedCaseTags": []}
}`;

const PHYSICAL_SCHEMA = `{
  "diagnosisName": "", "course": "", "topic": "", "osceStationType": "",
  "caseAssumptions": {"defaultPatientAge": null, "defaultPatientSex": "", "defaultSetting": "", "presentationStyle": "", "mainComplaint": "", "openingStatement": "", "importantContextNotes": []},
  "physicalExamScoring": {"totalTargetPoints": 100, "estimatedGeneratedPoints": 0, "criticalFailIfMissed": [], "mustDoItems": [], "highYieldItems": [], "commonMistakes": [], "unsafeOrUnnecessaryExamActions": []},
  "physicalExamItems": [{"category": "", "subcategory": "", "key": "", "label": "", "examAction": "", "acceptableStudentPhrases": [], "finding": "", "alternativeFindings": [], "scorePoints": 0, "isRequired": true, "isCritical": false, "osceWeight": "", "findingType": "", "clinicalReason": "", "differentialValue": "", "relatedDifferentials": [], "findingInterpretation": "", "ifPositiveMeaning": "", "ifNegativeMeaning": "", "conditionalAppliesWhen": "", "sortOrder": 0}],
  "criticalFindings": [{"category": "critical_findings", "key": "", "label": "", "examAction": "", "acceptableStudentPhrases": [], "finding": "", "scorePoints": 0, "isRequired": true, "isCritical": true, "osceWeight": "must_do", "findingType": "red_flag", "clinicalReason": "", "differentialValue": "", "relatedDifferentials": [], "sortOrder": 0}],
  "negativeFindings": [{"category": "", "key": "", "label": "", "examAction": "", "acceptableStudentPhrases": [], "finding": "", "scorePoints": 0, "isRequired": true, "isCritical": false, "osceWeight": "", "findingType": "negative", "clinicalReason": "", "differentialValue": "", "relatedDifferentials": [], "sortOrder": 0}],
  "differentialExamMap": [{"differentialDiagnosis": "", "whyConsidered": "", "examActionsToPerform": [], "expectedFinding": "", "supportsOrArguesAgainst": "", "mustNotMiss": false}],
  "conditionalExamBlocks": [{"condition": "", "appliesWhen": "", "items": []}],
  "databaseInsertHints": {"recommendedPhysicalExamItemCount": 0, "recommendedCriticalFindingCount": 0, "recommendedNegativeFindingCount": 0, "recommendedDifferentialExamCount": 0, "suggestedCaseTags": []}
}`;

const LAB_SCHEMA = `{
  "diagnosisName": "", "course": "", "topic": "", "osceStationType": "",
  "caseAssumptions": {"defaultPatientAge": null, "defaultPatientSex": "", "defaultSetting": "", "mainComplaint": "", "preTestClinicalSuspicion": "", "importantContextNotes": []},
  "testScoring": {"totalTargetPoints": 100, "estimatedGeneratedPoints": 0, "criticalFailIfMissed": [], "mustOrderTests": [], "highYieldTests": [], "commonUnnecessaryTests": [], "dangerousDelayingTests": []},
  "laboratoryItems": [{"category": "", "subcategory": "", "key": "", "testName": "", "label": "", "orderIntent": "", "expectedOrderExamples": [], "resultText": "", "resultJson": {}, "normalRange": "", "scorePoints": 0, "penaltyPoints": 0, "isRequired": true, "isCritical": false, "osceWeight": "", "relevance": "", "timing": "", "clinicalReason": "", "differentialValue": "", "relatedDifferentials": [], "interpretation": "", "ifAbnormalMeaning": "", "ifNormalMeaning": "", "conditionalAppliesWhen": "", "sortOrder": 0}],
  "imagingItems": [],
  "bedsideTests": [{"category": "bedside_test", "subcategory": "", "key": "", "testName": "", "label": "", "expectedOrderExamples": [], "resultText": "", "scorePoints": 0, "penaltyPoints": 0, "isRequired": true, "isCritical": false, "osceWeight": "", "relevance": "", "timing": "", "clinicalReason": "", "differentialValue": "", "relatedDifferentials": [], "interpretation": "", "conditionalAppliesWhen": "", "sortOrder": 0}],
  "microbiologyPathologyTests": [{"category": "microbiology_or_pathology", "subcategory": "", "key": "", "testName": "", "label": "", "expectedOrderExamples": [], "resultText": "", "scorePoints": 0, "penaltyPoints": 0, "isRequired": false, "isCritical": false, "osceWeight": "", "relevance": "", "timing": "", "clinicalReason": "", "differentialValue": "", "relatedDifferentials": [], "interpretation": "", "conditionalAppliesWhen": "", "sortOrder": 0}],
  "unnecessaryOrHarmfulTests": [{"category": "unnecessary_or_harmful", "key": "", "testName": "", "label": "", "whyUnnecessary": "", "penaltyPoints": 0, "relevance": "unnecessary", "dangerLevel": "", "commonMistakeReason": "", "sortOrder": 0}],
  "differentialDiagnosisTestMap": [{"differentialDiagnosis": "", "whyConsidered": "", "testsToOrder": [], "expectedResults": "", "supportsOrArguesAgainst": "", "mustNotMiss": false}],
  "conditionalTestBlocks": [{"condition": "", "appliesWhen": "", "items": []}],
  "databaseInsertHints": {"recommendedLaboratoryItemCount": 0, "recommendedImagingItemCount": 0, "recommendedBedsideTestCount": 0, "recommendedMicrobiologyPathologyCount": 0, "recommendedUnnecessaryTestCount": 0, "recommendedDifferentialTestMapCount": 0, "suggestedCaseTags": []}
}`;

const IMAGING_SCHEMA = `{
  "diagnosisName": "", "course": "", "topic": "", "osceStationType": "",
  "caseAssumptions": {"defaultPatientAge": null, "defaultPatientSex": "", "defaultSetting": "", "mainComplaint": "", "imagingDecisionContext": "", "importantSafetyNotes": []},
  "imagingScoring": {"totalTargetPoints": 100, "estimatedGeneratedPoints": 0, "criticalFailIfMissed": [], "mustOrderImaging": [], "highYieldImaging": [], "commonMistakes": [], "unnecessaryOrHarmfulImaging": []},
  "imagingItems": [{"category": "", "subcategory": "", "key": "", "label": "", "imagingName": "", "imagingType": "", "whenToOrder": "", "expectedOrderPhraseExamples": [], "expectedResult": "", "normalOrAbnormal": "", "scorePoints": 0, "isRequired": true, "isCritical": false, "osceWeight": "", "findingType": "", "clinicalReason": "", "differentialValue": "", "relatedDifferentials": [], "interpretationExpectedFromStudent": "", "ifPositiveMeaning": "", "ifNegativeMeaning": "", "radiationConcern": "", "contrastConcern": "", "pregnancySafety": "", "pediatricSafety": "", "sortOrder": 0}],
  "negativeOrNormalImagingFindings": [{"category": "", "key": "", "label": "", "imagingName": "", "expectedResult": "", "scorePoints": 0, "isRequired": true, "isCritical": false, "osceWeight": "", "findingType": "negative", "clinicalReason": "", "differentialValue": "", "relatedDifferentials": [], "sortOrder": 0}],
  "redFlagImaging": [{"category": "red_flag_imaging", "key": "", "label": "", "imagingName": "", "whenToOrder": "", "expectedResult": "", "scorePoints": 0, "isRequired": true, "isCritical": true, "osceWeight": "must_order", "findingType": "red_flag", "clinicalReason": "", "differentialValue": "", "relatedDifferentials": [], "sortOrder": 0}],
  "unnecessaryImaging": [{"category": "unnecessary_imaging", "key": "", "label": "", "imagingName": "", "whyUnnecessary": "", "possibleHarm": "", "penaltyPoints": 0, "avoidUnless": "", "sortOrder": 0}],
  "differentialDiagnosisImagingMap": [{"differentialDiagnosis": "", "whyConsidered": "", "imagingToConsider": [], "expectedResultInThisCase": "", "supportsOrArguesAgainst": "", "mustNotMiss": false}],
  "conditionalImagingBlocks": [{"condition": "", "appliesWhen": "", "items": []}],
  "mustOrderSummary": [], "mustAvoidSummary": [],
  "databaseInsertHints": {"recommendedImagingItemCount": 0, "recommendedRedFlagImagingCount": 0, "recommendedNegativeFindingCount": 0, "recommendedUnnecessaryImagingCount": 0, "recommendedDifferentialImagingMapCount": 0, "suggestedCaseTags": []}
}`;

const DIAGNOSTIC_SCHEMA = `{
  "diagnosisName": "", "course": "", "topic": "", "osceStationType": "",
  "caseAssumptions": {"defaultPatientAge": null, "defaultPatientSex": "", "defaultSetting": "", "mainComplaint": "", "diagnosticDecisionContext": "", "importantContextNotes": []},
  "diagnosticScoring": {"totalTargetPoints": 100, "estimatedGeneratedPoints": 0, "minimumExpectedDifferentials": 3, "idealExpectedDifferentials": 6, "criticalFailIfMissed": [], "mustMentionDiagnoses": [], "highYieldDifferentials": [], "commonMistakes": [], "unsafeOrIrrelevantDiagnoses": []},
  "primaryDiagnosis": {"key": "", "diagnosisName": "", "label": "", "expectedRank": 1, "diagnosisRole": "primary", "mustNotMiss": true, "scorePoints": 0, "isRequired": true, "isCritical": true, "osceWeight": "must_mention", "clinicalReason": "", "supportingClues": [], "featuresAgainst": [], "commonStudentWording": [], "acceptedSynonyms": [], "sortOrder": 1},
  "differentialDiagnoses": [{"key": "", "diagnosisName": "", "label": "", "expectedRankRange": "", "diagnosisRole": "", "mustNotMiss": false, "scorePoints": 0, "isRequired": true, "isCritical": false, "osceWeight": "", "urgencyLevel": "", "likelihoodInThisCase": "", "clinicalReason": "", "supportingClues": [], "featuresAgainst": [], "howToDifferentiateConceptually": "", "commonStudentWording": [], "acceptedSynonyms": [], "relatedSpecialty": "", "sortOrder": 0}],
  "mustNotMissDiagnoses": [{"key": "", "diagnosisName": "", "label": "", "whyMustNotMiss": "", "urgencyLevel": "", "scorePoints": 0, "isCritical": true, "clinicalReason": "", "supportingClues": [], "featuresAgainst": [], "sortOrder": 0}],
  "exclusionDiagnoses": [{"key": "", "diagnosisName": "", "label": "", "whyConsidered": "", "whyLessLikelyHere": "", "scorePoints": 0, "osceWeight": "", "clinicalReason": "", "sortOrder": 0}],
  "unsafeOrIrrelevantDiagnoses": [{"key": "", "diagnosisName": "", "label": "", "whyUnsafeOrIrrelevant": "", "penaltyPoints": 0, "avoidUnless": "", "sortOrder": 0}],
  "rankingRubric": [{"key": "", "label": "", "expectedStudentAction": "", "scorePoints": 0, "penaltyIfMissed": 0, "clinicalReason": "", "sortOrder": 0}],
  "diagnosticReasoningItems": [{"key": "", "label": "", "expectedReasoning": "", "scorePoints": 0, "isRequired": true, "isCritical": false, "clinicalReason": "", "sortOrder": 0}],
  "conditionalDiagnosticBlocks": [{"condition": "", "appliesWhen": "", "items": []}],
  "expectedStudentAnswerExamples": [{"qualityLevel": "", "exampleAnswer": "", "scoreExpectation": "", "whyThisScore": ""}],
  "mustMentionSummary": [], "mustNotMissSummary": [],
  "databaseInsertHints": {"recommendedDifferentialDiagnosisCount": 0, "recommendedMustNotMissCount": 0, "recommendedExclusionDiagnosisCount": 0, "recommendedUnsafeDiagnosisCount": 0, "suggestedCaseTags": []}
}`;

export const MODULES: ModuleConfig[] = [
  {
    key: "history",
    displayName: "Anamnez",
    sourceFormatFile: "anamnezjsonformatı.json",
    tableName: "praticase_history_checklists",
    databaseContentType: "history",
    requiredRootArrays: [
      "historyItems",
      "redFlags",
      "negativeFindings",
      "differentialDiagnosisQuestionMap",
    ],
    primaryArrayKey: "historyItems",
    criticalArrayKeys: ["redFlags"],
    wrapperKeys: ["history", "anamnez", "anamnesis", "historyChecklist"],
    instruction: `Sadece anamnez içeriği üret. Empati, kendini tanıtma, mahremiyet, göz teması, aktif dinleme gibi iletişim maddeleri yazma. Tedavi, fizik muayene, tetkik veya yönetim maddesi üretme. En az 50 historyItems, en az 8 redFlags, en az 12 negativeFindings ve en az 8 differentialDiagnosisQuestionMap üret. Hasta cevapları hasta diliyle kısa ve gerçekçi olsun. scorePoints toplamı yaklaşık 100 olsun. osceWeight değerleri: must_ask, high_yield, standard, supportive, background. findingType değerleri: positive, negative, red_flag, risk_factor, exclusion, background, conditional.`,
    schema: HISTORY_SCHEMA,
  },
  {
    key: "physical_exam",
    displayName: "Fizik muayene",
    sourceFormatFile: "fizikmuayenejsonformatı.json",
    tableName: "praticase_physical_exam_checklists",
    databaseContentType: "physicalExam",
    requiredRootArrays: [
      "physicalExamItems",
      "criticalFindings",
      "negativeFindings",
      "differentialExamMap",
    ],
    primaryArrayKey: "physicalExamItems",
    criticalArrayKeys: ["criticalFindings"],
    wrapperKeys: ["physical_exam", "physicalExam", "fizikMuayene", "physicalExamChecklist"],
    instruction: `Sadece fizik muayene checklist içeriği üret. Anamnez sorusu, tetkik isteme, tedavi/yönetim veya iletişim maddesi yazma. En az 30 physicalExamItems, en az 6 criticalFindings, en az 8 negativeFindings ve en az 6 differentialExamMap üret. Bulgular kısa klinik sonuç gibi olsun; öğrenci doğru muayene adımını söylerse finding alanı gösterilecek. scorePoints toplamı yaklaşık 100 olsun. osceWeight değerleri: must_do, high_yield, standard, supportive, background. findingType değerleri: positive, negative, red_flag, risk_factor, exclusion, background, conditional.`,
    schema: PHYSICAL_SCHEMA,
  },
  {
    key: "laboratory",
    displayName: "Laboratuvar",
    sourceFormatFile: "laboratuvarjsonformatı.json",
    tableName: "praticase_laboratory_checklists",
    databaseContentType: "laboratory",
    requiredRootArrays: [
      "laboratoryItems",
      "unnecessaryOrHarmfulTests",
      "differentialDiagnosisTestMap",
    ],
    primaryArrayKey: "laboratoryItems",
    criticalArrayKeys: ["unnecessaryOrHarmfulTests", "differentialDiagnosisTestMap"],
    wrapperKeys: ["laboratory", "lab", "laboratuvar", "testChecklist"],
    instruction: `Sadece laboratuvar, yatak başı test, mikrobiyoloji/patoloji ve tanısal tetkik içeriği üret. Anamnez, fizik muayene, tedavi veya yönetim maddesi yazma. En az 20 tetkik maddesi, en az 8 gerekli/yararlı tetkik, en az 8 gereksiz veya düşük öncelikli tetkik, en az 5 kritik tetkik ve en az 5 ayırıcı tanıya yönelik test haritası üret. Gereksiz/zararlı tetkikleri penaltyPoints ve relevance ile işaretle. resultText sınavda verilecek sonuç gibi kısa olsun.`,
    schema: LAB_SCHEMA,
  },
  {
    key: "imaging",
    displayName: "Görüntüleme",
    sourceFormatFile: "görüntülemejsonformatı.json",
    tableName: "praticase_imaging_checklists",
    databaseContentType: "imaging",
    requiredRootArrays: [
      "imagingItems",
      "redFlagImaging",
      "unnecessaryImaging",
      "differentialDiagnosisImagingMap",
    ],
    primaryArrayKey: "imagingItems",
    criticalArrayKeys: ["redFlagImaging", "unnecessaryImaging"],
    wrapperKeys: ["imaging", "goruntuleme", "görüntüleme", "imagingChecklist"],
    instruction: `Sadece görüntüleme isteme ve görüntüleme sonucu yorumlama içeriği üret. Laboratuvar, anamnez, fizik muayene, tedavi veya cerrahi karar detayı yazma. İlk basamak, acil, destekleyici, ayırıcı tanıyı dışlayan ve gereksiz/zararlı görüntülemeleri ayır. En az 8-15 imagingItems üret; redFlagImaging, unnecessaryImaging ve differentialDiagnosisImagingMap alanlarını doldur. Gebelik, pediatri, kontrast ve radyasyon güvenliğini gerektiğinde açık belirt.`,
    schema: IMAGING_SCHEMA,
  },
  {
    key: "diagnostic",
    displayName: "Ön tanı / ayırıcı tanı",
    sourceFormatFile: "ontaniayiricitanijsonformatı.json",
    tableName: "praticase_diagnostic_checklists",
    databaseContentType: "differentialDiagnosis",
    requiredRootArrays: [
      "differentialDiagnoses",
      "mustNotMissDiagnoses",
      "rankingRubric",
      "diagnosticReasoningItems",
    ],
    primaryArrayKey: "differentialDiagnoses",
    criticalArrayKeys: ["mustNotMissDiagnoses", "diagnosticReasoningItems"],
    wrapperKeys: ["diagnostic", "differentialDiagnosis", "onTani", "öntanı", "diagnosticChecklist"],
    instruction: `Sadece ön tanı ve ayırıcı tanı akıl yürütmesi üret. Anamnez, fizik muayene, laboratuvar, görüntüleme, tedavi veya ilaç dozu yazma. Birincil tanı net ve ilk sırada olsun. En az 8-12 differentialDiagnoses, en az 3-5 mustNotMissDiagnoses, exclusionDiagnoses, unsafeOrIrrelevantDiagnoses, rankingRubric ve diagnosticReasoningItems üret. Tanı sıralaması klinik öncelik ve aciliyet mantığına uygun olsun.`,
    schema: DIAGNOSTIC_SCHEMA,
  },
];

export function moduleSystemPrompt(key: ModuleKey): string {
  const m = MODULES.find((x) => x.key === key);
  return m ? systemPrompt(m) : "";
}

function systemPrompt(m: ModuleConfig): string {
  return `Sen PratiCase uygulamasına canlı vaka içeriği üreten kıdemli bir OSCE JSON üreticisisin.
Görevin sadece ${m.displayName} modülünü üretmektir.

ÇIKTI KİLİDİ:
- Sadece geçerli JSON nesnesi ver.
- Markdown, kod bloğu, açıklama, yorum, başlık veya JSON dışı tek karakter yazma.
- Trailing comma kullanma.
- Türkçe üret.
- Alan adlarını aşağıdaki şemaya uygun tut.
- PratiCase sınav motoru bu JSON'u doğrudan okuyacak; her madde puanlanabilir ve klinik olarak hedefli olmalı.

KAYNAK FORMAT DOSYASI: ${m.sourceFormatFile}
MODÜL TALİMATI:
${m.instruction}

ZORUNLU ÇIKTI ŞEMASI:
${m.schema}`;
}

function cleanJson(raw: string): string {
  let v = raw.trim();
  if (v.startsWith("```")) {
    v = v
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();
  }
  return v;
}

function asObject(value: Json | undefined): Obj | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Obj) : undefined;
}
function asArray(value: Json | undefined): Json[] | undefined {
  return Array.isArray(value) ? value : undefined;
}
function textValue(value: Json | undefined): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

function unwrap(obj: Obj, m: ModuleConfig): Obj {
  const payload = asObject(obj.payload);
  if (payload) return payload;
  const byKey = asObject(obj[m.key]);
  if (byKey) return unwrap(byKey, m);
  for (const k of m.wrapperKeys) {
    const nested = asObject(obj[k]);
    if (nested) return unwrap(nested, m);
  }
  return obj;
}

function validateModule(payload: Obj, m: ModuleConfig) {
  if (!(textValue(payload.diagnosisName) ?? "").trim())
    throw new Error(`${m.displayName}: diagnosisName boş`);
  if (!(textValue(payload.course) ?? "").trim()) throw new Error(`${m.displayName}: course boş`);
  for (const key of m.requiredRootArrays) {
    const arr = asArray(payload[key]);
    if (!arr || arr.length === 0) throw new Error(`${m.displayName}: ${key} boş veya eksik`);
  }
  if (m.key === "diagnostic" && payload.primaryDiagnosis == null)
    throw new Error(`${m.displayName}: primaryDiagnosis eksik`);
}

function continuityContext(prior: Array<{ key: ModuleKey; payload: Obj }>): string {
  if (prior.length === 0) return "Henüz önceki modül yok. Bu ilk modül vaka kimliğini kuracak.";
  const lines: string[] = [];
  for (const { key, payload } of prior) {
    const m = MODULES.find((x) => x.key === key);
    if (!m) continue;
    lines.push(`[${m.displayName}]`);
    const a = asObject(payload.caseAssumptions);
    if (a) {
      const push = (label: string, v: Json | undefined) => {
        const t = textValue(v)?.trim();
        if (t) lines.push(`- ${label}: ${t}`);
      };
      push("Ana şikayet", a.mainComplaint);
      push("Açılış ifadesi", a.openingStatement);
      push("Yaş", a.defaultPatientAge);
      push("Cinsiyet", a.defaultPatientSex);
      push("Ortam", a.defaultSetting);
    }
    const highlight = (title: string, arr: Json[] | undefined, limit: number) => {
      const labels = (arr ?? [])
        .slice(0, limit)
        .map((v) => {
          const o = asObject(v);
          if (!o) return textValue(v);
          return (
            textValue(o.label) ??
            textValue(o.testName) ??
            textValue(o.imagingName) ??
            textValue(o.diagnosisName) ??
            textValue(o.expectedReasoning)
          );
        })
        .filter(Boolean);
      if (labels.length) lines.push(`- ${title}: ${labels.join("; ")}`);
    };
    highlight("Pozitif/temel maddeler", asArray(payload[m.primaryArrayKey]), 6);
    for (const ck of m.criticalArrayKeys) {
      const arr = asArray(payload[ck]);
      if (arr?.length) {
        highlight("Kritik/kaçırılmaması gerekenler", arr, 4);
        break;
      }
    }
  }
  return lines.length
    ? lines.join("\n")
    : "Önceki modül var ancak özetlenebilir alan yok; yine de aynı tanı ve vaka adı korunacak.";
}

// --- Generate a single module (sequential, client-orchestrated) ---

function validateModuleInput(raw: unknown) {
  const i = (raw ?? {}) as Record<string, unknown>;
  const format = String(i.format) as ModuleKey;
  if (!MODULES.some((m) => m.key === format)) throw new Error("Geçersiz modül.");
  return {
    format,
    course: String(i.course ?? "Genel"),
    caseName: String(i.caseName ?? ""),
    diagnosisName: String(i.diagnosisName ?? ""),
    difficulty: ["Kolay", "Orta", "Zor"].includes(String(i.difficulty))
      ? String(i.difficulty)
      : "Orta",
    model: typeof i.model === "string" && i.model ? i.model : "gemini-2.5-flash",
    provider: i.provider === "openai" ? ("openai" as const) : ("vertex" as const),
    temperature: typeof i.temperature === "number" ? i.temperature : 0.3,
    systemOverride:
      typeof i.systemOverride === "string" && i.systemOverride.trim()
        ? i.systemOverride
        : undefined,
    prior: (Array.isArray(i.prior) ? i.prior : []) as Array<{ key: ModuleKey; payload: Obj }>,
  };
}

export const praticaseModuleFn = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(validateModuleInput)
  .handler(async ({ data }): Promise<{ key: ModuleKey; payload: Json }> => {
    const m = MODULES.find((x) => x.key === data.format)!;
    const diagnosis = data.diagnosisName.trim() || data.caseName.trim() || "Klinik olgu";
    const caseName = data.caseName.trim() || `${diagnosis} OSCE Vakası`;
    const user = `Tanı adı: ${diagnosis}
Vaka adı: ${caseName}
Branş / ders: ${data.course.trim() || "Genel"}
Zorluk: ${data.difficulty}
Önceki modül bağlamı:
${continuityContext(data.prior)}

Yukarıdaki tanıya göre sadece ${m.displayName} JSON nesnesini üret.
diagnosisName, course, topic ve caseAssumptions alanlarını bu vaka ile uyumlu doldur.
Önceki modül bağlamı boş değilse yeni bir vaka başlatma; aynı hastanın aynı başvuru öyküsünden devam et.
Hasta yaşı, cinsiyeti, ana şikayeti, ortamı, pozitif/negatif bulguları ve klinik öncelikleri önceki modüllerle çelişmeyecek şekilde koru.`;

    const raw = await aiGenerate(
      data.provider,
      data.systemOverride ?? systemPrompt(m),
      user,
      data.model,
      Math.min(1, Math.max(0, data.temperature)),
    );
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleanJson(raw));
    } catch {
      throw new Error(`${m.displayName} çıktısı geçerli JSON nesnesi değil.`);
    }
    const obj = asObject(parsed as Json);
    if (!obj) throw new Error(`${m.displayName} çıktısı JSON nesnesi değil.`);
    const payload = unwrap(obj, m);
    validateModule(payload, m);
    return { key: m.key, payload: payload as Json };
  });

// --- Publish package: god_mode_upsert_generated_checklist per module ---

function findCaseId(value: Json): string | undefined {
  if (Array.isArray(value)) {
    for (const v of value) {
      const id = findCaseId(v);
      if (id) return id;
    }
    return undefined;
  }
  if (value && typeof value === "object") {
    const o = value as Obj;
    for (const k of ["case_id", "caseId", "id"]) {
      if (typeof o[k] === "string") return o[k] as string;
    }
    if (o.god_mode_upsert_generated_checklist != null)
      return findCaseId(o.god_mode_upsert_generated_checklist);
  }
  return undefined;
}

function shouldFallback(message: string): boolean {
  return (
    message.includes("404") ||
    message.includes("PGRST202") ||
    message.includes("GOD_MODE_INVALID_ACTOR") ||
    /function/i.test(message)
  );
}

function validatePublishInput(raw: unknown) {
  const i = (raw ?? {}) as Record<string, unknown>;
  const modules = (Array.isArray(i.modules) ? i.modules : []) as Array<{
    key: ModuleKey;
    payload: Obj;
  }>;
  if (modules.length === 0) throw new Error("Yayınlanacak modül yok.");
  return {
    course: String(i.course ?? ""),
    caseName: String(i.caseName ?? ""),
    diagnosisName: String(i.diagnosisName ?? ""),
    difficulty: String(i.difficulty ?? "Orta"),
    model: String(i.model ?? "gemini-2.5-flash"),
    provider: i.provider === "openai" ? "openai" : i.provider === "gemini" ? "gemini" : "vertex_ai",
    modules,
  };
}

export const praticasePublishFn = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(validatePublishInput)
  .handler(
    async ({
      data,
    }): Promise<{
      caseId: string | null;
      title: string;
      healthStatus: string;
      missing: string[];
      isPublished: boolean;
      message: string;
    }> => {
      const actor = process.env.ADMIN_ACTOR_USER_ID ?? "";
      const generatedAt = new Date().toISOString();
      let caseId: string | null = null;

      for (const mod of data.modules) {
        const m = MODULES.find((x) => x.key === mod.key);
        if (!m) continue;
        const params = {
          p_content_type: m.key,
          p_id: null,
          p_course: data.course,
          p_case_name: data.caseName,
          p_difficulty: data.difficulty,
          p_diagnosis_name: data.diagnosisName,
          p_payload: mod.payload,
          p_ai_provider: data.provider,
          p_ai_model: data.model,
          p_source_format_file: m.sourceFormatFile,
          p_generated_at: generatedAt,
          p_actor_user_id: actor,
          p_request_id: crypto.randomUUID(),
          p_reason: "adminpanelv3_ai_case_generation",
        };
        try {
          const res = await adminRest({
            schema: "praticase",
            path: "rpc/god_mode_upsert_generated_checklist",
            method: "POST",
            body: params,
          });
          caseId = findCaseId(res.data) ?? caseId;
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          if (!shouldFallback(message)) throw e;
          const values = {
            course: data.course,
            case_name: data.caseName,
            difficulty: data.difficulty,
            diagnosis_name: data.diagnosisName,
            content_type: m.databaseContentType,
            payload: mod.payload,
            ai_provider: data.provider,
            ai_model: data.model,
            source_format_file: m.sourceFormatFile,
            generated_at: generatedAt,
          };
          const res = await adminRest({
            schema: "praticase",
            path: m.tableName,
            method: "POST",
            body: values,
          });
          caseId = findCaseId(res.data) ?? caseId;
        }
      }

      if (!caseId) {
        return {
          caseId: null,
          title: data.caseName,
          healthStatus: "fallback_inserted",
          missing: [],
          isPublished: false,
          message: `${data.caseName} eklendi (fallback) — yayın görünümü bulunamadı.`,
        };
      }

      const pub = await adminRest({
        schema: "praticase",
        path: "god_mode_case_publication_v",
        method: "GET",
        query: `case_id=eq.${caseId}&limit=1`,
      });
      const row = asArray(pub.data)?.[0] as Obj | undefined;
      const title = textValue(row?.title) ?? data.caseName;
      const healthStatus = textValue(row?.health_status) ?? "unknown";
      const missing = (asArray(row?.missing_content_types) ?? []).map((v) => String(v));
      const isPublished = row?.is_published === true;
      const message =
        isPublished && healthStatus === "healthy"
          ? `${title} canlıya alındı ✓`
          : missing.length === 0
            ? `${title} üretildi, durum: ${healthStatus}`
            : `${title} eksik modüllerle taslak kaldı: ${missing.join(", ")}`;
      return { caseId, title, healthStatus, missing, isPublished, message };
    },
  );
