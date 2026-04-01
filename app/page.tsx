"use client";

import React, { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Upload, Clock3, MessageSquare, UserRound, AlertTriangle, TrendingUp,
  CheckCircle2, ShieldAlert, Activity, TimerReset, Flame, Users,
  Siren, Download, RepeatIcon,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend,
} from "recharts";

const LIME = "#BFFF00";
const LIME20 = "#BFFF0033";
const LIME10 = "#BFFF0018";
const CHART_COLORS = [LIME, "#ffffff", "#a3a3a3", "#525252", "#d4d4d4", "#737373"];

type Ticket = {
  id: string;
  customerId: string;
  customerName: string;
  contactInfo: string;
  channel: string;
  channelId: string;
  typeOfMessage: string;
  openTimestamp: string;
  assignedTimestamp: string;
  closeTimestamp: string;
  stage: string;
  label: string;
  agent: string;
  closure: number;
  frt: number;
  firstResponseTimestamp: string;
  csatResponse: string;
  csatSentiment: string;
  priority: string;
  queuedTimestamp: string;
  date: string;
  hour: string;
  month: string;
  ageingMinutes: number;
};

function normalizeText(value: unknown, fallback = "Unknown") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value).trim();
}

function parseTimeToMinutes(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") {
    if (value > 0 && value < 1) return Math.round(value * 24 * 60);
    return Math.round(value);
  }
  const str = String(value).trim().toLowerCase();
  if (!str) return 0;
  if (/^\d{1,2}:\d{1,2}(:\d{1,2})?$/.test(str)) {
    const parts = str.split(":").map(Number);
    if (parts.length === 3) return parts[0] * 60 + parts[1] + Math.round(parts[2] / 60);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
  }
  let minutes = 0;
  const dayMatch = str.match(/(\d+)\s*d/);
  const hourMatch = str.match(/(\d+)\s*h/);
  const minMatch = str.match(/(\d+)\s*m/);
  if (dayMatch) minutes += Number(dayMatch[1]) * 24 * 60;
  if (hourMatch) minutes += Number(hourMatch[1]) * 60;
  if (minMatch) minutes += Number(minMatch[1]);
  if (minutes > 0) return minutes;
  const num = Number(str.replace(/[^\d.-]/g, ""));
  return isNaN(num) ? 0 : Math.round(num);
}

function excelDateToJSDate(serial: number) {
  const utc_days = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  const date_info = new Date(utc_value * 1000);
  const fractional_day = serial - Math.floor(serial) + 0.0000001;
  let total_seconds = Math.floor(86400 * fractional_day);
  const seconds = total_seconds % 60;
  total_seconds -= seconds;
  const hours = Math.floor(total_seconds / 3600);
  const minutes = Math.floor((total_seconds % 3600) / 60);
  const result = new Date(date_info);
  result.setHours(hours);
  result.setMinutes(minutes);
  result.setSeconds(seconds);
  return result.toISOString();
}

function parseDateValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Unknown";
  if (value instanceof Date) {
    if (!isNaN(value.getTime())) return value.toISOString();
    return "Unknown";
  }
  if (typeof value === "number") {
    return excelDateToJSDate(value);
  }
  const str = String(value).trim();
  const cleaned = str.replace(/(\d+)(st|nd|rd|th)/, "$1");
  const parsed = new Date(cleaned);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }
  return "Unknown";
}

function detectStage(stage: string) {
  const s = stage.toLowerCase();
  if (s.includes("close") || s.includes("resolved") || s.includes("done") || s === "closed") return "Closed";
  if (s.includes("open") || s.includes("new")) return "Open";
  if (s.includes("pending") || s.includes("hold") || s.includes("await")) return "Pending";
  return stage || "Unknown";
}

function detectPriority(priority: string) {
  const p = priority.toLowerCase();
  if (p.includes("high") || p.includes("urgent") || p.includes("p1")) return "High";
  if (p.includes("medium") || p.includes("normal") || p.includes("p2")) return "Medium";
  if (p.includes("low") || p.includes("p3")) return "Low";
  return priority || "Unknown";
}

function getHourLabel(dateString: string) {
  if (!dateString || dateString === "Unknown") return "Unknown";
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return "Unknown";
  return `${String(d.getHours()).padStart(2, "0")}:00`;
}

function getMonthLabel(dateString: string) {
  if (!dateString || dateString === "Unknown") return "Unknown";
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return "Unknown";
  return d.toLocaleString("en-US", { month: "short", year: "numeric" });
}

function getAgeingMinutes(openTimestamp: string, closeTimestamp: string, stage: string) {
  if (!openTimestamp || openTimestamp === "Unknown") return 0;
  const open = new Date(openTimestamp);
  if (isNaN(open.getTime())) return 0;
  const end = stage === "Closed" && closeTimestamp && closeTimestamp !== "Unknown"
    ? new Date(closeTimestamp) : new Date();
  if (isNaN(end.getTime())) return 0;
  return Math.max(0, Math.round((end.getTime() - open.getTime()) / (1000 * 60)));
}

function formatMinutes(mins: number) {
  if (!mins || mins <= 0) return "0 min";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
}

function getAgeBucket(minutes: number) {
  if (minutes <= 120) return "0-2 hr";
  if (minutes <= 360) return "2-6 hr";
  if (minutes <= 1440) return "6-24 hr";
  return "24h+";
}

function getDayOfWeek(dateString: string) {
  if (!dateString || dateString === "Unknown") return "Unknown";
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return "Unknown";
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
}

export default function CrepdogSupportDashboard() {
  const [data, setData] = useState<Ticket[]>([]);
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [fileName, setFileName] = useState("No file uploaded");

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const binaryStr = e.target?.result;
      const workbook = XLSX.read(binaryStr, { type: "binary", cellDates: true });
      const allRows: Ticket[] = [];
      workbook.SheetNames.forEach((sheetName) => {
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "" });
        jsonData.forEach((row, index) => {
          if (index < 10) {
            console.log(`Row ${index} | Timestamp:`, row["Ticket open timestamp"], "| Stage:", row["Ticket stage"], "| Type:", typeof row["Ticket open timestamp"]);
          }
          const id = normalizeText(row["Ticket Id"], `T-${sheetName}-${index + 1}`);
          const customerId = normalizeText(row["Customer Id"], "Unknown");
          const customerName = normalizeText(row["Customer Name"], "Unknown");
          const contactInfo = normalizeText(row["Contact info"], "Unknown");
          const channel = normalizeText(row["Channel"], "Unknown").toLowerCase();
          const channelId = normalizeText(row["Channel ID"], "Unknown");
          const typeOfMessage = normalizeText(row["Type of Message"], "Unknown");
          const openTimestamp = parseDateValue(row["Ticket open timestamp"]);
          const assignedTimestamp = parseDateValue(row["Ticket assigned timestamp"]);
          const closeTimestamp = parseDateValue(row["Ticket close timestamp"]);
          const rawStage = normalizeText(row["Ticket stage"], "Unknown");
          const label = normalizeText(row["Ticket label"], "Unlabeled");
          const getValue = (row: Record<string, unknown>, keys: string[]) => {
            for (const key of keys) {
              if (row[key] !== undefined && row[key] !== null && row[key] !== "") return row[key];
            }
            return "";
          };
          const agent = normalizeText(getValue(row, ["Agent name", "Agent Name", "agent name", "Assigned to", "Agent", "Owner"]), "Unassigned");
          const closure = parseTimeToMinutes(row["Ticket closure time"]);
          const frt = parseTimeToMinutes(row["First response time"]);
          const firstResponseTimestamp = parseDateValue(row["First response timestamp"]);
          const csatResponse = normalizeText(row["CSAT response"], "Unknown");
          const csatSentiment = normalizeText(row["CSAT sentiment"], "Unknown");
          const priority = detectPriority(normalizeText(row["Ticket priority"], "Unknown"));
          const queuedTimestamp = parseDateValue(row["Ticket queued timestamp"]);
          const stage = detectStage(rawStage);
          const date = openTimestamp !== "Unknown" ? openTimestamp.split("T")[0] : "Unknown";
          const hour = getHourLabel(openTimestamp);
          const month = getMonthLabel(openTimestamp);
          const ageingMinutes = getAgeingMinutes(openTimestamp, closeTimestamp, stage);
          if (id.startsWith("T-") && channel === "unknown" && agent === "Unassigned") return;
          allRows.push({
            id, customerId, customerName, contactInfo, channel, channelId, typeOfMessage,
            openTimestamp, assignedTimestamp, closeTimestamp, stage, label, agent,
            closure, frt, firstResponseTimestamp, csatResponse, csatSentiment,
            priority, queuedTimestamp, date, hour, month, ageingMinutes,
          });
        });
      });
      setData(allRows);
    };
    reader.readAsBinaryString(file);
  };

  const filtered = useMemo(() => {
    return data.filter((row) => {
      const matchesSearch = [row.id, row.customerName, row.customerId, row.contactInfo, row.label, row.agent, row.channel, row.priority]
        .join(" ").toLowerCase().includes(search.toLowerCase());
      const matchesChannel = channelFilter === "all" || row.channel === channelFilter;
      const matchesStage = stageFilter === "all" || row.stage === stageFilter;
      const matchesAgent = agentFilter === "all" || row.agent === agentFilter;
      const matchesMonth = monthFilter === "all" || row.month === monthFilter;
      const matchesPriority = priorityFilter === "all" || row.priority === priorityFilter;
      const rowDate = row.date !== "Unknown" ? new Date(row.date) : null;
      const fromOk = !dateFrom || (rowDate && rowDate >= new Date(dateFrom));
      const toOk = !dateTo || (rowDate && rowDate <= new Date(dateTo));
      return matchesSearch && matchesChannel && matchesStage && matchesAgent && matchesMonth && matchesPriority && fromOk && toOk;
    });
  }, [data, search, channelFilter, stageFilter, agentFilter, monthFilter, priorityFilter, dateFrom, dateTo]);

  const agents = useMemo(() => {
    return [...new Set(data.map((d) => d.agent).filter((a) => a && a !== "Unassigned" && a !== "Unknown"))].sort();
  }, [data]);

  const metrics = useMemo(() => {
    const total = filtered.length;
    const open = filtered.filter((d) => d.stage === "Open").length;
    const pending = filtered.filter((d) => d.stage === "Pending").length;
    const closed = filtered.filter((d) => d.stage === "Closed").length;
    const highPriority = filtered.filter((d) => d.priority === "High").length;
    const negative = filtered.filter((d) => d.csatSentiment.toLowerCase().includes("negative")).length;
    const positive = filtered.filter((d) => d.csatSentiment.toLowerCase().includes("positive")).length;
    const avgFRT = total ? Math.round(filtered.reduce((a, b) => a + b.frt, 0) / total) : 0;
    const closureItems = filtered.filter((d) => d.closure > 0);
    const avgClosure = closureItems.length ? Math.round(closureItems.reduce((a, b) => a + b.closure, 0) / closureItems.length) : 0;
    const csat = total ? Math.round((positive / total) * 100) : 0;
    const slaRisk = filtered.filter((d) => d.frt > 30 || d.closure > 240).length;
    return { total, open, pending, closed, avgFRT, avgClosure, csat, highPriority, negative, slaRisk };
  }, [filtered]);

  const trendData = useMemo(() => {
    const grouped: Record<string, number> = {};
    filtered.forEach((d) => { if (d.date !== "Unknown") grouped[d.date] = (grouped[d.date] || 0) + 1; });
    return Object.entries(grouped).map(([date, tickets]) => ({ date, tickets })).sort((a, b) => a.date.localeCompare(b.date));
  }, [filtered]);

  const hourlyData = useMemo(() => {
    const baseHours = Array.from({ length: 24 }, (_, i) => ({ hour: `${String(i).padStart(2, "0")}:00`, tickets: 0 }));
    filtered.forEach((d) => {
      const idx = baseHours.findIndex((h) => h.hour === d.hour);
      if (idx !== -1) baseHours[idx].tickets += 1;
    });
    return baseHours;
  }, [filtered]);

  const stageData = useMemo(() => {
    const grouped: Record<string, number> = {};
    filtered.forEach((d) => { grouped[d.stage] = (grouped[d.stage] || 0) + 1; });
    return Object.entries(grouped).map(([name, value]) => ({ name, value }));
  }, [filtered]);

  const channelData = useMemo(() => {
    const grouped: Record<string, number> = {};
    filtered.forEach((d) => { grouped[d.channel] = (grouped[d.channel] || 0) + 1; });
    return Object.entries(grouped).map(([name, value]) => ({ name, value }));
  }, [filtered]);

  const issueData = useMemo(() => {
    const grouped: Record<string, number> = {};
    filtered.forEach((d) => { grouped[d.label] = (grouped[d.label] || 0) + 1; });
    return Object.entries(grouped).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 10);
  }, [filtered]);

  const ageingData = useMemo(() => {
    const grouped: Record<string, number> = { "0-2 hr": 0, "2-6 hr": 0, "6-24 hr": 0, "24h+": 0 };
    filtered.filter((d) => d.stage !== "Closed").forEach((d) => { grouped[getAgeBucket(d.ageingMinutes)] += 1; });
    return Object.entries(grouped).map(([name, value]) => ({ name, value }));
  }, [filtered]);

  const slaBucketData = useMemo(() => {
    const buckets = { "≤30m FRT": 0, "31-60m FRT": 0, "1-4h FRT": 0, "4h+ FRT": 0 };
    filtered.forEach((d) => {
      if (d.frt <= 30) buckets["≤30m FRT"] += 1;
      else if (d.frt <= 60) buckets["31-60m FRT"] += 1;
      else if (d.frt <= 240) buckets["1-4h FRT"] += 1;
      else buckets["4h+ FRT"] += 1;
    });
    return Object.entries(buckets).map(([name, value]) => ({ name, value }));
  }, [filtered]);

  const channelPerformanceData = useMemo(() => {
    const grouped: Record<string, { count: number; frt: number; closure: number; closureCount: number }> = {};
    filtered.forEach((d) => {
      if (!grouped[d.channel]) grouped[d.channel] = { count: 0, frt: 0, closure: 0, closureCount: 0 };
      grouped[d.channel].count += 1;
      grouped[d.channel].frt += d.frt;
      if (d.closure > 0) { grouped[d.channel].closure += d.closure; grouped[d.channel].closureCount += 1; }
    });
    return Object.entries(grouped).map(([channel, val]) => ({
      channel,
      avgFRT: val.count ? Math.round(val.frt / val.count) : 0,
      avgClosure: val.closureCount ? Math.round(val.closure / val.closureCount) : 0,
    }));
  }, [filtered]);

  const agentData = useMemo(() => {
    const grouped: Record<string, { name: string; tickets: number; frt: number; closure: number; closed: number; high: number; negative: number; open: number; pending: number }> = {};
    filtered.forEach((d) => {
      if (!grouped[d.agent]) grouped[d.agent] = { name: d.agent, tickets: 0, frt: 0, closure: 0, closed: 0, high: 0, negative: 0, open: 0, pending: 0 };
      grouped[d.agent].tickets += 1;
      grouped[d.agent].frt += d.frt;
      if (d.priority === "High") grouped[d.agent].high += 1;
      if (d.csatSentiment.toLowerCase().includes("negative")) grouped[d.agent].negative += 1;
      if (d.stage === "Open") grouped[d.agent].open += 1;
      if (d.stage === "Pending") grouped[d.agent].pending += 1;
      if (d.closure > 0) { grouped[d.agent].closure += d.closure; grouped[d.agent].closed += 1; }
    });
    return Object.values(grouped)
      .filter((a) => a.name !== "Unassigned" && a.name !== "Unknown")
      .map((a) => ({ ...a, avgFRT: Math.round(a.frt / a.tickets), avgClosure: a.closed ? Math.round(a.closure / a.closed) : 0 }))
      .sort((a, b) => b.tickets - a.tickets);
  }, [filtered]);

  // Day of Week Heatmap
  const dayOfWeekData = useMemo(() => {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const grouped: Record<string, number> = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
    filtered.forEach((d) => {
      const day = getDayOfWeek(d.openTimestamp);
      if (grouped[day] !== undefined) grouped[day] += 1;
    });
    return days.map((day) => ({ day, tickets: grouped[day] }));
  }, [filtered]);

  // Repeat Contacts (customers with more than 1 ticket)
  const repeatContactsData = useMemo(() => {
    const grouped: Record<string, { name: string; tickets: number; channels: Set<string> }> = {};
    filtered.forEach((d) => {
      const key = d.customerId !== "Unknown" ? d.customerId : d.customerName;
      if (!grouped[key]) grouped[key] = { name: d.customerName, tickets: 0, channels: new Set() };
      grouped[key].tickets += 1;
      grouped[key].channels.add(d.channel);
    });
    return Object.values(grouped)
      .filter((c) => c.tickets > 1)
      .map((c) => ({ name: c.name, tickets: c.tickets, channels: [...c.channels].join(", ") }))
      .sort((a, b) => b.tickets - a.tickets)
      .slice(0, 20);
  }, [filtered]);

  // Escalation Data (tickets with FRT > 60 min or high priority unresolved)
  const escalationData = useMemo(() => {
    const escalated = filtered.filter((d) => d.frt > 60 || (d.priority === "High" && d.stage !== "Closed"));
    const byAgent: Record<string, number> = {};
    escalated.forEach((d) => { byAgent[d.agent] = (byAgent[d.agent] || 0) + 1; });
    return Object.entries(byAgent)
      .map(([agent, count]) => ({ agent, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [filtered]);

  // CSAT Trend by Month
  const csatTrendData = useMemo(() => {
    const grouped: Record<string, { positive: number; total: number }> = {};
    filtered.forEach((d) => {
      if (d.month === "Unknown") return;
      if (!grouped[d.month]) grouped[d.month] = { positive: 0, total: 0 };
      grouped[d.month].total += 1;
      if (d.csatSentiment.toLowerCase().includes("positive")) grouped[d.month].positive += 1;
    });
    return Object.entries(grouped)
      .map(([month, val]) => ({ month, csat: val.total ? Math.round((val.positive / val.total) * 100) : 0 }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [filtered]);

  const exportCSV = () => {
    const headers = ["Ticket ID", "Customer", "Channel", "Agent", "Stage", "Priority", "FRT (min)", "Closure (min)", "CSAT", "Label", "Date"];
    const rows = filtered.map((r) => [r.id, r.customerName, r.channel, r.agent, r.stage, r.priority, r.frt, r.closure, r.csatSentiment, r.label, r.date]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `crepdog_support_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const bestAgent = agentData.length ? [...agentData].sort((a, b) => a.avgFRT - b.avgFRT)[0] : null;
  const worstAgent = agentData.length ? [...agentData].sort((a, b) => b.avgFRT - a.avgFRT)[0] : null;
  const peakHour = hourlyData.length ? [...hourlyData].sort((a, b) => b.tickets - a.tickets)[0]?.hour : "N/A";
  const peakDay = dayOfWeekData.length ? [...dayOfWeekData].sort((a, b) => b.tickets - a.tickets)[0]?.day : "N/A";

  const kpis = [
    { title: "Total Tickets", value: metrics.total, icon: MessageSquare },
    { title: "Open Tickets", value: metrics.open, icon: AlertTriangle },
    { title: "Pending Tickets", value: metrics.pending, icon: Clock3 },
    { title: "Closed Tickets", value: metrics.closed, icon: CheckCircle2 },
    { title: "Avg FRT", value: formatMinutes(metrics.avgFRT), icon: TrendingUp },
    { title: "Avg Closure", value: formatMinutes(metrics.avgClosure), icon: TimerReset },
    { title: "Positive CSAT", value: `${metrics.csat}%`, icon: UserRound },
    { title: "High Priority", value: metrics.highPriority, icon: ShieldAlert },
    { title: "Negative CSAT", value: metrics.negative, icon: Activity },
    { title: "SLA Risk", value: metrics.slaRisk, icon: Siren },
    { title: "Peak Hour", value: peakHour || "N/A", icon: Flame },
    { title: "Agents", value: agents.length, icon: Users },
  ];

  return (
    <div className="min-h-screen text-white p-6" style={{ backgroundColor: "#000000" }}>
      <div className="mx-auto max-w-7xl space-y-6">
        {/* ── HEADER ── */}
<div className="flex flex-col gap-4 rounded-3xl border p-6 shadow-2xl md:flex-row md:items-center md:justify-between"
  style={{ borderColor: `${LIME}33`, backgroundColor: "#0a0a0a" }}>
  <div className="flex items-center gap-4">
    <img
      src="/crepdog-logo.png"
alt="Crepdog Crew"
onError={(e) => (e.currentTarget.style.display = "none")}
style={{ height: "56px", width: "56px", borderRadius: "12px", objectFit: "contain", backgroundColor: "#000" }}
    />
    <div>
      <h1 className="text-3xl font-semibold tracking-tight" style={{ color: LIME }}>
        Crepdog Crew Support Dashboard
      </h1>
      <p className="mt-1 text-sm text-zinc-400">Internal customer support operations control panel</p>
      <p className="mt-1 text-xs text-zinc-500">Current file: {fileName}</p>
    </div>
  </div>
  <div className="flex gap-3">
    <button onClick={exportCSV}
      className="inline-flex cursor-pointer items-center rounded-2xl px-4 py-2 text-sm font-medium border transition-all hover:opacity-80"
      style={{ borderColor: LIME, color: LIME, backgroundColor: LIME10 }}>
      <Download className="mr-2 h-4 w-4" />
      Export CSV
    </button>
    <label className="inline-flex cursor-pointer items-center rounded-2xl px-4 py-2 text-sm font-medium text-black hover:opacity-90"
      style={{ backgroundColor: LIME }}>
      <Upload className="mr-2 h-4 w-4" />
      Upload Excel
      <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileUpload} />
    </label>
  </div>
</div>

        {/* ── FILTERS ── */}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-8">
          {[
            <Input key="search" placeholder="Search ticket / customer / agent" value={search} onChange={(e) => setSearch(e.target.value)}
              className="rounded-2xl text-white placeholder:text-zinc-500" style={{ borderColor: `${LIME}33`, backgroundColor: "#0a0a0a" }} />,
            <Select key="channel" value={channelFilter} onValueChange={setChannelFilter}>
              <SelectTrigger className="rounded-2xl text-white" style={{ borderColor: `${LIME}33`, backgroundColor: "#0a0a0a" }}><SelectValue placeholder="Channel" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Channels</SelectItem>
                {[...new Set(data.map((d) => d.channel))].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>,
            <Select key="stage" value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger className="rounded-2xl text-white" style={{ borderColor: `${LIME}33`, backgroundColor: "#0a0a0a" }}><SelectValue placeholder="Stage" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stages</SelectItem>
                {[...new Set(data.map((d) => d.stage))].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>,
            <Select key="agent" value={agentFilter} onValueChange={setAgentFilter}>
              <SelectTrigger className="rounded-2xl text-white" style={{ borderColor: `${LIME}33`, backgroundColor: "#0a0a0a" }}><SelectValue placeholder="Agent" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Agents</SelectItem>
                {agents.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>,
            <Select key="month" value={monthFilter} onValueChange={setMonthFilter}>
              <SelectTrigger className="rounded-2xl text-white" style={{ borderColor: `${LIME}33`, backgroundColor: "#0a0a0a" }}><SelectValue placeholder="Month" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Months</SelectItem>
                {[...new Set(data.map((d) => d.month))].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>,
            <Select key="priority" value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="rounded-2xl text-white" style={{ borderColor: `${LIME}33`, backgroundColor: "#0a0a0a" }}><SelectValue placeholder="Priority" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priority</SelectItem>
                {[...new Set(data.map((d) => d.priority))].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>,
            <Input key="from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-2xl text-white" style={{ borderColor: `${LIME}33`, backgroundColor: "#0a0a0a" }} />,
            <Input key="to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="rounded-2xl text-white" style={{ borderColor: `${LIME}33`, backgroundColor: "#0a0a0a" }} />,
          ]}
        </div>

        {/* ── KPI CARDS ── */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {kpis.map((kpi) => {
            const Icon = kpi.icon;
            return (
              <Card key={kpi.title} className="rounded-3xl shadow-xl" style={{ borderColor: `${LIME}22`, backgroundColor: "#0a0a0a" }}>
                <CardContent className="flex items-center justify-between p-6">
                  <div>
                    <p className="text-sm text-zinc-400">{kpi.title}</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{kpi.value}</p>
                  </div>
                  <div className="rounded-2xl p-3" style={{ backgroundColor: LIME20 }}>
                    <Icon className="h-5 w-5" style={{ color: LIME }} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* ── AGENT SPOTLIGHT + MANAGER SNAPSHOT ── */}
        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="rounded-3xl shadow-xl" style={{ borderColor: `${LIME}33`, background: `linear-gradient(135deg, ${LIME10}, transparent)` }}>
            <CardHeader>
              <CardTitle style={{ color: LIME }} className="flex items-center gap-2">🟢 Best Response Agent</CardTitle>
            </CardHeader>
            <CardContent>
              {bestAgent ? (
                <div className="space-y-3">
                  <p className="text-2xl font-semibold text-white">{bestAgent.name}</p>
                  <span className="text-xs px-2 py-1 rounded-lg" style={{ backgroundColor: LIME20, color: LIME }}>Top Performer</span>
                  <p className="text-zinc-300">Avg FRT: <span className="font-medium" style={{ color: LIME }}>{formatMinutes(bestAgent.avgFRT)}</span></p>
                  <p className="text-zinc-400">Tickets handled: {bestAgent.tickets}</p>
                </div>
              ) : <p className="text-zinc-400">No data</p>}
            </CardContent>
          </Card>

          <Card className="rounded-3xl shadow-xl" style={{ borderColor: "#ef444433", background: "linear-gradient(135deg, #ef444418, transparent)" }}>
            <CardHeader>
              <CardTitle className="text-red-400 flex items-center gap-2">🔴 Slowest Response Agent</CardTitle>
            </CardHeader>
            <CardContent>
              {worstAgent ? (
                <div className="space-y-3">
                  <p className="text-2xl font-semibold text-white">{worstAgent.name}</p>
                  <span className="text-xs bg-red-500/20 text-red-300 px-2 py-1 rounded-lg">Needs Improvement</span>
                  <p className="text-zinc-300">Avg FRT: <span className="text-red-400 font-medium">{formatMinutes(worstAgent.avgFRT)}</span></p>
                  <p className="text-zinc-400">Tickets handled: {worstAgent.tickets}</p>
                </div>
              ) : <p className="text-zinc-400">No data</p>}
            </CardContent>
          </Card>

          <Card className="rounded-3xl shadow-xl" style={{ borderColor: `${LIME}22`, backgroundColor: "#0a0a0a" }}>
            <CardHeader><CardTitle className="text-white">Manager Snapshot</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {[
                ["Open + Pending", metrics.open + metrics.pending],
                ["High Priority", metrics.highPriority],
                ["SLA Risk", metrics.slaRisk],
                ["Peak Hour", peakHour],
                ["Peak Day", peakDay],
                ["Repeat Customers", repeatContactsData.length],
              ].map(([label, val]) => (
                <div key={String(label)} className="flex justify-between text-sm">
                  <span className="text-zinc-400">{label}</span>
                  <span className="font-medium" style={{ color: LIME }}>{val}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* ── TABS ── */}
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="rounded-2xl p-1" style={{ borderColor: `${LIME}22`, backgroundColor: "#0a0a0a", border: "1px solid" }}>
            {["overview", "ops", "agents", "insights", "tickets"].map((tab) => (
              <TabsTrigger key={tab} value={tab} className="capitalize rounded-xl data-[state=active]:text-black"
                style={{ ["--tab-active-bg" as string]: LIME } as React.CSSProperties}>
                {tab === "ops" ? "Ops Tracking" : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* OVERVIEW TAB */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-3">
              <Card className="rounded-3xl xl:col-span-2 shadow-xl" style={{ borderColor: `${LIME}22`, backgroundColor: "#0a0a0a" }}>
                <CardHeader><CardTitle className="text-white">Daily Ticket Trend</CardTitle></CardHeader>
                <CardContent className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                      <XAxis dataKey="date" stroke="#a1a1aa" />
                      <YAxis stroke="#a1a1aa" />
                      <Tooltip contentStyle={{ backgroundColor: "#111", border: `1px solid ${LIME}44`, borderRadius: 12 }} />
                      <Line type="monotone" dataKey="tickets" stroke={LIME} strokeWidth={3} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="rounded-3xl shadow-xl" style={{ borderColor: `${LIME}22`, backgroundColor: "#0a0a0a" }}>
                <CardHeader><CardTitle className="text-white">Ticket Stage Split</CardTitle></CardHeader>
                <CardContent className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={stageData} dataKey="value" nameKey="name" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                        {stageData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: "#111", border: `1px solid ${LIME}44`, borderRadius: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <Card className="rounded-3xl shadow-xl" style={{ borderColor: `${LIME}22`, backgroundColor: "#0a0a0a" }}>
                <CardHeader><CardTitle className="text-white">Hourly Ticket Load</CardTitle></CardHeader>
                <CardContent className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hourlyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                      <XAxis dataKey="hour" stroke="#a1a1aa" />
                      <YAxis stroke="#a1a1aa" />
                      <Tooltip contentStyle={{ backgroundColor: "#111", border: `1px solid ${LIME}44`, borderRadius: 12 }} />
                      <Bar dataKey="tickets" fill={LIME} radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="rounded-3xl shadow-xl" style={{ borderColor: `${LIME}22`, backgroundColor: "#0a0a0a" }}>
                <CardHeader><CardTitle className="text-white">Channel Breakdown</CardTitle></CardHeader>
                <CardContent className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={channelData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                      <XAxis dataKey="name" stroke="#a1a1aa" />
                      <YAxis stroke="#a1a1aa" />
                      <Tooltip contentStyle={{ backgroundColor: "#111", border: `1px solid ${LIME}44`, borderRadius: 12 }} />
                      <Bar dataKey="value" fill={LIME} radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <Card className="rounded-3xl shadow-xl" style={{ borderColor: `${LIME}22`, backgroundColor: "#0a0a0a" }}>
              <CardHeader><CardTitle className="text-white">Top Ticket Labels</CardTitle></CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {issueData.map((issue) => (
                  <div key={issue.name} className="flex items-center justify-between rounded-2xl border px-4 py-3"
                    style={{ borderColor: `${LIME}22`, backgroundColor: "#111" }}>
                    <span className="font-medium text-white">{issue.name}</span>
                    <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{ backgroundColor: LIME20, color: LIME }}>{issue.value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* OPS TAB */}
          <TabsContent value="ops" className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-2">
              <Card className="rounded-3xl shadow-xl" style={{ borderColor: `${LIME}22`, backgroundColor: "#0a0a0a" }}>
                <CardHeader><CardTitle className="text-white">Pending Ageing Buckets</CardTitle></CardHeader>
                <CardContent className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={ageingData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                      <XAxis dataKey="name" stroke="#a1a1aa" />
                      <YAxis stroke="#a1a1aa" />
                      <Tooltip contentStyle={{ backgroundColor: "#111", border: `1px solid ${LIME}44`, borderRadius: 12 }} />
                      <Bar dataKey="value" fill={LIME} radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="rounded-3xl shadow-xl" style={{ borderColor: `${LIME}22`, backgroundColor: "#0a0a0a" }}>
                <CardHeader><CardTitle className="text-white">FRT SLA Buckets</CardTitle></CardHeader>
                <CardContent className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={slaBucketData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                      <XAxis dataKey="name" stroke="#a1a1aa" />
                      <YAxis stroke="#a1a1aa" />
                      <Tooltip contentStyle={{ backgroundColor: "#111", border: `1px solid ${LIME}44`, borderRadius: 12 }} />
                      <Bar dataKey="value" fill={LIME} radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <Card className="rounded-3xl shadow-xl" style={{ borderColor: `${LIME}22`, backgroundColor: "#0a0a0a" }}>
              <CardHeader><CardTitle className="text-white">Channel Performance</CardTitle></CardHeader>
              <CardContent>
                <table className="w-full text-sm text-white">
                  <thead>
                    <tr className="text-left" style={{ borderBottom: `1px solid ${LIME}22` }}>
                      <th className="pb-3 text-zinc-400">Channel</th>
                      <th className="pb-3 text-zinc-400">Avg FRT</th>
                      <th className="pb-3 text-zinc-400">Avg Closure</th>
                    </tr>
                  </thead>
                  <tbody>
                    {channelPerformanceData.map((row) => (
                      <tr key={row.channel} style={{ borderBottom: `1px solid ${LIME}11` }}>
                        <td className="py-4 font-medium" style={{ color: LIME }}>{row.channel}</td>
                        <td className="py-4">{formatMinutes(row.avgFRT)}</td>
                        <td className="py-4">{formatMinutes(row.avgClosure)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* AGENTS TAB */}
          <TabsContent value="agents">
            <div className="grid gap-4 xl:grid-cols-3">
              <Card className="rounded-3xl xl:col-span-2 shadow-xl" style={{ borderColor: `${LIME}22`, backgroundColor: "#0a0a0a" }}>
                <CardHeader><CardTitle className="text-white">Agent Performance Table</CardTitle></CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-white">
                      <thead>
                        <tr className="text-left" style={{ borderBottom: `1px solid ${LIME}22` }}>
                          {["Agent", "Tickets", "Open", "Pending", "Avg FRT", "Avg Closure", "High Priority", "Negative CSAT"].map((h) => (
                            <th key={h} className="pb-3 text-zinc-400">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {agentData.map((agent) => (
                          <tr key={agent.name} style={{ borderBottom: `1px solid ${LIME}11` }}>
                            <td className="py-3 font-medium" style={{ color: LIME }}>{agent.name}</td>
                            <td className="py-3">{agent.tickets}</td>
                            <td className="py-3">{agent.open}</td>
                            <td className="py-3">{agent.pending}</td>
                            <td className="py-3">{formatMinutes(agent.avgFRT)}</td>
                            <td className="py-3">{formatMinutes(agent.avgClosure)}</td>
                            <td className="py-3">{agent.high}</td>
                            <td className="py-3">{agent.negative}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-3xl shadow-xl" style={{ borderColor: `${LIME}22`, backgroundColor: "#0a0a0a" }}>
                <CardHeader><CardTitle className="text-white">Agent Leaderboard</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {agentData.slice(0, 10).map((agent, index) => (
                    <div key={agent.name} className="rounded-2xl border p-4" style={{ borderColor: `${LIME}22`, backgroundColor: "#111" }}>
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-white">#{index + 1} {agent.name}</p>
                        <span className="text-xs px-2 py-1 rounded-lg font-bold" style={{ backgroundColor: LIME20, color: LIME }}>{agent.tickets} tickets</span>
                      </div>
                      <div className="mt-2 text-sm text-zinc-400">
                        FRT: {formatMinutes(agent.avgFRT)} • Closure: {formatMinutes(agent.avgClosure)}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* INSIGHTS TAB */}
          <TabsContent value="insights" className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-2">
              {/* Day of Week Heatmap */}
              <Card className="rounded-3xl shadow-xl" style={{ borderColor: `${LIME}22`, backgroundColor: "#0a0a0a" }}>
                <CardHeader><CardTitle className="text-white">📅 Day of Week Volume</CardTitle></CardHeader>
                <CardContent className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dayOfWeekData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                      <XAxis dataKey="day" stroke="#a1a1aa" />
                      <YAxis stroke="#a1a1aa" />
                      <Tooltip contentStyle={{ backgroundColor: "#111", border: `1px solid ${LIME}44`, borderRadius: 12 }} />
                      <Bar dataKey="tickets" fill={LIME} radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* CSAT Trend */}
              <Card className="rounded-3xl shadow-xl" style={{ borderColor: `${LIME}22`, backgroundColor: "#0a0a0a" }}>
                <CardHeader><CardTitle className="text-white">😊 CSAT % Trend by Month</CardTitle></CardHeader>
                <CardContent className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={csatTrendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                      <XAxis dataKey="month" stroke="#a1a1aa" />
                      <YAxis stroke="#a1a1aa" domain={[0, 100]} />
                      <Tooltip contentStyle={{ backgroundColor: "#111", border: `1px solid ${LIME}44`, borderRadius: 12 }} formatter={(v) => [`${v}%`, "CSAT"]} />
                      <Line type="monotone" dataKey="csat" stroke={LIME} strokeWidth={3} dot={{ fill: LIME, r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Escalation by Agent */}
            <Card className="rounded-3xl shadow-xl" style={{ borderColor: `${LIME}22`, backgroundColor: "#0a0a0a" }}>
              <CardHeader>
                <CardTitle className="text-white">🚨 Escalation Risk by Agent</CardTitle>
                <p className="text-xs text-zinc-500 mt-1">Tickets with FRT &gt; 60 min OR high priority unresolved</p>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={escalationData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                    <XAxis type="number" stroke="#a1a1aa" />
                    <YAxis type="category" dataKey="agent" stroke="#a1a1aa" width={120} />
                    <Tooltip contentStyle={{ backgroundColor: "#111", border: `1px solid ${LIME}44`, borderRadius: 12 }} />
                    <Bar dataKey="count" fill="#ef4444" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Repeat Contacts */}
            <Card className="rounded-3xl shadow-xl" style={{ borderColor: `${LIME}22`, backgroundColor: "#0a0a0a" }}>
              <CardHeader>
                <CardTitle className="text-white">🔁 Repeat Contact Customers</CardTitle>
                <p className="text-xs text-zinc-500 mt-1">Customers who raised more than 1 ticket</p>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-white">
                    <thead>
                      <tr className="text-left" style={{ borderBottom: `1px solid ${LIME}22` }}>
                        <th className="pb-3 text-zinc-400">Customer</th>
                        <th className="pb-3 text-zinc-400">Total Tickets</th>
                        <th className="pb-3 text-zinc-400">Channels Used</th>
                      </tr>
                    </thead>
                    <tbody>
                      {repeatContactsData.length === 0 ? (
                        <tr><td colSpan={3} className="py-6 text-center text-zinc-500">No repeat contacts found</td></tr>
                      ) : repeatContactsData.map((c, i) => (
                        <tr key={i} style={{ borderBottom: `1px solid ${LIME}11` }}>
                          <td className="py-3 font-medium" style={{ color: LIME }}>{c.name}</td>
                          <td className="py-3">
                            <span className="px-2 py-1 rounded-lg text-xs font-bold" style={{ backgroundColor: LIME20, color: LIME }}>{c.tickets}</span>
                          </td>
                          <td className="py-3 text-zinc-400">{c.channels}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* LIVE TICKETS TAB */}
          <TabsContent value="tickets">
            <Card className="rounded-3xl shadow-xl" style={{ borderColor: `${LIME}22`, backgroundColor: "#0a0a0a" }}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-white">Live Ticket View</CardTitle>
                  <span className="text-xs text-zinc-500">{filtered.length} tickets</span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-white">
                    <thead>
                      <tr className="text-left" style={{ borderBottom: `1px solid ${LIME}22` }}>
                        {["Ticket ID", "Customer", "Channel", "Issue", "Agent", "Stage", "Priority", "FRT", "Closure", "Ageing"].map((h) => (
                          <th key={h} className="pb-3 text-zinc-400">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.slice(0, 500).map((row) => (
                        <tr key={`${row.id}-${row.openTimestamp}`} style={{ borderBottom: `1px solid ${LIME}11` }}>
                          <td className="py-3 font-medium" style={{ color: LIME }}>{row.id}</td>
                          <td className="py-3">{row.customerName}</td>
                          <td className="py-3">{row.channel}</td>
                          <td className="py-3">{row.label}</td>
                          <td className="py-3">{row.agent}</td>
                          <td className="py-3">
                            <span className="px-2 py-1 rounded-lg text-xs font-medium"
                              style={{
                                backgroundColor: row.stage === "Closed" ? "#16a34a22" : row.stage === "Open" ? "#ef444422" : "#f59e0b22",
                                color: row.stage === "Closed" ? "#4ade80" : row.stage === "Open" ? "#f87171" : "#fbbf24",
                              }}>
                              {row.stage}
                            </span>
                          </td>
                          <td className="py-3">
                            <span style={{ color: row.priority === "High" ? "#f87171" : row.priority === "Medium" ? "#fbbf24" : "#a1a1aa" }}>
                              {row.priority}
                            </span>
                          </td>
                          <td className="py-3">{formatMinutes(row.frt)}</td>
                          <td className="py-3">{formatMinutes(row.closure)}</td>
                          <td className="py-3">{formatMinutes(row.ageingMinutes)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}