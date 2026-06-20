import { rpc, insertRows, currentUserId, auditAction } from "@/lib/supabase-rest";

// ---------------------------------------------------------------------------
// Kullanıcıya hak tanımlama — DOĞRU yol.
//
// v2 sadece `profiles.question_quota` gibi alanları güncelliyordu; ama uygulamalar
// hakları `wallet_entitlements`'tan tüketiyor ve `profiles` kolonları yalnızca
// `sync_wallet_profile`'ın yeniden yazdığı bir önbellek. Bu yüzden kota "kullanıcıya
// düşmüyordu". `admin_adjust_profile_quotas` RPC'si hem gerçek bir entitlement
// oluşturur hem de profili senkronlar → hak gerçekten kullanıcıya ulaşır.
// ---------------------------------------------------------------------------

export type QuotaAdjust = {
  targetUserId: string;
  questionDelta?: number;
  aiDelta?: number;
  walletDelta?: number;
  setIsAdmin?: boolean;
  note?: string;
};

export async function adjustUserQuotas(args: QuotaAdjust) {
  const admin = await currentUserId();
  const params = {
    p_admin_user_id: admin,
    p_target_user_id: args.targetUserId,
    p_question_delta: Math.trunc(args.questionDelta ?? 0),
    p_ai_delta: Math.trunc(args.aiDelta ?? 0),
    p_wallet_delta: args.walletDelta ?? 0,
    p_set_is_admin: args.setIsAdmin ?? null,
    p_note: args.note ?? "adminpanelv3",
  };
  const result = await rpc("public", "admin_adjust_profile_quotas", params);
  await auditAction({
    action:
      args.setIsAdmin != null
        ? args.setIsAdmin
          ? "grant_admin"
          : "revoke_admin"
        : "adjust_quotas",
    schema: "public",
    table: "profiles",
    targetId: args.targetUserId,
    targetUserId: args.targetUserId,
    after: {
      questionDelta: params.p_question_delta,
      aiDelta: params.p_ai_delta,
      walletDelta: params.p_wallet_delta,
      setIsAdmin: params.p_set_is_admin,
    },
    reason: args.note,
  });
  return result;
}

export async function notifyUser(args: {
  targetUserId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}) {
  const admin = await currentUserId();
  try {
    await insertRows("public", "notification_messages", {
      created_by: admin,
      audience_type: "user",
      target_user_id: args.targetUserId,
      title: args.title,
      body: args.body,
      ...(args.data ? { data: args.data } : {}),
    });
    return true;
  } catch {
    // Bildirim yazılamazsa hak tanımı yine de geçerli kalmalı.
    return false;
  }
}

// Tatlı, esprili Türkçe bildirim metinleri ----------------------------------

function n(v: number) {
  return Math.abs(v).toLocaleString("tr-TR", { maximumFractionDigits: 2 });
}

export function wittyCreditMessage(delta: number) {
  if (delta >= 0) {
    return {
      title: "Cüzdanına kredi düştü! 🪙",
      body: `Hesabına ${n(delta)} MediCoin kondu. Afiyetle harca — ama hepsini tek soruya yatırma, idareli ol! 😄`,
    };
  }
  return {
    title: "Cüzdanında ufak bir düzenleme 🧾",
    body: `Bakiyenden ${n(delta)} MediCoin düşüldü. Merak etme, her şey kontrol altında! 🙂`,
  };
}

export function wittyQuestionMessage(amount: number) {
  return {
    title: "Soru hakkın katlandı! 📚",
    body: `${n(amount)} yeni soru hakkı cebine girdi. Sorular kendi kendine çözülmeyecek, biliyorsun 😉`,
  };
}

export function wittyPackageMessage(
  packageName: string,
  coin: number,
  question: number,
  ai: number,
) {
  const parts: string[] = [];
  if (coin) parts.push(`${n(coin)} MediCoin`);
  if (question) parts.push(`${n(question)} soru hakkı`);
  if (ai) parts.push(`${n(ai)} AI hakkı`);
  const detail = parts.length ? parts.join(", ") : "yeni haklar";
  return {
    title: `${packageName} paketi sende! 🎁`,
    body: `${detail} hesabına tanımlandı. Hadi göster kendini, sorular seni bekliyor! ✨`,
  };
}
