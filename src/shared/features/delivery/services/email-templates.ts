/** Sigmanix-branded email templates. Pure functions; every dynamic value is escaped. */
export interface EmailContent { subject: string; html: string; text: string }

export function escapeHtml(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function layout(heading: string, bodyHtml: string, cta?: { label: string; url: string }): string {
  const button = cta
    ? `<p style="margin:24px 0"><a href="${escapeHtml(cta.url)}" style="background:#1d4ed8;color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600">${escapeHtml(cta.label)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#111827">
<div style="max-width:560px;margin:0 auto;padding:24px">
<p style="font-size:22px;font-weight:700;margin:0 0 16px">Sigma<span style="color:#c9a227">nix</span> <span style="font-size:12px;color:#1d4ed8">LMS</span></p>
<h1 style="font-size:18px;margin:0 0 12px">${escapeHtml(heading)}</h1>
${bodyHtml}${button}
<p style="font-size:12px;color:#6b7280;margin-top:32px">This is an automated message from Sigmanix LMS.</p>
</div></body></html>`;
}

export interface WelcomeInput {
  role: "student" | "trainer";
  fullName: string;
  email: string;
  code: string;
  temporaryPassword: string;
  appUrl: string | null;
  reset?: boolean;
}

/** Welcome / temporary-password email. Built in memory only; never logged or stored. */
export function welcomeEmail(i: WelcomeInput): EmailContent {
  const roleLabel = i.role === "student" ? "student" : "tutor";
  const heading = i.reset ? "Your password has been reset" : `Welcome to Sigmanix LMS`;
  const intro = i.reset
    ? "An administrator issued you a new temporary password."
    : `Your ${roleLabel} account has been created.`;
  const loginUrl = i.appUrl ? `${i.appUrl.replace(/\/$/, "")}/login` : null;
  const html = layout(heading, `<p>Hello ${escapeHtml(i.fullName)},</p><p>${escapeHtml(intro)}</p>
<table style="border-collapse:collapse;margin:12px 0;font-size:14px">
<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Email</td><td>${escapeHtml(i.email)}</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#6b7280">${i.role === "student" ? "Student code" : "Tutor code"}</td><td>${escapeHtml(i.code)}</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Temporary password</td><td style="font-family:monospace">${escapeHtml(i.temporaryPassword)}</td></tr>
</table>
<p>You must choose a new password the first time you sign in. After changing it you'll be signed out, then sign in again with your new password.</p>`,
    loginUrl ? { label: "Sign in", url: loginUrl } : undefined);
  const text = `${heading}\n\nHello ${i.fullName},\n${intro}\n\nEmail: ${i.email}\n${i.role === "student" ? "Student code" : "Tutor code"}: ${i.code}\nTemporary password: ${i.temporaryPassword}\n\nYou must choose a new password the first time you sign in.${loginUrl ? `\n\nSign in: ${loginUrl}` : ""}`;
  return { subject: i.reset ? "Sigmanix LMS — your new temporary password" : "Welcome to Sigmanix LMS", html, text };
}

export interface NotificationEmailInput { title: string; body: string | null; link: string | null; appUrl: string | null }

export function notificationEmail(i: NotificationEmailInput): EmailContent {
  const url = i.appUrl && i.link?.startsWith("/") ? `${i.appUrl.replace(/\/$/, "")}${i.link}` : null;
  const html = layout(i.title, i.body ? `<p>${escapeHtml(i.body)}</p>` : "", url ? { label: "Open Sigmanix LMS", url } : undefined);
  return { subject: `Sigmanix LMS — ${i.title}`, html, text: `${i.title}\n\n${i.body ?? ""}${url ? `\n\n${url}` : ""}` };
}
