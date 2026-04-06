// FILE LOCATION: app/api/bik/route.ts
// Create this folder structure: app > api > bik > route.ts

import { NextResponse } from "next/server";

const BIK_API_BASE = "https://bikapi.bikayi.app/integrations";
const BIK_KEY = process.env.BIK_API_KEY!;
const BIK_SECRET = process.env.BIK_API_SECRET!;
const BIK_APP_ID = process.env.BIK_APP_ID!;

// Create Basic Auth token from key:secret
function getAuthToken() {
  return Buffer.from(`${BIK_KEY}:${BIK_SECRET}`).toString("base64");
}

// Step 1: Generate a report and get reportHistoryId
async function generateReport(
  reportName: string,
  reportType: string,
  startDate: string,
  endDate: string,
  filters?: { channel?: string; groupBy?: string }
) {
  const body: Record<string, unknown> = {
    reportName,
    reportType,
    dateRange: { startDate, endDate },
    emails: [], // empty - we fetch programmatically
    appId: BIK_APP_ID,
  };

  if (filters) body.filters = filters;

  const res = await fetch(
    `${BIK_API_BASE}/bikPlatformFunctions-generateReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${getAuthToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  const data = await res.json();
  return data?.data?.reportHistoryId;
}

// Step 2: Poll until report is COMPLETED and get download link
async function pollReportUntilDone(
  reportHistoryId: number,
  maxAttempts = 15,
  intervalMs = 3000
): Promise<string | null> {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(
      `${BIK_API_BASE}/bikPlatformFunctions-getReportById`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${getAuthToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reportHistoryId, appId: BIK_APP_ID }),
      }
    );

    const data = await res.json();
    const status = data?.data?.reportStatus;
    const link = data?.data?.downloadLink;

    if (status === "COMPLETED" && link) return link;
    if (status === "FAILED") return null;

    // Wait before next poll
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

// Step 3: Download CSV and parse to array of objects
async function downloadAndParseCSV(url: string): Promise<Record<string, string>[]> {
  const res = await fetch(url);
  const text = await res.text();

  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.replace(/"/g, "").trim());

  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.replace(/"/g, "").trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = values[i] ?? "";
    });
    return row;
  });
}

// Main API handler
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get("days") ?? "30");

    const endDate = new Date().toISOString();
    const startDate = new Date(
      Date.now() - days * 24 * 60 * 60 * 1000
    ).toISOString();

    // Generate all reports in parallel
    const [
      agentEngagementId,
      ticketsOverviewId,
      agentSlaId,
      labelEngagementId,
      csatId,
      channelEngagementId,
    ] = await Promise.all([
      generateReport("Agent Engagement", "Helpdesk", startDate, endDate),
      generateReport("Ticket's Overview", "Helpdesk", startDate, endDate),
      generateReport("Agent SLA report", "Helpdesk", startDate, endDate),
      generateReport("Label Engagement", "Helpdesk", startDate, endDate),
      generateReport("Overall CSAT/NPS", "Helpdesk", startDate, endDate),
      generateReport("Channel Engagement", "Helpdesk", startDate, endDate),
    ]);

    // Poll all reports for completion
    const [
      agentEngagementLink,
      ticketsOverviewLink,
      agentSlaLink,
      labelEngagementLink,
      csatLink,
      channelEngagementLink,
    ] = await Promise.all([
      agentEngagementId ? pollReportUntilDone(agentEngagementId) : null,
      ticketsOverviewId ? pollReportUntilDone(ticketsOverviewId) : null,
      agentSlaId ? pollReportUntilDone(agentSlaId) : null,
      labelEngagementId ? pollReportUntilDone(labelEngagementId) : null,
      csatId ? pollReportUntilDone(csatId) : null,
      channelEngagementId ? pollReportUntilDone(channelEngagementId) : null,
    ]);

    // Download and parse all CSVs
    const [
      agentData,
      ticketsData,
      slaData,
      labelData,
      csatData,
      channelData,
    ] = await Promise.all([
      agentEngagementLink ? downloadAndParseCSV(agentEngagementLink) : [],
      ticketsOverviewLink ? downloadAndParseCSV(ticketsOverviewLink) : [],
      agentSlaLink ? downloadAndParseCSV(agentSlaLink) : [],
      labelEngagementLink ? downloadAndParseCSV(labelEngagementLink) : [],
      csatLink ? downloadAndParseCSV(csatLink) : [],
      channelEngagementLink ? downloadAndParseCSV(channelEngagementLink) : [],
    ]);

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
    console.error("Bik API error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch Bik data" },
      { status: 500 }
    );
  }
}
