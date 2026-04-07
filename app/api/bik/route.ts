// FILE LOCATION: app/api/bik/route.ts
//
// Required Vercel env vars:
//   BIK_API_KEY        e.g. bea482238c
//   BIK_API_SECRET     e.g. 302033f68e00c23ab748
//   BIK_APP_ID         e.g. T9WDpg4WCxcJduCZyU9l
//   BIK_REPORT_EMAIL   e.g. rachit@crepdogcrew.com  ← ADD THIS (any real email on your Bik account)

import { NextResponse } from "next/server";

const BIK_BASE = "https://bikapi.bikayi.app/integrations";

// ── Credentials ───────────────────────────────────────────────────────
function creds() {
  return {
    key:    process.env.BIK_API_KEY    ?? "",
    secret: process.env.BIK_API_SECRET ?? "",
    appId:  process.env.BIK_APP_ID     ?? "",
    // Any registered email on your Bik account — Bik requires at least one
    email:  process.env.BIK_REPORT_EMAIL ?? "rachit@crepdogcrew.com",
  };
}

function authHeader(key: string, secret: string) {
  return `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`;
}

// ── Exact report names Bik accepts (from your screenshot + validation logs) ──
// These are the ONLY valid names — do not change them
const REPORTS = {
  agent:    "Agent Engagement",
  tickets:  "Customer ticket report (with forms)",   // ← KEY FIX: this is the ticket-level report
  sla:      "Agent SLA report",                      // lowercase 'r' — exactly as Bik shows
  label:    "Label Engagement",
  csat:     "Overall CSAT/NPS",
  channel:  "Channel Engagement",
} as const;

// ── Generate a report ─────────────────────────────────────────────────
async function generateReport(
  auth: string,
  appId: string,
  reportEmail: string,
  reportName: string,
  startDate: string,
  endDate: string,
): Promise<number | null> {
  // Bik requires YYYY-MM-DD format, not ISO strings
  const start = startDate.split("T")[0];
  const end   = endDate.split("T")[0];

  const body = {
    reportName,
    reportType: "Helpdesk",
    dateRange:  { startDate: start, endDate: end },
    emails:     [reportEmail],   // ← THE FIX: must have at least 1 email
    appId,
  };

  console.log(`[BIK] Generating "${reportName}" for ${start} → ${end}`);

  const res  = await fetch(`${BIK_BASE}/bikPlatformFunctions-generateReport`, {
    method:  "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });

  let data: Record<string, unknown>;
  try { data = JSON.parse(await res.text()); } catch { return null; }

  // Check for API-level errors
  const innerStatus = data?.status as number | undefined;
  if (innerStatus && innerStatus >= 400) {
    const errors = (data?.errors as Array<{ message?: string }> | undefined) ?? [];
    console.error(`[BIK] ❌ "${reportName}" failed:`, errors[0]?.message?.slice(0, 300));
    return null;
  }

  const id = ((data?.data as Record<string, unknown>)?.reportHistoryId) as number | undefined;
  console.log(`[BIK] ✅ "${reportName}" → reportHistoryId: ${id}`);
  return id ?? null;
}

// ── Poll until the report is COMPLETED ───────────────────────────────
async function pollReport(
  auth: string,
  appId: string,
  reportHistoryId: number,
  label: string,
  maxAttempts = 60,   // up to ~5 minutes (60 × 5s)
  intervalMs  = 5000,
): Promise<string | null> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res  = await fetch(`${BIK_BASE}/bikPlatformFunctions-getReportById`, {
        method:  "POST",
        headers: { Authorization: auth, "Content-Type": "application/json" },
        body:    JSON.stringify({ reportHistoryId, appId }),
      });
      const data = await res.json() as Record<string, unknown>;
      const d    = data?.data as Record<string, unknown> | undefined;
      const status = d?.reportStatus as string | undefined;
      const link   = d?.downloadLink  as string | undefined;

      console.log(`[BIK] Poll ${i + 1}/${maxAttempts} "${label}" → ${status}`);

      if (status === "COMPLETED" && link) {
        console.log(`[BIK] ✅ "${label}" ready`);
        return link;
      }
      if (status === "FAILED") {
        console.log(`[BIK] ❌ "${label}" failed`);
        return null;
      }
    } catch (e) {
      console.warn(`[BIK] Poll error "${label}":`, e);
    }
    await sleep(intervalMs);
  }
  console.warn(`[BIK] ⏰ "${label}" timed out`);
  return null;
}

// ── Download & parse CSV ──────────────────────────────────────────────
async function downloadCSV(url: string): Promise<Record<string, string>[]> {
  const res  = await fetch(url, { cache: "no-store" });
  const text = await res.text();

  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(Boolean);
  if (lines.length < 2) return [];

  const headers = parseLine(lines[0]);
  console.log(`[BIK] CSV columns (${headers.length}): ${headers.slice(0, 8).join(" | ")}`);

  return lines.slice(1).map((line) => {
    const values = parseLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ""; });
    return row;
  });
}

function parseLine(line: string): string[] {
  const result: string[] = [];
  let cur = ""; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else { inQ = !inQ; } }
    else if (c === "," && !inQ) { result.push(cur.trim()); cur = ""; }
    else { cur += c; }
  }
  result.push(cur.trim());
  return result.map((v) => v.replace(/^"|"$/g, "").trim());
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

// ── Generate then poll helper ─────────────────────────────────────────
async function fetchReport(
  auth: string,
  appId: string,
  email: string,
  reportName: string,
  start: string,
  end: string,
): Promise<Record<string, string>[]> {
  const id = await generateReport(auth, appId, email, reportName, start, end);
  if (!id) return [];
  const link = await pollReport(auth, appId, id, reportName);
  if (!link) return [];
  return downloadCSV(link);
}

// ── Main API handler ──────────────────────────────────────────────────
export async function GET(request: Request) {
  const { key, secret, appId, email } = creds();

  if (!key || !secret || !appId) {
    const missing = [!key && "BIK_API_KEY", !secret && "BIK_API_SECRET", !appId && "BIK_APP_ID"]
      .filter(Boolean).join(", ");
    return NextResponse.json(
      { success: false, error: `Missing Vercel env vars: ${missing}` },
      { status: 500 },
    );
  }

  const auth = authHeader(key, secret);

  try {
    const { searchParams } = new URL(request.url);
    const days = Math.max(1, parseInt(searchParams.get("days") ?? "7"));

    // Use YYYY-MM-DD (no time) — Bik rejects ISO timestamps for some reports
    const now   = new Date();
    const end   = now.toISOString().split("T")[0];
    const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    console.log(`\n[BIK] ════ Fetch start — days=${days} | ${start} → ${end} | appId=${appId} ════`);

    // Fire all 6 reports in parallel — each will generate then poll independently
    const [agentData, ticketsData, slaData, labelData, csatData, channelData] = await Promise.all([
      fetchReport(auth, appId, email, REPORTS.agent,   start, end),
      fetchReport(auth, appId, email, REPORTS.tickets, start, end),
      fetchReport(auth, appId, email, REPORTS.sla,     start, end),
      fetchReport(auth, appId, email, REPORTS.label,   start, end),
      fetchReport(auth, appId, email, REPORTS.csat,    start, end),
      fetchReport(auth, appId, email, REPORTS.channel, start, end),
    ]);

    console.log(
      `[BIK] ════ Done — agent:${agentData.length} tickets:${ticketsData.length} ` +
      `sla:${slaData.length} label:${labelData.length} csat:${csatData.length} ` +
      `channel:${channelData.length} ════\n`,
    );

    return NextResponse.json({
      success: true,
      data: {
        agentData,
        ticketsData,
        slaData,
        labelData,
        csatData,
        channelData,
        fetchedAt: new Date().toISOString(),
      },
    });

  } catch (error) {
    console.error("[BIK] Fatal error:", error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
