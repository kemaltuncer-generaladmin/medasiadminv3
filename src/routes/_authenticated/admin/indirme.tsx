import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, Loader2, Upload, Trash2, Link2, FileBox } from "lucide-react";
import { PageHeader, SectionCard } from "@/components/admin/shared";
import {
  storageBucketsFn,
  storageListFn,
  storageUploadFn,
  storageDeleteFn,
  storagePublicUrlFn,
} from "@/lib/storage-server";
import { fmtRelative } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/indirme")({
  component: Indirme,
});

function fmtSize(bytes?: number) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function Indirme() {
  const qc = useQueryClient();
  const [bucket, setBucket] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const bucketsQ = useQuery({
    queryKey: ["storage-buckets"],
    queryFn: () => storageBucketsFn(),
    retry: false,
  });
  const buckets = bucketsQ.data?.buckets ?? [];

  useEffect(() => {
    if (!bucket && buckets.length > 0) {
      setBucket(
        buckets.find((b) => /apk|indir|download|dağıt/i.test(b.name))?.name ?? buckets[0].name,
      );
    }
  }, [buckets, bucket]);

  const objectsQ = useQuery({
    queryKey: ["storage-list", bucket],
    queryFn: () => storageListFn({ data: { bucket } }),
    enabled: !!bucket,
    retry: false,
  });
  const objects = (objectsQ.data?.objects ?? []).filter((o) => o.name && !o.name.endsWith("/"));
  const invalidate = () => qc.invalidateQueries({ queryKey: ["storage-list", bucket] });

  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await storageUploadFn({
        data: {
          bucket,
          path: file.name,
          base64,
          contentType: file.type || "application/octet-stream",
        },
      });
    },
    onSuccess: () => {
      invalidate();
      toast.success("Yüklendi");
      if (fileRef.current) fileRef.current.value = "";
    },
    onError: (e) => toast.error(String((e as Error).message).slice(0, 200)),
  });

  const deleteMut = useMutation({
    mutationFn: (path: string) => storageDeleteFn({ data: { bucket, path } }),
    onSuccess: () => {
      invalidate();
      toast.success("Silindi");
    },
    onError: (e) => toast.error(String((e as Error).message).slice(0, 200)),
  });

  const urlMut = useMutation({
    mutationFn: (path: string) => storagePublicUrlFn({ data: { bucket, path } }),
    onSuccess: async (r) => {
      await navigator.clipboard.writeText(r.url).catch(() => {});
      window.open(r.url, "_blank");
      toast.success("Bağlantı kopyalandı ve açıldı");
    },
    onError: (e) => toast.error(String((e as Error).message).slice(0, 200)),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="İndirme"
        description="APK / dosya dağıtımı • Supabase Storage"
        icon={Download}
      />

      <SectionCard
        title="Dağıtım dosyaları"
        description={bucket ? `Bucket: ${bucket}` : "Bucket seç"}
        actions={
          <div className="flex items-center gap-2">
            <Select value={bucket} onValueChange={setBucket}>
              <SelectTrigger className="h-9 w-48">
                <SelectValue placeholder="Bucket" />
              </SelectTrigger>
              <SelectContent>
                {buckets.map((b) => (
                  <SelectItem key={b.name} value={b.name}>
                    {b.name}
                    {b.public ? " (public)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadMut.mutate(f);
              }}
            />
            <Button
              size="sm"
              disabled={!bucket || uploadMut.isPending}
              onClick={() => fileRef.current?.click()}
            >
              {uploadMut.isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-1.5 h-4 w-4" />
              )}{" "}
              Yükle
            </Button>
          </div>
        }
      >
        {bucketsQ.isLoading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Bucket'lar yükleniyor…
          </div>
        ) : buckets.length === 0 ? (
          <div className="py-8 text-sm text-muted-foreground">
            Storage bucket'ı bulunamadı. Supabase'de bir bucket (örn. "downloads") oluşturun.
          </div>
        ) : objectsQ.isLoading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…
          </div>
        ) : objectsQ.error ? (
          <div className="py-6 text-sm text-destructive">
            {String((objectsQ.error as Error).message).slice(0, 200)}
          </div>
        ) : objects.length === 0 ? (
          <div className="py-8 text-sm text-muted-foreground">
            <FileBox className="mb-2 h-8 w-8 opacity-40" /> Bu bucket'ta dosya yok.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dosya</TableHead>
                <TableHead>Boyut</TableHead>
                <TableHead>Güncelleme</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {objects.map((o) => (
                <TableRow key={o.name}>
                  <TableCell className="font-mono text-sm">{o.name}</TableCell>
                  <TableCell className="text-xs">{fmtSize(o.metadata?.size)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {fmtRelative(o.updated_at ?? o.created_at)}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="Bağlantı"
                        onClick={() => urlMut.mutate(o.name)}
                      >
                        <Link2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        title="Sil"
                        onClick={() => deleteMut.mutate(o.name)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>
    </div>
  );
}
