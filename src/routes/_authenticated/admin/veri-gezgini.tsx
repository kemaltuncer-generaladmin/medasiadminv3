import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, SectionCard, EmptySchemaState } from "@/components/admin/shared";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table2, AlertTriangle } from "lucide-react";

const shortcuts: Record<string, string[]> = {
  public: [
    "profiles","store_products","purchases","wallet_entitlements","gift_codes","gift_code_redemptions",
    "ai_usage_events","questions","question_attempts","question_deliveries","user_solved_questions",
    "spot_facts","notification_messages","notification_deliveries","push_device_tokens",
    "admin_action_logs","medasi_learning_attempt_facts","medasi_learning_gap_rollups",
  ],
  sourcebase: [
    "courses","sections","drive_files","sources","decks","cards","generated_jobs","generated_outputs",
    "products","product_decks","purchases","entitlements","study_sessions","study_progress",
    "app_memberships","storage_roots","wallet_transactions","audit_logs",
  ],
  praticase: [
    "cases","home_banners","badge_definitions","support_topics","faq_items","announcements",
    "medication_infos","case_patient_response_rules","physical_exam_groups","physical_exam_options",
    "test_groups","test_options","diagnosis_options","management_plan_options","lab_result_details",
    "imaging_result_details","exam_sessions","exam_messages","session_physical_exam_findings",
    "session_requested_tests","session_diagnosis_answers","session_management_plan_items",
    "session_management_notes","session_result_summaries","user_dashboard_stats","user_case_progress",
    "user_bookmarked_cases","user_notes","contact_requests",
    "praticase_history_checklists","praticase_physical_exam_checklists",
    "praticase_laboratory_checklists","praticase_imaging_checklists","praticase_diagnostic_checklists",
  ],
};

export const Route = createFileRoute("/_authenticated/admin/veri-gezgini")({
  component: VeriGezgini,
});

function VeriGezgini() {
  const [schema, setSchema] = useState<keyof typeof shortcuts>("public");
  const [table, setTable] = useState<string>(shortcuts.public[0]);
  const [filter, setFilter] = useState("");
  const [limit, setLimit] = useState("100");

  return (
    <div className="space-y-6">
      <PageHeader title="Veri Gezgini" description="Sadece okuma · ham JSON detayları · yazma işlemleri uyarı sonrası" icon={Table2} />

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Dikkat</AlertTitle>
        <AlertDescription>
          Ham tablo düzenleme, INSERT ve DELETE işlemleri burada yapılır. Her yazma işleminden önce onay penceresi açılır.
          <code className="font-mono"> auth.users</code> varsayılan olarak gösterilmez.
        </AlertDescription>
      </Alert>

      <SectionCard title="Sorgu yapılandır">
        <div className="grid md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Schema</label>
            <Select value={schema} onValueChange={(v) => { setSchema(v as any); setTable(shortcuts[v as keyof typeof shortcuts][0]); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.keys(shortcuts).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Tablo</label>
            <Select value={table} onValueChange={setTable}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                {shortcuts[schema].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Filtre (kolon ilike '%…%')</label>
            <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="email = 'x@y.com'" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Limit</label>
            <Input type="number" value={limit} onChange={(e) => setLimit(e.target.value)} />
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Button onClick={() => {}}>Sorguyu Çalıştır</Button>
          <Button variant="outline" disabled>Yeni Satır (gelişmiş)</Button>
        </div>
      </SectionCard>

      <SectionCard title={`${schema}.${table}`}>
        <EmptySchemaState note="Self-hosted Postgres bağlantısı bekleniyor. Bağlandığında bu sorgu canlı veriyi gösterecektir." />
      </SectionCard>
    </div>
  ),
});
}
