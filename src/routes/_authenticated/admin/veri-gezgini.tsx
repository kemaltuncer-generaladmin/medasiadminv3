import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader, SectionCard } from "@/components/admin/shared";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { adminSchemas, tableShortcuts, type AdminSchema } from "@/lib/admin-config";
import {
  auditedDelete,
  auditedInsert,
  auditedUpdate,
  rpc,
  selectRows,
  type JsonRow,
} from "@/lib/supabase-rest";
import { schemaCatalogFn } from "@/lib/schema-catalog-server";
import { AlertTriangle, Key, Pencil, Play, Plus, RadioTower, Table2, Trash2 } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/veri-gezgini")({
  component: VeriGezgini,
});

function VeriGezgini() {
  const queryClient = useQueryClient();
  const [schema, setSchema] = useState<AdminSchema>("public");
  const [table, setTable] = useState<string>(tableShortcuts.public[0]);
  const [rawQuery, setRawQuery] = useState("");
  const [limit, setLimit] = useState("100");
  const [operation, setOperation] = useState<"insert" | "update" | "delete" | "rpc">("insert");
  const [pkColumn, setPkColumn] = useState("id");
  const [pkValue, setPkValue] = useState("");
  const [jsonText, setJsonText] = useState("{\n  \n}");
  const [rpcName, setRpcName] = useState("");
  const [submitted, setSubmitted] = useState({
    schema: "public" as AdminSchema,
    table: tableShortcuts.public[0],
    rawQuery: "",
    limit: 100,
  });

  const rowsQuery = useQuery({
    queryKey: ["data-browser", submitted],
    queryFn: () => selectRows(submitted),
    retry: false,
  });

  const catalogQuery = useQuery({
    queryKey: ["schema-catalog", schema, table],
    queryFn: () => schemaCatalogFn({ data: { schema, table } }),
    retry: false,
    enabled: !!table,
  });
  const catalogColumns = catalogQuery.data?.columns ?? [];
  const primaryKey = catalogColumns.find((c) => c.isPrimaryKey)?.name;

  useEffect(() => {
    if (primaryKey) setPkColumn(primaryKey);
  }, [primaryKey]);

  function fillTemplate() {
    const writable = catalogColumns.filter(
      (c) => !c.isPrimaryKey && !["created_at", "updated_at"].includes(c.name),
    );
    const obj: Record<string, unknown> = {};
    for (const c of writable) {
      obj[c.name] =
        c.type === "boolean"
          ? false
          : c.type === "integer" || c.type === "number"
            ? 0
            : c.format?.includes("json")
              ? {}
              : "";
    }
    setJsonText(JSON.stringify(obj, null, 2));
  }

  const mutation = useMutation({
    mutationFn: async () => {
      if (operation === "insert") {
        return auditedInsert({
          schema,
          table,
          values: parseJsonObjectOrArray(jsonText),
          action: `insert_${table}`,
          reason: "veri_gezgini",
        });
      }
      if (operation === "update") {
        if (!pkValue.trim()) throw new Error("Güncelleme için primary key değeri gerekir.");
        return auditedUpdate({
          schema,
          table,
          idColumn: pkColumn.trim() || "id",
          id: pkValue.trim(),
          fields: parseJsonObject(jsonText),
          action: `update_${table}`,
          reason: "veri_gezgini",
        });
      }
      if (operation === "delete") {
        if (!pkValue.trim()) throw new Error("Silme için primary key değeri gerekir.");
        return auditedDelete({
          schema,
          table,
          idColumn: pkColumn.trim() || "id",
          id: pkValue.trim(),
          action: `delete_${table}`,
          reason: "veri_gezgini",
        });
      }
      if (!rpcName.trim()) throw new Error("RPC fonksiyon adı gerekir.");
      return rpc(schema, rpcName.trim(), parseJsonObject(jsonText));
    },
    onSuccess: () => {
      toast.success("İşlem tamamlandı");
      queryClient.invalidateQueries({ queryKey: ["data-browser"] });
      rowsQuery.refetch();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "İşlem başarısız");
    },
  });

  const rows = rowsQuery.data?.data ?? [];
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).slice(0, 12);

  function runQuery() {
    setSubmitted({
      schema,
      table,
      rawQuery,
      limit: Math.min(Math.max(Number(limit) || 100, 1), 1000),
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Veri Gezgini"
        description="PostgREST canlı sorgu · public, kamubase, sourcebase, praticase"
        icon={Table2}
      />

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Dikkat</AlertTitle>
        <AlertDescription>
          Okuma alanı PostgREST query formatını kabul eder:
          <code className="mx-1 font-mono">email=ilike.*@medasi*&order=created_at.desc</code>
          Mutasyon ve RPC işlemleri admin yetkisiyle audit kaydı yazmayı dener.
        </AlertDescription>
      </Alert>

      <SectionCard
        title="Sorgu yapılandır"
        actions={
          <Badge variant="outline">
            {submitted.schema}.{submitted.table}
          </Badge>
        }
      >
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <label className="text-xs text-muted-foreground">Schema</label>
            <Select
              value={schema}
              onValueChange={(value) => {
                const next = value as AdminSchema;
                setSchema(next);
                setTable(tableShortcuts[next][0]);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {adminSchemas.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Tablo / view</label>
            <Select value={table} onValueChange={setTable}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {tableShortcuts[schema].map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">PostgREST filtre</label>
            <Input
              value={rawQuery}
              onChange={(event) => setRawQuery(event.target.value)}
              placeholder="status=neq.resolved"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Limit</label>
            <Input
              type="number"
              min={1}
              max={1000}
              value={limit}
              onChange={(event) => setLimit(event.target.value)}
            />
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Button onClick={runQuery} disabled={rowsQuery.isFetching}>
            <Play className="mr-1.5 h-4 w-4" /> Sorguyu Çalıştır
          </Button>
        </div>

        {catalogColumns.length > 0 ? (
          <div className="mt-4 border-t pt-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Kolonlar ({catalogColumns.length}) · şema kataloğundan
              </span>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={fillTemplate}>
                JSON şablonu üret
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {catalogColumns.map((c) => (
                <Badge
                  key={c.name}
                  variant="outline"
                  className={
                    c.isPrimaryKey
                      ? "border-warning/40 bg-warning/10 text-warning"
                      : c.nullable
                        ? ""
                        : "border-info/40 bg-info/10 text-info"
                  }
                >
                  {c.isPrimaryKey ? <Key className="mr-1 h-3 w-3" /> : null}
                  {c.name}
                  <span className="ml-1 opacity-60">{c.format || c.type}</span>
                </Badge>
              ))}
            </div>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard
        title="Ham mutasyon / RPC"
        description="v2 TableBrowser eşdeğeri: JSON body ile insert, update, delete ve rpc"
        actions={
          <Badge variant="outline">
            {schema}.{operation === "rpc" ? rpcName || "rpc" : table}
          </Badge>
        }
      >
        <div className="grid gap-3 lg:grid-cols-[220px_1fr]">
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">İşlem</label>
              <Select
                value={operation}
                onValueChange={(value) => setOperation(value as typeof operation)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="insert">Insert</SelectItem>
                  <SelectItem value="update">Update</SelectItem>
                  <SelectItem value="delete">Delete</SelectItem>
                  <SelectItem value="rpc">RPC</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {operation === "rpc" ? (
              <div>
                <label className="text-xs text-muted-foreground">RPC adı</label>
                <Input
                  value={rpcName}
                  onChange={(event) => setRpcName(event.target.value)}
                  placeholder="materialize_notification_campaign"
                />
              </div>
            ) : (
              <>
                <div>
                  <label className="text-xs text-muted-foreground">PK kolon</label>
                  <Input
                    value={pkColumn}
                    onChange={(event) => setPkColumn(event.target.value)}
                    placeholder="id"
                    disabled={operation === "insert"}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">PK değer</label>
                  <Input
                    value={pkValue}
                    onChange={(event) => setPkValue(event.target.value)}
                    placeholder="uuid"
                    disabled={operation === "insert"}
                  />
                </div>
              </>
            )}
            <Button
              className="w-full"
              variant={operation === "delete" ? "destructive" : "default"}
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
            >
              {operation === "insert" && <Plus className="mr-1.5 h-4 w-4" />}
              {operation === "update" && <Pencil className="mr-1.5 h-4 w-4" />}
              {operation === "delete" && <Trash2 className="mr-1.5 h-4 w-4" />}
              {operation === "rpc" && <RadioTower className="mr-1.5 h-4 w-4" />}
              Çalıştır
            </Button>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">
              {operation === "delete"
                ? "Silme işleminde body kullanılmaz"
                : operation === "rpc"
                  ? "RPC parametreleri JSON"
                  : "JSON body"}
            </label>
            <Textarea
              value={jsonText}
              onChange={(event) => setJsonText(event.target.value)}
              disabled={operation === "delete"}
              className="min-h-48 font-mono text-xs"
              placeholder={'{\n  "status": "active"\n}'}
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title={`${submitted.schema}.${submitted.table}`}
        description={
          rowsQuery.data?.count !== undefined ? `${rowsQuery.data.count} kayıt bulundu` : undefined
        }
      >
        {rowsQuery.isLoading || rowsQuery.isFetching ? (
          <div className="text-sm text-muted-foreground">Canlı veri yükleniyor...</div>
        ) : rowsQuery.error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {rowsQuery.error instanceof Error ? rowsQuery.error.message : "Sorgu çalıştırılamadı."}
          </div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">Bu sorgu için kayıt dönmedi.</div>
        ) : (
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((column) => (
                    <TableHead key={column}>{column}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, index) => (
                  <TableRow key={String(row.id ?? index)}>
                    {columns.map((column) => (
                      <TableCell key={column} className="max-w-72 truncate font-mono text-xs">
                        {formatCell(row[column])}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function formatCell(value: unknown) {
  if (value === null || value === undefined) return "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function parseJsonObject(raw: string): JsonRow {
  const value = JSON.parse(raw || "{}");
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("JSON body bir obje olmalı.");
  }
  return value as JsonRow;
}

function parseJsonObjectOrArray(raw: string): JsonRow | JsonRow[] {
  const value = JSON.parse(raw || "{}");
  if (Array.isArray(value)) {
    if (!value.every((item) => item && typeof item === "object" && !Array.isArray(item))) {
      throw new Error("Array içindeki her kayıt obje olmalı.");
    }
    return value as JsonRow[];
  }
  if (!value || typeof value !== "object") {
    throw new Error("JSON body bir obje veya obje array'i olmalı.");
  }
  return value as JsonRow;
}
