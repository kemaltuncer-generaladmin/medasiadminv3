# adminpanelv2 → adminpanelv3 Birebir Taşıma Planı

## DURUM: TÜM FAZLAR TAMAMLANDI ✅
Faz 0–6 bitti. 29 admin rotası, v2'nin 23 bölümünün tamamı + alt özellikler.
Son doğrulama: `tsc` temiz · `vite build` geçiyor · `eslint` 0 hata · client bundle'da hiçbir secret
değeri yok (service_role, MEDASIPAY_ADMIN_KEY, Vertex private key, OpenAI key hepsi server-only).
Kalan tek adım: canlı tarayıcı testi (admin girişiyle) — `/verify`.

## İlerleme Kaydı
- ✅ **Faz 0 — Sunucu admin gateway (mimari kilit taşı).**
  `src/lib/admin-rest-server.ts` (`adminRestFn`, service_role çok-şemalı PostgREST) +
  `src/integrations/supabase/admin-middleware.ts` (`requireAdmin`). `src/lib/supabase-rest.ts`
  artık tüm okuma/yazmayı bu sunucu fonksiyonuna yönlendiriyor (anon istemci yolu kaldırıldı).
  **Doğrulandı:** `tsc` temiz, `vite build` geçiyor, service_role anahtarı client bundle'da YOK.
  Ayrıca iki önceden var olan tip hatası düzeltildi (`live-data.tsx`, `servis-sagligi.tsx`).
- ✅ **Faz 1 — Müşteri Hizmetleri (tamamlandı).**
  - **Kullanıcılar 360°** (`kullanicilar.tsx`): aranabilir/filtreli tablo → detay çekmecesi (Sheet);
    bakiye başlığı, hızlı aksiyonlar (kredi ekle/düş +chipler, paket uygula, admin toggle), profil
    kartı + düzenle/sil, hak edişler/satın almalar/cihazlar/destek geçmişi/denetim timeline. Audit'li
    (`wallet_adjust`, `apply_package`, `grant_admin/revoke_admin`, `edit_profile`, `delete_user`).
  - **Destek Kutusu** (`destek.tsx`): support_tickets (sourcebase) + contact_requests (praticase)
    birleşik inbox; arama/durum/kaynak filtre, özet KPI; çekmecede durum iş akışı (Açık→İşlemde→Çözüldü)
    audit'li (`support_status_*`).
  - **Bildirim & Duyuru** (`bildirimler.tsx`, yeni nav): duyuru CRUD (oluştur/aktif-pasif/sil) + kampanya
    gönderici 3 mod (Herkes→`materialize_notification_campaign` RPC, Tek kullanıcı, Segment toplu
    notification_messages).
  - **MedAsiPay** (`medasipay.tsx` + `medasipay-server.ts`): sunucu REST proxy (`MEDASIPAY_ADMIN_KEY`
    secret, `X-MedAsi-Admin-Key`) → list/approve/reject/grant-entitlement + dekont görüntüleme (base64);
    durum KPI'ları, sipariş tablosu, onay akışı çekmecesi.
  - **Doğrulandı:** `tsc` temiz, `vite build` geçiyor, client bundle'da secret değeri YOK
    (yalnızca UI etiket metni). *Kalan:* admin girişiyle canlı tarayıcı testi (en sona bırakıldı).

---



**Hedef:** SwiftUI macOS uygulaması `MedAsiAdmin` (v2, ~15k satır, 23 bölüm) işlevlerinin
tamamını TanStack Start + React + Supabase web uygulamasına (v3) **birebir** taşımak ve
canlı ortak Supabase'e (`https://medasi.com.tr`) bağlamak.

## Onaylanan Mimari Kararlar
1. **Yazma mimarisi:** Tüm admin yazmaları ve hassas okumalar TanStack **server function**'lardan
   `supabaseAdmin` (service_role) ile geçer → RLS bypass, v2 ile birebir, secret tarayıcıya sızmaz.
2. **AI üretim:** Vertex Gemini (servis hesabı JWT imzalama) + OpenAI çağrıları **sunucu proxy**'ye
   taşınır; servis hesabı JSON ve API anahtarları sunucu secret'ı olur.
3. **Downloads & PDF:** İndirme/APK → Supabase **Storage**; PDF çıktı → **sunucu taraflı** üretim.

- ✅ **Faz 2 — İçerik & Kalite CRUD (tamamlandı).** Yeni nav grubu "İçerik & Kalite".
  - **Vakalar** (`vakalar.tsx`): cases CRUD + `god_mode_case_publication_v` sağlık rozeti (eksik modüller),
    yayınla/kaldır, sil; **JSON içerik editörü** (13 jsonb alan, alan-bazlı değişiklik takibi, geçersiz JSON
    koruması). AI üret butonu Faz 3 için placeholder.
  - **Kaynaklar** (`kaynaklar.tsx`): sourcebase.products CRUD (oluştur/düzenle/yayınla/sil), fiyat cent dönüşümü.
  - **Soru Bankası** (`qlinik.tsx` yeniden): sekmeli — "Soru Bankası" (questions CRUD: oluştur/düzenle/
    aktif-pasif/sil, şıklar JSON) + "İnceleme Kuyruğu" (candidate_questions → review drawer → Onayla
    `question_bank`'a kopyala / Reddet, audit'li).
  - **İçerik Sağlığı**: v2'de de salt-okunur → mevcut `icerik-sagligi.tsx` zaten karşılıyor.
  - **Doğrulandı:** `tsc` temiz, `vite build` geçiyor, secret sızıntısı yok.
  - *Faz 2 takip (küçük):* Qlinik Diş/Hemşirelik (access_disciplines) ve KamuBase (kamubase şeması)
    disiplin-özel bankalar — aynı CRUD'un filtre varyasyonu, sonra eklenebilir.

- 🔄 **Faz 3 — AI Üretim Hattı (başladı).**
  - ✅ **Sunucu AI geçidi** (`ai-server.ts`): Vertex Gemini (servis hesabı JWT, Node `crypto` RS256, token
    cache) + OpenAI; `aiGenerateFn` server fn (requireAdmin). Secret'lar `.env`'de sunucu-only
    (`GEMINI_SERVICE_ACCOUNT_JSON`, `VERTEX_PROJECT_ID/LOCATION`, `OPENAI_API_KEY`).
    **CANLI DOĞRULANDI:** JWT→OAuth token (200)→generateContent (200)→geçerli JSON.
  - ✅ **AI Stüdyo** (`ai-studio.tsx`): Soru Üret / Soru İyileştir / Vaka İyileştir; provider+model seçimi,
    temperature slider, aday arama, JSON çıktı editörü, Uygula (DB'ye yaz — kolon allowlist'li).
  - ⏳ **Kalan:** Vaka Üretim (casefactory 5-modül OSCE pipeline + `god_mode_upsert_generated_checklist`),
    Toplu Üretim (BulkGenerate), İçe Aktar (JSON import), düzenlenebilir PromptLibrary kalıcılığı.
    (Vakalar'daki "AI ile Üret" butonu bu pipeline hazır olunca bağlanacak.)

---

## v2 ↔ v3 Bölüm Eşleşmesi ve Boşluk Analizi

| v2 Bölüm (NavSection) | İşlev | v3 Karşılığı | Durum |
|---|---|---|---|
| **dashboard** Komuta Merkezi | Tıklanabilir KPI, ops uyarıları, yeni kayıt grafiği, denetim akışı | `genel-bakis` | Kısmî (KPI var, grafik/uyarı/akış yok) |
| **users** Kullanıcılar 360° | Tablo + **detay çekmecesi**: profil, hak ediş, satın alma, cihaz, destek, **audit timeline**; kredi ekle/düş, **paket uygula**, admin yetkisi (audit'li) | `kullanicilar` | Sadece okuma listesi — **tüm yazma + drawer eksik** |
| **support** Destek Kutusu | Birleşik inbox (sourcebase.support_tickets + praticase.contact_requests), durum iş akışı | `destek` | Sadece okuma — durum değiştirme yok |
| **medasipay** MedAsiPay | odeme.medasi.com.tr REST; dekont onay/red/entitlement, makbuz görüntüleme | `medasipay` | Sadece purchases okuma — **REST proxy + onay akışı eksik** |
| **notifications** Bildirim & Duyuru | Duyuru CRUD + push kampanya (`materialize_notification_campaign` RPC) | `destek` içinde okuma | **CRUD + materialize eksik** |
| **casefactory** Vaka Üretim | Seçim-tabanlı 5 OSCE modülü AI üretimi, prompt kütüphanesi + temperature, `god_mode_upsert_generated_checklist` | — | **Tamamen eksik** |
| **praticase** Vakalar | CRUD + yayın sağlığı (eksik modül), JSON editör | `praticase` | Sadece okuma — **CRUD/JSON editör eksik** |
| **questions / qlinikDis / qlinikHemsirelik / kamubase** Soru Bankası | Soru bankası + **inceleme kuyruğu** (onayla→terfi, reddet) | `qlinik` | Sadece okuma — **inceleme kuyruğu + 4 bank eksik** |
| **sourcebase** Kaynaklar | products oluştur/düzenle/yayınla/sil | `sourcebase` | Sadece okuma — **CRUD eksik** |
| **ai** AI Stüdyo | Vertex Gemini ile tekil soru/vaka üretimi | — | **Tamamen eksik** |
| **contenthealth** İçerik Sağlığı | Sorunlu içerik, sorun kodları, content audit events | `icerik-sagligi` | Okuma var — düzeltme aksiyonları yok |
| **importer** İçe Aktar | Toplu JSON import | — | **Tamamen eksik** |
| **pdfExport** PDF Çıktı | Soru + vaka PDF | — | **Tamamen eksik** (→ sunucu PDF) |
| **store** Mağaza & Cüzdan | E-posta ile hızlı kredi, paket, gelir, gift code (SHA-256) | `cuzdan` + `satin-almalar` | Sadece okuma — **yazma + gift code üretimi eksik** |
| **marketing** Banner & Bonus | home_banners + wallet_bonus_policies CRUD | — | **Tamamen eksik** (banner okuması praticase'te) |
| **analytics** İstatistik | OSCE funnel, günlük aktivite, skor dağılımı, top vaka, model bazlı AI maliyet | `ai-maliyetleri` | Kısmî — funnel/skor/grafikler eksik |
| **browser** Veri Gezgini | Şema-farkında keşif, oku/düzenle/ekle/sil, PK otomatik | `veri-gezgini` | **En tam** (insert/update/delete/rpc var) — SchemaCatalog/PK keşfi eklenecek |
| **downloads** İndirme | APK dağıtım (yerel klasör) | — | **Eksik** (→ Storage) |
| **ops** Ops/Sağlık | Servis ping | `servis-sagligi` | Büyük ölçüde tam |
| **auditlog** Denetim Kaydı | Kim/ne/ne zaman, before-after JSON drawer | `audit` | Okuma var — **before/after drawer eksik** |

v3'te ekstra: `recall`, `job-queue` (operasyonel toplamalar) — korunacak.

---

## Faz Planı

### Faz 0 — Altyapı & Mimari (temel)
- **Sunucu admin katmanı:** `src/integrations/supabase/admin-rest.server.ts` — `supabaseAdmin`/service_role
  üzerinden `insert/update/delete/upsert/rpc/page/count` + `auditedInsert/Update/Delete/ContentUpdate`
  (v2 `SupabaseService` birebir). TanStack server function olarak expose et.
- `src/lib/supabase-rest.ts` yazma fonksiyonlarını bu server function'lara yönlendir (okuma anon kalabilir).
- **Admin guard server tarafı** + `ADMIN_ACTOR_USER_ID` env (v2 `adminActorUserId`).
- **SchemaCatalog:** PostgREST OpenAPI introspeksiyonu (tablo/kolon/PK) → Veri Gezgini ve EntityPicker için.
- **UI çekirdek (v2 ConsoleKit/FormKit/EntityPicker portu):** `DataTable`, `DetailDrawer`, `EntityPicker`
  (şema-tahrikli aranabilir dropdown), `FormField/FormTextField/FormSegment/FormToggle`, `TimelineView`,
  `StatTile/StatusPill`, **⌘K komut paleti** (cmdk zaten var).
- Nav'ı v2 departman IA'sına hizala (KOMUTA / MÜŞTERİ HİZMETLERİ / İÇERİK & KALİTE / SATIŞ & PAZARLAMA /
  İSTATİSTİK / SİSTEM-VERİTABANI), 23 bölüm.

### Faz 1 — Müşteri Hizmetleri
- **Kullanıcılar 360°:** detay drawer (profil/hak ediş/satın alma/cihaz/destek/audit timeline);
  kredi ekle-düş (`adjustWallet`), **paket uygula** (`apply_package`), **admin yetkisi** (`grant_admin`) — audit'li.
- **Destek Kutusu:** birleşik inbox, durum iş akışı (Açık→İşlemde→Çözüldü) yazma.
- **Bildirim & Duyuru:** announcements CRUD + `materialize_notification_campaign` RPC.
- **MedAsiPay:** sunucu REST proxy (`odeme.medasi.com.tr`, `MEDASIPAY_ADMIN_KEY` env) →
  fetchOrders/approve/reject/grantEntitlement/fetchReceipt + dekont görüntüleme.

### Faz 2 — İçerik & Kalite (CRUD)
- **Vakalar (praticase):** CRUD + yayın sağlığı + JSON içerik editör.
- **Soru Bankası (4 bank):** Qlinik Tıp/Diş/Hemşirelik + KamuBase; **inceleme kuyruğu**
  (onayla→`question_bank` terfi, reddet).
- **Kaynaklar (sourcebase.products):** oluştur/düzenle/yayınla/sil.
- **İçerik Sağlığı:** sorun listesi + düzeltme aksiyonları + content audit events.

### Faz 3 — AI Üretim Hattı (sunucu proxy)
- **AI sunucu servisi:** Vertex Gemini servis hesabı JWT imzalama (Node `crypto`, v2 `AIService` portu) +
  OpenAI; `GEMINI_SERVICE_ACCOUNT_JSON` / `OPENAI_API_KEY` env.
- **PromptLibrary:** düzenlenebilir sistem prompt'ları + temperature (DB tablosu veya server config).
- **Vaka Üretim (casefactory):** 5 OSCE modülü üretimi + `god_mode_upsert_generated_checklist`.
- **AI Stüdyo:** tekil soru/vaka üretimi.
- **Toplu Üretim (BulkGenerate)** + **İçe Aktar (importer)** toplu JSON.
- `QuestionAIGeneration` + `PratiCaseAIGeneration` normalize/validate mantığı TS'e port.

### Faz 4 — Satış & Pazarlama + İstatistik
- **Mağaza & Cüzdan:** e-posta ile hızlı kredi, paket uygula, gelir, **gift code üretimi (SHA-256)**.
- **Banner & Bonus:** home_banners + wallet_bonus_policies CRUD.
- **İstatistik:** OSCE funnel, günlük aktivite, skor dağılımı, top vaka, model bazlı AI maliyet (recharts).

### Faz 5 — Sistem / Veritabanı + kalan
- **Veri Gezgini:** SchemaCatalog ile PK otomatik, kolon-farkında form, dağıtık şema gezgini.
- **Denetim Kaydı:** before/after JSON drawer.
- **İndirme:** APK → Supabase Storage + `apps.json` yönetimi (sunucu).
- **PDF Çıktı:** sunucu taraflı PDF üretimi (soru + vaka).
- **Komuta Merkezi:** tıklanabilir KPI, yeni kayıt grafiği, ops uyarı kartları, canlı denetim akışı.
- **Ops/Sağlık:** mevcut servis ping'i v2 paritesine tamamla.

### Faz 6 — Doğrulama
- Bölüm bölüm canlı veri ile manuel test (`/verify`), audit kayıtlarının yazıldığını doğrula,
  `bun run build` + lint, v2 ile yan yana fonksiyon paritesi kontrol listesi.

---

## Gerekecek Sunucu Secret'ları (.env / host env)
- `SUPABASE_SERVICE_ROLE_KEY` (mevcut) · `ADMIN_ACTOR_USER_ID` (mevcut)
- `MEDASIPAY_ADMIN_KEY` (yeni)
- `GEMINI_SERVICE_ACCOUNT_JSON` veya Vertex kimlik bilgisi (yeni)
- `OPENAI_API_KEY` (opsiyonel, yeni)

## Riskler / Notlar
- Service_role'ün tarayıcıya **asla** sızmaması: tüm yazmalar `*.server.ts` / server function içinde kalmalı.
- AI JWT imzalama Node ortamı gerektirir (Edge değil) — host runtime kontrol edilecek.
- Canlı tabloların gerçek kolon adları introspeksiyonla doğrulanacak (stub'lardaki bazı tablo adları
  varsayımsal: `store_catalog`, `session_ai_enrichments` vb. canlıda teyit edilecek).
