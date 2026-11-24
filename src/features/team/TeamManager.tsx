"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

export type Role = "owner" | "admin" | "staff" | "viewer";

export interface Member {
  user_id: string;
  email: string | null;
  role: Role;
  is_me: boolean;
}

export interface Invite {
  id: string;
  role: Exclude<Role, "owner">;
  created_at: string;
  expires_at: string;
}

export const ROLE_LABEL: Record<Role, string> = {
  owner: "مالك",
  admin: "مدير",
  staff: "ناشر",
  viewer: "مشاهدة فقط",
};

const ROLE_HINT: Record<Role, string> = {
  owner: "كل شيء، ومنها تعيين مالكين آخرين",
  admin: "كل شيء ومنها الفريق، عدا المالكين",
  staff: "الشاشات والمحتوى والعقود والإعلانات، دون الفريق والإعدادات",
  viewer: "يرى الشاشات والتقارير ولا يغيّر شيئًا",
};

const ERRORS: Record<string, string> = {
  last_owner: "لا بد أن يبقى مالك واحد على الأقل.",
  owner_only: "المالك وحده يغيّر صلاحيات المالكين.",
};

function errorText(message: string) {
  const key = Object.keys(ERRORS).find((code) => message.includes(code));
  return key ? ERRORS[key] : "لم يُحفظ التغيير. حاول مرة أخرى.";
}

export function TeamManager({
  orgId,
  orgName,
  myRole,
  members,
  invites,
}: {
  orgId: string;
  orgName: string;
  myRole: Role;
  members: Member[];
  invites: Invite[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [link, setLink] = useState<{ url: string; role: Role } | null>(null);
  const canManage = myRole === "owner" || myRole === "admin";

  async function invite(role: Exclude<Role, "owner">) {
    setBusy(true);
    setMessage(null);
    const { data, error } = await createClient().rpc("create_team_invite", { p_org: orgId, p_role: role });
    setBusy(false);
    if (error || !data) return setMessage("تعذر إنشاء الدعوة.");
    setLink({ url: `${window.location.origin}/join/${data as string}`, role });
    router.refresh();
  }

  async function change(member: Member, role: Role) {
    setBusy(true);
    setMessage(null);
    const { error } = await createClient().rpc("set_member_role", { p_org: orgId, p_user: member.user_id, p_role: role });
    setBusy(false);
    setMessage(error ? errorText(error.message) : `صار ${member.email ?? "العضو"} ${ROLE_LABEL[role]}`);
    router.refresh();
  }

  async function remove(member: Member) {
    if (!window.confirm(`إزالة ${member.email ?? "هذا العضو"} من الفريق؟`)) return;
    setBusy(true);
    setMessage(null);
    const { error } = await createClient().rpc("remove_member", { p_org: orgId, p_user: member.user_id });
    setBusy(false);
    setMessage(error ? errorText(error.message) : "أُزيل من الفريق");
    router.refresh();
  }

  async function revoke(id: string) {
    setBusy(true);
    await createClient().rpc("revoke_team_invite", { p_invite: id });
    setBusy(false);
    router.refresh();
  }

  const share = link
    ? `https://wa.me/?text=${encodeURIComponent(
        `أدعوك للانضمام إلى فريق ${orgName} في لوحة الشاشات (${ROLE_LABEL[link.role]}). افتح الرابط وادخل ببريدك:\n${link.url}`,
      )}`
    : null;

  return (
    <main className="page">
      <h1>الفريق</h1>

      <ul className="schedule-list">
        {members.map((member) => (
          <li key={member.user_id}>
            <strong dir="ltr" className="team-email">{member.email ?? "بلا بريد"}</strong>
            <span>
              {ROLE_LABEL[member.role]}
              {member.is_me && " (أنت)"}
            </span>
            {canManage && !member.is_me && (member.role !== "owner" || myRole === "owner") && (
              <div className="team-actions">
                <select
                  aria-label={`صلاحية ${member.email ?? ""}`}
                  value={member.role}
                  disabled={busy}
                  onChange={(event) => void change(member, event.target.value as Role)}
                >
                  {(Object.keys(ROLE_LABEL) as Role[])
                    .filter((role) => role !== "owner" || myRole === "owner")
                    .map((role) => (
                      <option key={role} value={role}>{ROLE_LABEL[role]}</option>
                    ))}
                </select>
                <button type="button" className="danger" disabled={busy} onClick={() => void remove(member)}>
                  إزالة
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {canManage && (
        <section className="assign-section">
          <h2>دعوة عضو</h2>
          <p className="page-note">اختر الصلاحية، ثم أرسل الرابط له. يصلح الرابط لشخص واحد لمدة 7 أيام.</p>
          <ul className="role-list">
            {(["admin", "staff", "viewer"] as const).map((role) => (
              <li key={role}>
                <button type="button" disabled={busy} onClick={() => void invite(role)}>
                  <strong>{ROLE_LABEL[role]}</strong>
                  <small>{ROLE_HINT[role]}</small>
                </button>
              </li>
            ))}
          </ul>

          {link && (
            <div className="invite-link">
              <span>رابط دعوة {ROLE_LABEL[link.role]}</span>
              <input readOnly dir="ltr" value={link.url} onFocus={(event) => event.target.select()} />
              <div className="button-row">
                {share && (
                  <a className="whatsapp" href={share} target="_blank" rel="noreferrer">
                    أرسل على واتساب
                  </a>
                )}
                <button type="button" className="button-quiet-blue" onClick={() => void navigator.clipboard.writeText(link.url)}>
                  نسخ الرابط
                </button>
              </div>
            </div>
          )}

          {invites.length > 0 && (
            <>
              <h2>دعوات لم تُستخدم</h2>
              <ul className="schedule-list">
                {invites.map((item) => (
                  <li key={item.id}>
                    <strong>{ROLE_LABEL[item.role]}</strong>
                    <span>تنتهي {new Date(item.expires_at).toLocaleDateString("ar-LY-u-nu-latn")}</span>
                    <div className="schedule-actions">
                      <button type="button" className="danger" disabled={busy} onClick={() => void revoke(item.id)}>
                        إلغاء الدعوة
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {message && <p className="page-note" role="status">{message}</p>}
    </main>
  );
}
