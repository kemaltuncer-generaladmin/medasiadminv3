import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, EmptySchemaState, SectionCard } from "@/components/admin/shared";
import { LifeBuoy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/destek")({
  component: () => (
    <div className="space-y-6">
      <PageHeader title="Destek & Bildirimler" description="praticase.contact_requests, notifications, push tokens, duyurular, FAQ" icon={LifeBuoy} />
      <div className="grid lg:grid-cols-2 gap-4">
        <SectionCard title="Destek inbox"><EmptySchemaState /></SectionCard>
        <SectionCard title="Bildirim teslimi"><EmptySchemaState /></SectionCard>
        <SectionCard title="Duyurular"><EmptySchemaState /></SectionCard>
        <SectionCard title="FAQ & support topics"><EmptySchemaState /></SectionCard>
        <SectionCard title="Push device tokens"><EmptySchemaState /></SectionCard>
        <SectionCard title="Notification campaigns"><EmptySchemaState /></SectionCard>
      </div>
    </div>
  ),
});
