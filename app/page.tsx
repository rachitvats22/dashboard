"use client";

import React, { useMemo, useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Upload, Clock3, MessageSquare, UserRound, AlertTriangle, TrendingUp,
  CheckCircle2, ShieldAlert, Activity, TimerReset, Flame, Users,
  Siren, Download, RefreshCw, Wifi, WifiOff, Mail, X, ChevronRight,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid, AreaChart, Area,
} from "recharts";

// ── THEME ─────────────────────────────────────────────────────────
const LIME   = "#BFFF00";
const LIME20 = "#BFFF0033";
const LIME10 = "#BFFF0018";
const COLORS = [LIME, "#ffffff", "#a3a3a3", "#525252", "#d4d4d4", "#737373"];

// ── AGENT CONFIG ──────────────────────────────────────────────────
const MANAGER_AGENTS  = ["rachit"];
const ALLOWED_AGENTS  = ["rachit", "sushanto", "aashish", "deepti", "anurag"];
const EXCLUDED_AGENTS = [
  "shivam", "diksha", "siddharth", "muskan", "suhail",
  "jaanvi", "crepdogcrew main", "crepdog crew main", "crepdog_crew", "main", "bot",
];

// Working hours: 11 AM – 8 PM
const WORK_HOUR_START = 11;
const WORK_HOUR_END   = 20;

function isAllowedAgent(name: string) {
  const n = (name || "").trim().toLowerCase();
  if (!n || n.length < 2) return false;
  if (EXCLUDED_AGENTS.some((e) => n.includes(e))) return false;
  return ALLOWED_AGENTS.some((a) => n.includes(a));
}
function isManagerAgent(name: string) {
  return MANAGER_AGENTS.some((m) => (name || "").toLowerCase().includes(m));
}
function normalizeChannel(ch: string): string {
  const c = (ch || "").toLowerCase().trim();
  if (c === "smtp" || c === "mail" || c === "e-mail") return "email";
  return c || "other";
}
function isEmailChannel(ch: string)   { return ch === "email"; }
function isSocialChannel(ch: string)  { return ch === "whatsapp" || ch === "instagram"; }

// ── TYPES ─────────────────────────────────────────────────────────
type Ticket = {
  id: string; customerId: string; customerName: string; contactInfo: string;
  channel: string; channelId: string; typeOfMessage: string;
  openTimestamp: string; assignedTimestamp: string; closeTimestamp: string;
  stage: string; label: string; agent: string; closure: number; frt: number;
  firstResponseTimestamp: string; csatResponse: string; csatSentiment: string;
  priority: string; queuedTimestamp: string; date: string; hour: string;
  month: string; ageingMinutes: number;
};

// ── HELPERS ───────────────────────────────────────────────────────
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
  const d = str.match(/(\d+)\s*d/); const h = str.match(/(\d+)\s*h/); const m = str.match(/(\d+)\s*m/);
  if (d) minutes += Number(d[1]) * 24 * 60;
  if (h) minutes += Number(h[1]) * 60;
  if (m) minutes += Number(m[1]);
  if (minutes > 0) return minutes;
  const num = Number(str.replace(/[^\d.-]/g, ""));
  return isNaN(num) ? 0 : Math.round(num);
}
function excelDateToJSDate(serial: number) {
  const utc_days  = Math.floor(serial - 25569);
  const date_info = new Date(utc_days * 86400 * 1000);
  const fractional_day = serial - Math.floor(serial) + 0.0000001;
  let total_seconds = Math.floor(86400 * fractional_day);
  const seconds = total_seconds % 60; total_seconds -= seconds;
  const hours   = Math.floor(total_seconds / 3600);
  const minutes = Math.floor((total_seconds % 3600) / 60);
  const result  = new Date(date_info);
  result.setHours(hours); result.setMinutes(minutes); result.setSeconds(seconds);
  return result.toISOString();
}
function parseDateValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Unknown";
  if (value instanceof Date) { if (!isNaN(value.getTime())) return value.toISOString(); return "Unknown"; }
  if (typeof value === "number") {
    if (value > 1_000_000_000_000) return new Date(value).toISOString();
    if (value > 1_000_000_000)     return new Date(value * 1000).toISOString();
    return excelDateToJSDate(value);
  }
  const str = String(value).trim();
  if (!str || str === "0" || str.toLowerCase() === "null") return "Unknown";
  const native = new Date(str.replace(/(\d+)(st|nd|rd|th)/, "$1"));
  if (!isNaN(native.getTime())) return native.toISOString();
  const dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:[T\s](\d{1,2}:\d{2}(?::\d{2})?))?/);
  if (dmy) { const iso = `${dmy[3]}-${dmy[2].padStart(2,"0")}-${dmy[1].padStart(2,"0")}${dmy[4]?"T"+dmy[4]:"T00:00:00"}`; const d=new Date(iso); if(!isNaN(d.getTime())) return d.toISOString(); }
  const ymd = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:[T\s](\d{1,2}:\d{2}(?::\d{2})?))?/);
  if (ymd) { const iso = `${ymd[1]}-${ymd[2].padStart(2,"0")}-${ymd[3].padStart(2,"0")}${ymd[4]?"T"+ymd[4]:"T00:00:00"}`; const d=new Date(iso); if(!isNaN(d.getTime())) return d.toISOString(); }
  const asNum = Number(str.replace(/[^\d]/g, ""));
  if (!isNaN(asNum) && asNum > 1_000_000_000) { const d=new Date(asNum>1_000_000_000_000?asNum:asNum*1000); if(!isNaN(d.getTime())) return d.toISOString(); }
  return "Unknown";
}
function detectStage(stage: string) {
  const s = (stage || "").toLowerCase();
  if (s.includes("close")||s.includes("resolved")||s.includes("done")||s==="closed") return "Closed";
  if (s.includes("open")||s.includes("new")) return "Open";
  if (s.includes("pending")||s.includes("hold")||s.includes("await")) return "Pending";
  return stage||"Unknown";
}
function detectPriority(priority: string) {
  const p = (priority || "").toLowerCase();
  if (p.includes("high")||p.includes("urgent")||p.includes("p1")) return "High";
  if (p.includes("medium")||p.includes("normal")||p.includes("p2")) return "Medium";
  if (p.includes("low")||p.includes("p3")) return "Low";
  return priority||"Unknown";
}
function getHourLabel(dateString: string) {
  if (!dateString||dateString==="Unknown") return "Unknown";
  const d=new Date(dateString); if(isNaN(d.getTime())) return "Unknown";
  return `${String(d.getHours()).padStart(2,"0")}:00`;
}
function getHourNumber(dateString: string): number {
  if (!dateString||dateString==="Unknown") return -1;
  const d=new Date(dateString); if(isNaN(d.getTime())) return -1;
  return d.getHours();
}
function getMonthLabel(dateString: string) {
  if (!dateString||dateString==="Unknown") return "Unknown";
  const d=new Date(dateString); if(isNaN(d.getTime())) return "Unknown";
  return d.toLocaleString("en-US",{month:"short",year:"numeric"});
}
function getDayOfWeek(dateString: string) {
  if (!dateString||dateString==="Unknown") return "Unknown";
  const d=new Date(dateString); if(isNaN(d.getTime())) return "Unknown";
  return ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()];
}
function getDayIndex(dateString: string): number {
  if (!dateString||dateString==="Unknown") return -1;
  const d=new Date(dateString); if(isNaN(d.getTime())) return -1;
  // Mon=0 … Sun=6
  return (d.getDay()+6)%7;
}
function getAgeingMinutes(openTimestamp: string, closeTimestamp: string, stage: string) {
  if (!openTimestamp||openTimestamp==="Unknown") return 0;
  const open=new Date(openTimestamp); if(isNaN(open.getTime())) return 0;
  const end=stage==="Closed"&&closeTimestamp&&closeTimestamp!=="Unknown"?new Date(closeTimestamp):new Date();
  if(isNaN(end.getTime())) return 0;
  return Math.max(0,Math.round((end.getTime()-open.getTime())/(1000*60)));
}
function formatMinutes(mins: number) {
  if (!mins||mins<=0) return "0 min";
  if (mins<60) return `${mins} min`;
  const h=Math.floor(mins/60); const m=mins%60;
  return m===0?`${h} hr`:`${h} hr ${m} min`;
}
function getAgeBucket(minutes: number) {
  if (minutes<=120)  return "0-2 hr";
  if (minutes<=360)  return "2-6 hr";
  if (minutes<=1440) return "6-24 hr";
  return "24h+";
}
function resolveField(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) { const v=row[k]; if(v!==undefined&&v!==null&&String(v).trim()!=="") return String(v).trim(); }
  return "";
}

// ── WORKING HOURS FRT ─────────────────────────────────────────────
// Returns true if the hour is inside 11 AM – 8 PM window
function isWorkingHour(h: number) { return h >= WORK_HOUR_START && h < WORK_HOUR_END; }

// ── MAIN DASHBOARD ────────────────────────────────────────────────
export default function CrepdogSupportDashboard() {
  const [data,           setData]           = useState<Ticket[]>([]);
  const [isLive,         setIsLive]         = useState(false);
  const [isLoadingLive,  setIsLoadingLive]  = useState(false);
  const [liveError,      setLiveError]      = useState<string | null>(null);
  const [lastRefreshed,  setLastRefreshed]  = useState<string | null>(null);
  const [dateRangeDays,  setDateRangeDays]  = useState("1");   // default 24 h
  const [search,         setSearch]         = useState("");
  const [channelFilter,  setChannelFilter]  = useState("all");
  const [stageFilter,    setStageFilter]    = useState("all");
  const [agentFilter,    setAgentFilter]    = useState("all");
  const [monthFilter,    setMonthFilter]    = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [dateFrom,       setDateFrom]       = useState("");
  const [dateTo,         setDateTo]         = useState("");
  const [fileName,       setFileName]       = useState("No file uploaded");
  const [emailModalOpen, setEmailModalOpen] = useState(false);

  // ── LIVE DATA ──────────────────────────────────────────────────
  const fetchLiveData = useCallback(async () => {
    setIsLoadingLive(true);
    setLiveError(null);
    try {
      const res  = await fetch(`/api/bik?days=${dateRangeDays}`);
      if (!res.ok) { setLiveError(`API error ${res.status} — check your BIK_API_KEY and BIK_API_SECRET in Vercel env vars`); return; }
      const json = await res.json();
      if (json.success && json.data) {
        const { agentData, ticketsData } = json.data;
        const rows: Ticket[] = [];
        if (ticketsData?.length > 0) {
          ticketsData.forEach((t: Record<string, string>, i: number) => {
            const agent = resolveField(t,"Agent Name","Agent name","agent_name","Assigned To","Assigned to","assigned_to","Agent","agent","Owner","owner");
            if (!isAllowedAgent(agent)) return;
            const openTs = parseDateValue(resolveField(t,"Ticket open timestamp","Ticket Open Timestamp","ticket_open_timestamp","Open Time","Open Timestamp","Opened At","Created At","Created at","created_at","createdAt","Ticket Created At","Ticket Created","Date Created","Creation Time","Start Time","Raised At","Submitted At"));
            const closeTs= parseDateValue(resolveField(t,"Ticket close timestamp","Ticket Close Timestamp","ticket_close_timestamp","Close Time","Close Timestamp","Closed At","closed_at","closedAt","Ticket Closed At","Resolved At","Resolution Date","End Time"));
            const stage   = detectStage(resolveField(t,"Ticket stage","Ticket Stage","Stage","Status","status","Ticket Status"));
            const priority= detectPriority(resolveField(t,"Ticket priority","Ticket Priority","Priority","priority"));
            const frt     = parseTimeToMinutes(resolveField(t,"First response time","First Response Time","FRT","frt","first_response_time","Avg FRT","Average FRT"));
            const closure = parseTimeToMinutes(resolveField(t,"Ticket closure time","Closure Time","Resolution Time","resolution_time","Close Time","Avg Closure"));
            const label   = resolveField(t,"Ticket label","Ticket Label","Label","label","Tag","ticket_label")||"Unlabeled";
            const csatSentiment=resolveField(t,"CSAT sentiment","CSAT Sentiment","CSAT response","CSAT Response","CSAT","csat","csat_sentiment");
            const channel = normalizeChannel(resolveField(t,"Channel","channel","Source","source","Medium"));
            const customerName=resolveField(t,"Customer Name","Customer name","Customer","customer","customer_name");
            const customerId   =resolveField(t,"Customer Id","Customer ID","customer_id","customerId");
            rows.push({
              id: resolveField(t,"Ticket ID","Ticket Id","ticket_id","id")||`live-${i}`,
              customerId, customerName, contactInfo:"", channel, channelId:"", typeOfMessage:"",
              openTimestamp:openTs, assignedTimestamp:"", closeTimestamp:closeTs,
              stage, label, agent, closure, frt,
              firstResponseTimestamp:"", csatResponse:"", csatSentiment, priority, queuedTimestamp:"",
              date: openTs!=="Unknown"?openTs.split("T")[0]:"Unknown",
              hour: getHourLabel(openTs), month: getMonthLabel(openTs),
              ageingMinutes: getAgeingMinutes(openTs,closeTs,stage),
            });
          });
        }
        if (rows.length===0 && agentData?.length>0) {
          agentData.forEach((a: Record<string, string>) => {
            const agent=resolveField(a,"Agent Name","Agent name","Agent","agent","name","Name","Assigned To","assigned_to");
            if (!isAllowedAgent(agent)) return;
            const total =parseInt(resolveField(a,"Total Tickets","Tickets Assigned","Tickets","tickets","Ticket Count")||"0",10);
            const closed=parseInt(resolveField(a,"Resolved","Closed","Tickets Resolved","Total Resolved","closed")||"0",10);
            const open  =parseInt(resolveField(a,"Open","Tickets Open","open")||"0",10);
            const frtVal=parseTimeToMinutes(resolveField(a,"Average FRT","Avg FRT","FRT","First Response Time","avg_frt"));
            const resVal=parseTimeToMinutes(resolveField(a,"Average Closure Time","Avg Closure","Resolution Time","Closure Time","avg_closure"));
            const channel=normalizeChannel(resolveField(a,"Channel","channel","Source"));
            const count =total||1;
            for (let i=0;i<count;i++) {
              const isClosed=i<closed; const isOpen=!isClosed&&i<closed+open;
              rows.push({
                id:`live-${agent.replace(/\s/g,"-")}-${i}`, customerId:"", customerName:"", contactInfo:"",
                channel, channelId:"", typeOfMessage:"",
                openTimestamp:new Date().toISOString(), assignedTimestamp:"",
                closeTimestamp:isClosed?new Date().toISOString():"",
                stage:isClosed?"Closed":isOpen?"Open":"Pending",
                label:"Live Data", agent, closure:isClosed?resVal:0, frt:frtVal,
                firstResponseTimestamp:"", csatResponse:"",
                csatSentiment:parseInt(resolveField(a,"Positive CSAT","CSAT Positive","positive_csat")||"0")>i?"positive":"",
                priority:detectPriority(resolveField(a,"Priority","Ticket Priority","priority")),
                queuedTimestamp:"",
                date:new Date().toISOString().split("T")[0],
                hour:"Unknown", month:getMonthLabel(new Date().toISOString()), ageingMinutes:0,
              });
            }
          });
        }
        setData(rows);
        setLastRefreshed(new Date().toLocaleTimeString());
      } else {
        setLiveError(json.error ?? "Failed to fetch live data — reports may still be generating, try Refresh in 30s");
      }
    } catch (err) {
      setLiveError(`Connection failed: ${String(err)} — ensure BIK_API_KEY and BIK_API_SECRET are set in Vercel Environment Variables`);
    } finally {
      setIsLoadingLive(false);
    }
  }, [dateRangeDays]);

  useEffect(() => {
    if (!isLive) return;
    fetchLiveData();
    const interval=setInterval(fetchLiveData,5*60*1000);
    return () => clearInterval(interval);
  }, [isLive, fetchLiveData]);

  // ── EXCEL UPLOAD ──────────────────────────────────────────────
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file=event.target.files?.[0]; if (!file) return;
    setFileName(file.name); setIsLive(false);
    const reader=new FileReader();
    reader.onload=(e) => {
      const binaryStr=e.target?.result;
      const workbook=XLSX.read(binaryStr,{type:"binary",cellDates:true});
      const allRows: Ticket[]=[];
      workbook.SheetNames.forEach((sheetName) => {
        const worksheet=workbook.Sheets[sheetName];
        const jsonData=XLSX.utils.sheet_to_json<Record<string,unknown>>(worksheet,{defval:""});
        jsonData.forEach((row,index) => {
          const getValue=(keys: string[])=>{for(const k of keys){if(row[k]!==undefined&&row[k]!==null&&row[k]!=="")return row[k];}return "";};
          const id=normalizeText(row["Ticket Id"],`T-${sheetName}-${index+1}`);
          const agent=normalizeText(getValue(["Agent name","Agent Name","agent name","Assigned to","Agent","Owner"]),"Unassigned");
          const openTimestamp=parseDateValue(row["Ticket open timestamp"]);
          const closeTimestamp=parseDateValue(row["Ticket close timestamp"]);
          const stage=detectStage(normalizeText(row["Ticket stage"],"Unknown"));
          const ageingMinutes=getAgeingMinutes(openTimestamp,closeTimestamp,stage);
          const date=openTimestamp!=="Unknown"?openTimestamp.split("T")[0]:"Unknown";
          allRows.push({
            id, customerId:normalizeText(row["Customer Id"],"Unknown"), customerName:normalizeText(row["Customer Name"],"Unknown"),
            contactInfo:normalizeText(row["Contact info"],"Unknown"),
            channel:normalizeChannel(normalizeText(row["Channel"],"Unknown")),
            channelId:normalizeText(row["Channel ID"],"Unknown"),
            typeOfMessage:normalizeText(row["Type of Message"],"Unknown"),
            openTimestamp, assignedTimestamp:parseDateValue(row["Ticket assigned timestamp"]),
            closeTimestamp, stage, label:normalizeText(row["Ticket label"],"Unlabeled"), agent,
            closure:parseTimeToMinutes(row["Ticket closure time"]),
            frt:parseTimeToMinutes(row["First response time"]),
            firstResponseTimestamp:parseDateValue(row["First response timestamp"]),
            csatResponse:normalizeText(row["CSAT response"],"Unknown"),
            csatSentiment:normalizeText(row["CSAT sentiment"],"Unknown"),
            priority:detectPriority(normalizeText(row["Ticket priority"],"Unknown")),
            queuedTimestamp:parseDateValue(row["Ticket queued timestamp"]),
            date, hour:getHourLabel(openTimestamp), month:getMonthLabel(openTimestamp), ageingMinutes,
          });
        });
      });
      setData(allRows);
    };
    reader.readAsBinaryString(file);
  };

  // ── FILTERED DATA ──────────────────────────────────────────────
  const filtered=useMemo(()=>{
    return data.filter((row)=>{
      if(EXCLUDED_AGENTS.some((e)=>row.agent.toLowerCase().includes(e))) return false;
      const matchesSearch=[row.id,row.customerName,row.customerId,row.contactInfo,row.label,row.agent,row.channel,row.priority].join(" ").toLowerCase().includes(search.toLowerCase());
      const matchesChannel=channelFilter==="all"||row.channel===channelFilter;
      const matchesStage=stageFilter==="all"||row.stage===stageFilter;
      const matchesAgent=agentFilter==="all"||row.agent===agentFilter;
      const matchesMonth=monthFilter==="all"||row.month===monthFilter;
      const matchesPriority=priorityFilter==="all"||row.priority===priorityFilter;
      const rowDate=row.date!=="Unknown"?new Date(row.date):null;
      const fromOk=!dateFrom||(rowDate&&rowDate>=new Date(dateFrom));
      const toOk=!dateTo||(rowDate&&rowDate<=new Date(dateTo));
      return matchesSearch&&matchesChannel&&matchesStage&&matchesAgent&&matchesMonth&&matchesPriority&&fromOk&&toOk;
    });
  },[data,search,channelFilter,stageFilter,agentFilter,monthFilter,priorityFilter,dateFrom,dateTo]);

  const agents=useMemo(()=>[...new Set(data.map(d=>d.agent).filter(a=>{
    if(!a||a==="Unassigned"||a==="Unknown") return false;
    if(EXCLUDED_AGENTS.some(e=>a.toLowerCase().includes(e))) return false;
    return true;
  }))].sort(),[data]);

  // ── METRICS ──────────────────────────────────────────────────
  const metrics=useMemo(()=>{
    const total=filtered.length;
    const open=filtered.filter(d=>d.stage==="Open").length;
    const pending=filtered.filter(d=>d.stage==="Pending").length;
    const closed=filtered.filter(d=>d.stage==="Closed").length;
    const highPriority=filtered.filter(d=>d.priority==="High").length;
    const negative=filtered.filter(d=>d.csatSentiment.toLowerCase().includes("negative")).length;
    const positive=filtered.filter(d=>d.csatSentiment.toLowerCase().includes("positive")).length;
    const frtItems=filtered.filter(d=>d.frt>0);
    const avgFRT=frtItems.length?Math.round(frtItems.reduce((a,b)=>a+b.frt,0)/frtItems.length):0;
    const closureItems=filtered.filter(d=>d.closure>0);
    const avgClosure=closureItems.length?Math.round(closureItems.reduce((a,b)=>a+b.closure,0)/closureItems.length):0;
    const csat=(positive+negative)>0?Math.round((positive/(positive+negative))*100):0;
    const slaRisk=filtered.filter(d=>d.frt>30||d.closure>240).length;
    return {total,open,pending,closed,avgFRT,avgClosure,csat,highPriority,negative,positive,slaRisk};
  },[filtered]);

  // ── WORKING HOURS FRT ─────────────────────────────────────────
  const workingHoursFRT=useMemo(()=>{
    const wh=filtered.filter(d=>{
      const h=getHourNumber(d.openTimestamp);
      return h!==-1&&isWorkingHour(h)&&d.frt>0;
    });
    if(!wh.length) return {avg:0,count:0,breach:0};
    const avg=Math.round(wh.reduce((a,b)=>a+b.frt,0)/wh.length);
    const breach=wh.filter(d=>d.frt>30).length;
    return {avg,count:wh.length,breach};
  },[filtered]);

  // ── CHART DATA ──────────────────────────────────────────────
  const trendData=useMemo(()=>{
    const grouped: Record<string,number>={};
    filtered.forEach(d=>{if(d.date&&d.date!=="Unknown") grouped[d.date]=(grouped[d.date]||0)+1;});
    return Object.entries(grouped).map(([date,tickets])=>({date,tickets})).sort((a,b)=>a.date.localeCompare(b.date)).slice(-14);
  },[filtered]);

  const hourlyData=useMemo(()=>{
    const base=Array.from({length:24},(_,i)=>({hour:`${String(i).padStart(2,"0")}:00`,tickets:0}));
    filtered.forEach(d=>{if(!d.hour||d.hour==="Unknown")return;const idx=base.findIndex(h=>h.hour===d.hour);if(idx!==-1)base[idx].tickets+=1;});
    return base;
  },[filtered]);

  const stageData=useMemo(()=>{
    const grouped: Record<string,number>={};
    filtered.forEach(d=>{grouped[d.stage]=(grouped[d.stage]||0)+1;});
    return Object.entries(grouped).map(([name,value])=>({name,value}));
  },[filtered]);

  const channelData=useMemo(()=>{
    const grouped: Record<string,number>={};
    filtered.forEach(d=>{grouped[d.channel]=(grouped[d.channel]||0)+1;});
    return Object.entries(grouped).map(([name,value])=>({name,value}));
  },[filtered]);

  const issueData=useMemo(()=>{
    const grouped: Record<string,number>={};
    filtered.forEach(d=>{grouped[d.label]=(grouped[d.label]||0)+1;});
    return Object.entries(grouped).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value).slice(0,10);
  },[filtered]);

  const ageingData=useMemo(()=>{
    const grouped: Record<string,number>={"0-2 hr":0,"2-6 hr":0,"6-24 hr":0,"24h+":0};
    filtered.filter(d=>d.stage!=="Closed").forEach(d=>{grouped[getAgeBucket(d.ageingMinutes)]+=1;});
    return Object.entries(grouped).map(([name,value])=>({name,value}));
  },[filtered]);

  const slaBucketData=useMemo(()=>{
    const buckets={"≤30m FRT":0,"31-60m FRT":0,"1-4h FRT":0,"4h+ FRT":0};
    filtered.forEach(d=>{
      if(d.frt<=30) buckets["≤30m FRT"]+=1;
      else if(d.frt<=60) buckets["31-60m FRT"]+=1;
      else if(d.frt<=240) buckets["1-4h FRT"]+=1;
      else buckets["4h+ FRT"]+=1;
    });
    return Object.entries(buckets).map(([name,value])=>({name,value}));
  },[filtered]);

  const channelPerformanceData=useMemo(()=>{
    const grouped: Record<string,{count:number;frt:number;closure:number;closureCount:number}>={};
    filtered.forEach(d=>{
      if(!grouped[d.channel]) grouped[d.channel]={count:0,frt:0,closure:0,closureCount:0};
      grouped[d.channel].count+=1; grouped[d.channel].frt+=d.frt;
      if(d.closure>0){grouped[d.channel].closure+=d.closure;grouped[d.channel].closureCount+=1;}
    });
    return Object.entries(grouped).map(([channel,val])=>({channel,avgFRT:val.count?Math.round(val.frt/val.count):0,avgClosure:val.closureCount?Math.round(val.closure/val.closureCount):0}));
  },[filtered]);

  // ── AGENT PERFORMANCE (generic) ────────────────────────────────
  function buildAgentStats(tickets: Ticket[]) {
    const grouped: Record<string,{name:string;tickets:number;frt:number;closure:number;closed:number;high:number;negative:number;open:number;pending:number;positive:number}>={};
    tickets.forEach(d=>{
      if(!grouped[d.agent]) grouped[d.agent]={name:d.agent,tickets:0,frt:0,closure:0,closed:0,high:0,negative:0,open:0,pending:0,positive:0};
      grouped[d.agent].tickets+=1; grouped[d.agent].frt+=d.frt;
      if(d.priority==="High") grouped[d.agent].high+=1;
      if(d.csatSentiment.toLowerCase().includes("negative")) grouped[d.agent].negative+=1;
      if(d.csatSentiment.toLowerCase().includes("positive")) grouped[d.agent].positive+=1;
      if(d.stage==="Open")    grouped[d.agent].open+=1;
      if(d.stage==="Pending") grouped[d.agent].pending+=1;
      if(d.closure>0){grouped[d.agent].closure+=d.closure;grouped[d.agent].closed+=1;}
    });
    return Object.values(grouped)
      .filter(a=>a.name!=="Unassigned"&&a.name!=="Unknown"&&!EXCLUDED_AGENTS.some(e=>a.name.toLowerCase().includes(e)))
      .map(a=>({
        ...a,
        avgFRT:Math.round(a.frt/a.tickets),
        avgClosure:a.closed?Math.round(a.closure/a.closed):0,
        resolutionRate:Math.round((a.closed/a.tickets)*100),
        score:a.closed*5+a.positive*4+Math.max(0,20-Math.round(a.frt/a.tickets))+Math.max(0,50-Math.round(a.closure/(a.closed||1))/10),
      }))
      .sort((a,b)=>b.tickets-a.tickets);
  }

  const agentData=useMemo(()=>buildAgentStats(filtered),[filtered]);

  // Email-only agent stats
  const emailTickets=useMemo(()=>filtered.filter(d=>isEmailChannel(d.channel)),[filtered]);
  const emailAgentData=useMemo(()=>buildAgentStats(emailTickets),[emailTickets]);

  // Social (WA + IG) agent stats
  const socialTickets=useMemo(()=>filtered.filter(d=>isSocialChannel(d.channel)),[filtered]);
  const socialAgentData=useMemo(()=>buildAgentStats(socialTickets),[socialTickets]);

  // ── BEST / WORST HELPERS ───────────────────────────────────────
  function getBest(list: ReturnType<typeof buildAgentStats>) {
    return list.length?([...list].sort((a,b)=>a.avgFRT-b.avgFRT).filter(a=>a.avgFRT>0)[0]??list[0]):null;
  }
  function getWorst(list: ReturnType<typeof buildAgentStats>) {
    return list.length?([...list].filter(a=>!isManagerAgent(a.name)).sort((a,b)=>b.avgFRT-a.avgFRT)[0]??null):null;
  }

  const bestAgent    = getBest(agentData);
  const worstAgent   = getWorst(agentData);
  const bestEmail    = getBest(emailAgentData);
  const worstEmail   = getWorst(emailAgentData);
  const bestSocial   = getBest(socialAgentData);
  const worstSocial  = getWorst(socialAgentData);

  // ── DAY OF WEEK / CSAT TREND / ESCALATION ─────────────────────
  const dayOfWeekData=useMemo(()=>{
    const days=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
    const grouped: Record<string,number>={Mon:0,Tue:0,Wed:0,Thu:0,Fri:0,Sat:0,Sun:0};
    filtered.forEach(d=>{const day=getDayOfWeek(d.openTimestamp);if(grouped[day]!==undefined)grouped[day]+=1;});
    return days.map(day=>({day,tickets:grouped[day]}));
  },[filtered]);

  const csatTrendData=useMemo(()=>{
    const grouped: Record<string,{positive:number;total:number}>={};
    filtered.forEach(d=>{
      if(d.month==="Unknown") return;
      if(!grouped[d.month]) grouped[d.month]={positive:0,total:0};
      grouped[d.month].total+=1;
      if(d.csatSentiment.toLowerCase().includes("positive")) grouped[d.month].positive+=1;
    });
    return Object.entries(grouped).map(([month,val])=>({month,csat:val.total?Math.round((val.positive/val.total)*100):0})).sort((a,b)=>a.month.localeCompare(b.month));
  },[filtered]);

  const escalationData=useMemo(()=>{
    const escalated=filtered.filter(d=>d.frt>60||(d.priority==="High"&&d.stage!=="Closed"));
    const byAgent: Record<string,number>={};
    escalated.forEach(d=>{byAgent[d.agent]=(byAgent[d.agent]||0)+1;});
    return Object.entries(byAgent).map(([agent,count])=>({agent,count})).sort((a,b)=>b.count-a.count).slice(0,10);
  },[filtered]);

  // ── OPEN EMAIL TICKETS (for modal) ────────────────────────────
  const openEmailTickets=useMemo(()=>filtered.filter(d=>isEmailChannel(d.channel)&&d.stage==="Open"),[filtered]);

  // ── HEATMAP: day × hour (11 AM – 8 PM) ───────────────────────
  const HEAT_HOURS=Array.from({length:9},(_,i)=>i+WORK_HOUR_START); // 11..19
  const HEAT_DAYS =["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const heatmapData=useMemo(()=>{
    const grid: number[][]=Array.from({length:7},()=>Array(HEAT_HOURS.length).fill(0));
    filtered.forEach(d=>{
      const dayIdx=getDayIndex(d.openTimestamp);
      const h=getHourNumber(d.openTimestamp);
      if(dayIdx<0||h<WORK_HOUR_START||h>=WORK_HOUR_END) return;
      const hourIdx=h-WORK_HOUR_START;
      if(hourIdx>=0&&hourIdx<HEAT_HOURS.length) grid[dayIdx][hourIdx]+=1;
    });
    return grid;
  },[filtered]);

  const heatMax=useMemo(()=>Math.max(1,...heatmapData.flat()),[heatmapData]);

  // ── CUSTOMER RISK TRACKER (email) ─────────────────────────────
  const customerRiskData=useMemo(()=>{
    const emailF=filtered.filter(d=>isEmailChannel(d.channel));
    const grouped: Record<string,{name:string;tickets:Ticket[];customerId:string}>={};
    emailF.forEach(d=>{
      const key=d.customerId!=="Unknown"?d.customerId:d.customerName;
      if(!grouped[key]) grouped[key]={name:d.customerName,tickets:[],customerId:d.customerId};
      grouped[key].tickets.push(d);
    });
    return Object.values(grouped)
      .filter(c=>c.tickets.length>=1)
      .map(c=>{
        const t=c.tickets;
        const negCount=t.filter(x=>x.csatSentiment.toLowerCase().includes("negative")).length;
        const avgFRT=t.filter(x=>x.frt>0).length?Math.round(t.filter(x=>x.frt>0).reduce((a,b)=>a+b.frt,0)/t.filter(x=>x.frt>0).length):0;
        const hasHigh=t.some(x=>x.priority==="High");
        const openCount=t.filter(x=>x.stage==="Open").length;
        const labels=[...new Set(t.map(x=>x.label).filter(x=>x!=="Unlabeled"))].join(", ")||"General";
        const ids=t.map(x=>x.id).join(", ");
        let riskScore=0;
        riskScore+=negCount*3; riskScore+=t.length>3?2:t.length>1?1:0;
        riskScore+=avgFRT>120?2:avgFRT>60?1:0; riskScore+=hasHigh?2:0; riskScore+=openCount>0?1:0;
        const risk=riskScore>=5?"🔴 High Risk":riskScore>=3?"🟡 Medium Risk":"🟢 Low Risk";
        const sentiment=negCount>0?"Negative 😡":t.some(x=>x.csatSentiment.toLowerCase().includes("positive"))?"Positive 😊":"Neutral 😐";
        return {name:c.name,ticketCount:t.length,avgFRT,risk,riskScore,sentiment,labels,ids,openCount,lastDelay:avgFRT};
      })
      .sort((a,b)=>b.riskScore-a.riskScore)
      .slice(0,20);
  },[filtered]);

  const repeatContactsData=useMemo(()=>{
    const grouped: Record<string,{name:string;tickets:number;channels:Set<string>}>={};
    filtered.forEach(d=>{
      const key=d.customerId!=="Unknown"?d.customerId:d.customerName;
      if(!grouped[key]) grouped[key]={name:d.customerName,tickets:0,channels:new Set()};
      grouped[key].tickets+=1; grouped[key].channels.add(d.channel);
    });
    return Object.values(grouped).filter(c=>c.tickets>1).map(c=>({name:c.name,tickets:c.tickets,channels:[...c.channels].join(", ")})).sort((a,b)=>b.tickets-a.tickets).slice(0,20);
  },[filtered]);

  const peakHour=hourlyData.length?[...hourlyData].sort((a,b)=>b.tickets-a.tickets)[0]?.hour:"N/A";
  const peakDay=dayOfWeekData.length?[...dayOfWeekData].sort((a,b)=>b.tickets-a.tickets)[0]?.day:"N/A";

  const exportCSV=()=>{
    const headers=["Ticket ID","Customer","Channel","Agent","Stage","Priority","FRT (min)","Closure (min)","CSAT","Label","Date"];
    const rows=filtered.map(r=>[r.id,r.customerName,r.channel,r.agent,r.stage,r.priority,r.frt,r.closure,r.csatSentiment,r.label,r.date]);
    const csv=[headers,...rows].map(r=>r.map(v=>`"${v}"`).join(",")).join("\n");
    const blob=new Blob([csv],{type:"text/csv"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a"); a.href=url;
    a.download=`crepdog_support_${new Date().toISOString().split("T")[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const kpis=[
    {title:"Total Tickets",   value:metrics.total,                     icon:MessageSquare},
    {title:"Open Tickets",    value:metrics.open,                      icon:AlertTriangle},
    {title:"Pending Tickets", value:metrics.pending,                   icon:Clock3},
    {title:"Closed Tickets",  value:metrics.closed,                    icon:CheckCircle2},
    {title:"Avg FRT",         value:formatMinutes(metrics.avgFRT),     icon:TrendingUp},
    {title:"Avg Closure",     value:formatMinutes(metrics.avgClosure), icon:TimerReset},
    {title:"Positive CSAT",   value:`${metrics.csat}%`,               icon:UserRound},
    {title:"High Priority",   value:metrics.highPriority,              icon:ShieldAlert},
    {title:"Negative CSAT",   value:metrics.negative,                  icon:Activity},
    {title:"SLA Risk",        value:metrics.slaRisk,                   icon:Siren},
    {title:"Peak Hour",       value:peakHour||"N/A",                   icon:Flame},
    {title:"Agents",          value:agents.length,                     icon:Users},
  ];

  const tt={backgroundColor:"#111",border:`1px solid ${LIME}33`,borderRadius:12,color:"#fff"};

  // ── AGENT CARD COMPONENT ───────────────────────────────────────
  function AgentCard({title,agent,color,gradient,badge,badgeColor}:{title:string;agent:ReturnType<typeof getBest>;color:string;gradient:string;badge:string;badgeColor:string}) {
    return (
      <Card className="rounded-3xl shadow-xl" style={{borderColor:`${color}44`,background:gradient}}>
        <CardHeader><CardTitle className="flex items-center gap-2 text-sm" style={{color}}>
          <div className="h-2.5 w-2.5 rounded-full animate-pulse" style={{backgroundColor:color}}/>
          {title}
        </CardTitle></CardHeader>
        <CardContent>
          {agent?(
            <div className="space-y-2">
              <p className="text-xl font-semibold text-white">{agent.name}</p>
              <span className="inline-block rounded-lg px-2 py-1 text-xs font-bold" style={{backgroundColor:badgeColor,color:color==="#BFFF00"?"#000":"#fff"}}>{badge}</span>
              <p className="text-zinc-300 text-xs">Avg FRT: <span className="font-medium" style={{color}}>{formatMinutes(agent.avgFRT)}</span></p>
              <p className="text-zinc-300 text-xs">Resolution: <span className="font-medium" style={{color}}>{agent.resolutionRate}%</span></p>
              <p className="text-zinc-400 text-xs">{agent.tickets} tickets</p>
              <div className="h-1 w-full rounded-full bg-zinc-800">
                <div className="h-1 rounded-full" style={{width:`${agent.resolutionRate}%`,backgroundColor:color}}/>
              </div>
            </div>
          ):<p className="text-zinc-400 text-sm">No data yet</p>}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-6">
      <div className="mx-auto max-w-[1400px] space-y-5">

        {/* ── HEADER ── */}
        <div className="flex flex-col gap-4 rounded-3xl border p-6 shadow-2xl md:flex-row md:items-center md:justify-between" style={{borderColor:`${LIME}33`,backgroundColor:"#0a0a0a"}}>
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl text-[9px] font-black leading-tight text-black" style={{backgroundColor:LIME}}>
              <span>CREPDOG</span><span>CREW</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold md:text-3xl" style={{color:LIME}}>Crepdog Crew Support Dashboard</h1>
              <p className="mt-1 text-sm text-zinc-400">Internal customer support operations control panel</p>
              <p className="mt-1 text-xs" style={{color:LIME}}>
                {isLive?`● Live Mode — Auto-refresh every 5 min — Last: ${lastRefreshed??'—'}`:`📁 File: ${fileName}`}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={()=>setIsLive(p=>!p)}
              className="inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium transition"
              style={{backgroundColor:isLive?LIME:"transparent",color:isLive?"#000":LIME,border:`1px solid ${LIME}44`}}>
              {isLive?<Wifi className="h-4 w-4"/>:<WifiOff className="h-4 w-4"/>}
              {isLive?"Live: ON":"Go Live"}
            </button>
            {isLive&&(<>
              <button onClick={fetchLiveData} disabled={isLoadingLive}
                className="inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium"
                style={{border:`1px solid ${LIME}44`,color:LIME,backgroundColor:LIME10}}>
                <RefreshCw className={`h-4 w-4 ${isLoadingLive?"animate-spin":""}`}/>
                {isLoadingLive?"Fetching...":"Refresh"}
              </button>
              <select value={dateRangeDays} onChange={e=>setDateRangeDays(e.target.value)}
                className="rounded-2xl px-4 py-2 text-sm text-white"
                style={{backgroundColor:"#0a0a0a",border:`1px solid ${LIME}33`}}>
                <option value="1">Last 24 hours</option>
                <option value="7">Last 7 days</option>
                <option value="14">Last 14 days</option>
                <option value="30">Last 30 days</option>
                <option value="60">Last 60 days</option>
                <option value="90">Last 90 days</option>
              </select>
            </>)}
            {!isLive&&(<>
              <button onClick={exportCSV}
                className="inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium"
                style={{border:`1px solid ${LIME}44`,color:LIME,backgroundColor:LIME10}}>
                <Download className="h-4 w-4"/> Export CSV
              </button>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium text-black" style={{backgroundColor:LIME}}>
                <Upload className="h-4 w-4"/> Upload Excel
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileUpload}/>
              </label>
            </>)}
          </div>
        </div>

        {/* ── ERROR ── */}
        {liveError&&(
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-400">
            ⚠️ {liveError}
            <div className="mt-2 text-xs text-red-300 space-y-1">
              <p>1. Go to <strong>Vercel → Project → Settings → Environment Variables</strong></p>
              <p>2. Make sure <strong>BIK_API_KEY</strong> and <strong>BIK_API_SECRET</strong> are added</p>
              <p>3. Redeploy after adding env vars</p>
            </div>
          </div>
        )}
        {isLoadingLive&&(
          <div className="rounded-2xl px-5 py-8 text-center" style={{border:`1px solid ${LIME}22`,backgroundColor:"#0a0a0a"}}>
            <RefreshCw className="mx-auto mb-3 h-8 w-8 animate-spin" style={{color:LIME}}/>
            <p className="text-zinc-400">Fetching live data from Bik...</p>
            <p className="mt-1 text-xs text-zinc-600">Reports generating — takes 60–120 seconds</p>
          </div>
        )}

        {/* ── FILTERS ── */}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-8">
          <Input placeholder="Search ticket / customer / agent" value={search} onChange={e=>setSearch(e.target.value)}
            className="rounded-2xl text-white placeholder:text-zinc-500" style={{borderColor:`${LIME}33`,backgroundColor:"#0a0a0a"}}/>
          {[
            {value:channelFilter, onChange:setChannelFilter, placeholder:"Channel", options:[...new Set(data.map(d=>d.channel))]},
            {value:stageFilter,   onChange:setStageFilter,   placeholder:"Stage",   options:[...new Set(data.map(d=>d.stage))]},
            {value:agentFilter,   onChange:setAgentFilter,   placeholder:"Agent",   options:agents},
            {value:monthFilter,   onChange:setMonthFilter,   placeholder:"Month",   options:[...new Set(data.map(d=>d.month))]},
            {value:priorityFilter,onChange:setPriorityFilter,placeholder:"Priority",options:[...new Set(data.map(d=>d.priority))]},
          ].map(({value,onChange,placeholder,options})=>(
            <Select key={placeholder} value={value} onValueChange={onChange}>
              <SelectTrigger className="rounded-2xl text-white" style={{borderColor:`${LIME}33`,backgroundColor:"#0a0a0a"}}>
                <SelectValue placeholder={`All ${placeholder}s`}/>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All {placeholder}s</SelectItem>
                {options.map(o=><SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          ))}
          <Input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} className="rounded-2xl text-white" style={{borderColor:`${LIME}33`,backgroundColor:"#0a0a0a"}}/>
          <Input type="date" value={dateTo}   onChange={e=>setDateTo(e.target.value)}   className="rounded-2xl text-white" style={{borderColor:`${LIME}33`,backgroundColor:"#0a0a0a"}}/>
        </div>

        {/* ── KPI CARDS ── */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {kpis.map(kpi=>{
            const Icon=kpi.icon;
            return (
              <Card key={kpi.title} className="rounded-3xl shadow-xl" style={{borderColor:`${LIME}22`,backgroundColor:"#0a0a0a"}}>
                <CardContent className="flex items-center justify-between p-6">
                  <div>
                    <p className="text-sm text-zinc-400">{kpi.title}</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{kpi.value}</p>
                  </div>
                  <div className="rounded-2xl p-3" style={{backgroundColor:LIME20}}>
                    <Icon className="h-5 w-5" style={{color:LIME}}/>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* ── WORKING HOURS FRT ── */}
        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="rounded-3xl shadow-xl xl:col-span-2" style={{borderColor:`${LIME}22`,backgroundColor:"#0a0a0a"}}>
            <CardHeader><CardTitle className="text-white">⏰ Working Hours FRT (11 AM – 8 PM)</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                {[
                  {label:"Avg FRT (work hrs)",value:formatMinutes(workingHoursFRT.avg),color:LIME},
                  {label:"Tickets in window",value:workingHoursFRT.count,color:"#a1a1aa"},
                  {label:"SLA Breach (>30m)",value:workingHoursFRT.breach,color:"#ef4444"},
                ].map(m=>(
                  <div key={m.label} className="rounded-2xl p-4 text-center" style={{backgroundColor:"#111",border:`1px solid ${LIME}11`}}>
                    <p className="text-xs text-zinc-400 mb-1">{m.label}</p>
                    <p className="text-xl font-bold" style={{color:m.color}}>{m.value}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-zinc-500">Only tickets opened between 11:00 and 20:00 are counted. SLA breach = FRT &gt; 30 min.</p>
            </CardContent>
          </Card>

          {/* ── OPEN EMAIL TICKETS TRIGGER CARD ── */}
          <button onClick={()=>setEmailModalOpen(true)}
            className="rounded-3xl p-6 text-left transition hover:scale-[1.02] active:scale-[0.99]"
            style={{border:`2px solid ${LIME}44`,backgroundColor:"#0a0a0a",cursor:"pointer"}}>
            <div className="flex items-center gap-3 mb-4">
              <div className="rounded-2xl p-3" style={{backgroundColor:LIME20}}>
                <Mail className="h-6 w-6" style={{color:LIME}}/>
              </div>
              <div>
                <p className="font-bold text-white text-lg">Open Email Tickets</p>
                <p className="text-xs text-zinc-400">Click to see all open emails in system</p>
              </div>
              <ChevronRight className="ml-auto h-5 w-5" style={{color:LIME}}/>
            </div>
            <p className="text-4xl font-black" style={{color:LIME}}>{openEmailTickets.length}</p>
            <p className="text-sm text-zinc-400 mt-1">tickets awaiting response</p>
            <div className="mt-4 h-1.5 w-full rounded-full bg-zinc-800">
              <div className="h-1.5 rounded-full" style={{width:`${Math.min(100,Math.round(openEmailTickets.length/Math.max(metrics.total,1)*100))}%`,backgroundColor:LIME}}/>
            </div>
          </button>
        </div>

        {/* ── BEST / WORST AGENTS: OVERALL + EMAIL + SOCIAL ── */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider px-1">Agent Performance Spotlight</h2>

          {/* Overall */}
          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="rounded-3xl shadow-xl" style={{borderColor:`${LIME}44`,background:`linear-gradient(135deg,${LIME10},transparent)`}}>
              <CardHeader><CardTitle className="flex items-center gap-2" style={{color:LIME}}>
                <div className="h-3 w-3 rounded-full animate-pulse" style={{backgroundColor:LIME}}/>
                🏆 Best Response Agent — Overall
              </CardTitle></CardHeader>
              <CardContent>
                {bestAgent?(
                  <div className="space-y-2">
                    <p className="text-2xl font-semibold text-white">{bestAgent.name}</p>
                    <span className="inline-block rounded-lg px-2 py-1 text-xs font-bold text-black" style={{backgroundColor:LIME}}>Top Performer</span>
                    <p className="text-zinc-300">Avg FRT: <span className="font-medium" style={{color:LIME}}>{formatMinutes(bestAgent.avgFRT)}</span></p>
                    <p className="text-zinc-300">Resolution: <span className="font-medium" style={{color:LIME}}>{bestAgent.resolutionRate}%</span></p>
                    <p className="text-zinc-400 text-sm">{bestAgent.tickets} tickets</p>
                    <div className="h-1.5 w-full rounded-full bg-zinc-800"><div className="h-1.5 rounded-full" style={{width:`${bestAgent.resolutionRate}%`,backgroundColor:LIME}}/></div>
                  </div>
                ):<p className="text-zinc-400">No data — upload Excel or go Live</p>}
              </CardContent>
            </Card>

            <Card className="rounded-3xl shadow-xl" style={{borderColor:"#ef444433",background:"linear-gradient(135deg,#ef444418,transparent)"}}>
              <CardHeader><CardTitle className="flex items-center gap-2 text-red-400">
                <div className="h-3 w-3 rounded-full bg-red-500 animate-pulse"/>
                🔴 Slowest Response Agent — Overall
              </CardTitle></CardHeader>
              <CardContent>
                {worstAgent?(
                  <div className="space-y-2">
                    <p className="text-2xl font-semibold text-white">{worstAgent.name}</p>
                    <span className="inline-block rounded-lg bg-red-500/20 px-2 py-1 text-xs font-bold text-red-400">Needs Improvement</span>
                    <p className="text-zinc-300">Avg FRT: <span className="font-medium text-red-400">{formatMinutes(worstAgent.avgFRT)}</span></p>
                    <p className="text-zinc-300">Resolution: <span className="font-medium text-red-400">{worstAgent.resolutionRate}%</span></p>
                    <p className="text-zinc-400 text-sm">{worstAgent.tickets} tickets</p>
                    {bestAgent&&worstAgent.name!==bestAgent.name&&(
                      <div className="rounded-2xl p-3 text-xs space-y-1" style={{backgroundColor:"#ef444410",border:"1px solid #ef444422"}}>
                        <p className="text-red-400 font-semibold mb-1">📊 VS {bestAgent.name}</p>
                        <div className="flex justify-between"><span className="text-zinc-400">FRT gap</span><span className="text-red-400">↓ {Math.round(worstAgent.avgFRT-bestAgent.avgFRT)} min slower</span></div>
                        <div className="flex justify-between"><span className="text-zinc-400">Resolution gap</span><span className="text-red-400">↓ {bestAgent.resolutionRate-worstAgent.resolutionRate}% lower</span></div>
                      </div>
                    )}
                  </div>
                ):<p className="text-zinc-400">No data — upload Excel or go Live</p>}
              </CardContent>
            </Card>

            {/* Manager Snapshot */}
            <Card className="rounded-3xl shadow-xl" style={{borderColor:`${LIME}22`,backgroundColor:"#0a0a0a"}}>
              <CardHeader><CardTitle className="text-white">Manager Snapshot</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {[
                  ["Open + Pending",   metrics.open+metrics.pending],
                  ["High Priority",    metrics.highPriority],
                  ["SLA Risk",         metrics.slaRisk],
                  ["Peak Hour",        peakHour],
                  ["Peak Day",         peakDay],
                  ["Repeat Customers", repeatContactsData.length],
                  ["Total Agents",     agents.length],
                ].map(([label,val])=>(
                  <div key={String(label)} className="flex justify-between text-sm">
                    <span className="text-zinc-400">{label}</span>
                    <span className="font-medium" style={{color:LIME}}>{val}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Email-only agents */}
          <div className="grid gap-4 xl:grid-cols-2">
            <AgentCard title="🏆 Best — Email Channel Only" agent={bestEmail}
              color={LIME} gradient={`linear-gradient(135deg,${LIME10},transparent)`}
              badge="📧 Email Top" badgeColor={LIME20}/>
            <AgentCard title="🔴 Slowest — Email Channel Only" agent={worstEmail}
              color="#ef4444" gradient="linear-gradient(135deg,#ef444410,transparent)"
              badge="📧 Email Needs Work" badgeColor="#ef444420"/>
          </div>

          {/* Social-only agents */}
          <div className="grid gap-4 xl:grid-cols-2">
            <AgentCard title="🏆 Best — WhatsApp & Instagram Only" agent={bestSocial}
              color={LIME} gradient={`linear-gradient(135deg,${LIME10},transparent)`}
              badge="💬 Social Top" badgeColor={LIME20}/>
            <AgentCard title="🔴 Slowest — WhatsApp & Instagram Only" agent={worstSocial}
              color="#f97316" gradient="linear-gradient(135deg,#f9741610,transparent)"
              badge="💬 Social Needs Work" badgeColor="#f9741620"/>
          </div>
        </div>

        {/* ── HEATMAP ── */}
        <Card className="rounded-3xl shadow-xl" style={{borderColor:`${LIME}22`,backgroundColor:"#0a0a0a"}}>
          <CardHeader>
            <CardTitle className="text-white">🔥 Complaint Heatmap — Day × Hour (11 AM – 8 PM)</CardTitle>
            <p className="text-xs text-zinc-500 mt-1">Darker = more tickets at that hour. Working hours only.</p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <div className="min-w-[560px]">
                {/* Hour labels */}
                <div className="flex mb-2 ml-12 gap-1">
                  {HEAT_HOURS.map(h=>(
                    <div key={h} className="flex-1 text-center text-[10px] text-zinc-500">
                      {h<12?`${h}AM`:h===12?"12PM":`${h-12}PM`}
                    </div>
                  ))}
                </div>
                {/* Grid */}
                {HEAT_DAYS.map((day,di)=>(
                  <div key={day} className="flex gap-1 mb-1 items-center">
                    <div className="w-10 text-right text-[11px] text-zinc-500 mr-2 shrink-0">{day}</div>
                    {HEAT_HOURS.map((_h,hi)=>{
                      const count=heatmapData[di]?.[hi]??0;
                      const intensity=count/heatMax;
                      const bg=count===0?"#1a1a1a":`rgba(191,255,0,${Math.max(0.08,intensity)})`;
                      return (
                        <div key={hi} title={`${day} ${HEAT_HOURS[hi]}:00 — ${count} ticket${count!==1?"s":""}`}
                          className="flex-1 rounded text-center text-[10px] font-medium flex items-center justify-center"
                          style={{height:36,backgroundColor:bg,color:intensity>0.5?"#000":"#a1a1aa",cursor:"default"}}>
                          {count>0?count:""}
                        </div>
                      );
                    })}
                  </div>
                ))}
                <div className="mt-4 flex items-center gap-3 text-xs text-zinc-500">
                  <span>Low</span>
                  {[0.1,0.3,0.5,0.7,0.9].map(i=>(
                    <div key={i} className="w-6 h-4 rounded" style={{backgroundColor:`rgba(191,255,0,${i})`}}/>
                  ))}
                  <span>High</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── CUSTOMER EMAIL RISK TRACKER ── */}
        <Card className="rounded-3xl shadow-xl" style={{borderColor:`${LIME}22`,backgroundColor:"#0a0a0a"}}>
          <CardHeader>
            <CardTitle className="text-white">📬 Customer Email Risk Tracker</CardTitle>
            <p className="text-xs text-zinc-500 mt-1">Email channel customers ranked by risk score (repeat contacts, CSAT, delays)</p>
          </CardHeader>
          <CardContent>
            {customerRiskData.length===0?(
              <p className="text-zinc-500 text-center py-6">No email data — upload Excel or go Live</p>
            ):(
              <div className="space-y-3">
                {customerRiskData.map((c,i)=>(
                  <div key={i} className="rounded-2xl p-4" style={{backgroundColor:"#111",border:`1px solid ${LIME}11`}}>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-white">{c.name||"Unknown Customer"}</p>
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                            style={{backgroundColor:c.risk.includes("High")?"#ef444420":c.risk.includes("Medium")?"#f59e0b20":"#16a34a20",
                                    color:c.risk.includes("High")?"#f87171":c.risk.includes("Medium")?"#fbbf24":"#4ade80"}}>
                            {c.risk}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-400">Label: <span className="text-zinc-300">{c.labels}</span></p>
                        <p className="text-xs text-zinc-400">Ticket IDs: <span className="text-zinc-500 font-mono text-[10px]">{c.ids}</span></p>
                      </div>
                      <div className="flex gap-4 text-center text-xs shrink-0">
                        <div><p className="text-zinc-400">Tickets</p><p className="text-lg font-bold" style={{color:LIME}}>{c.ticketCount}</p></div>
                        <div><p className="text-zinc-400">Avg FRT</p><p className="text-lg font-bold text-white">{formatMinutes(c.avgFRT)}</p></div>
                        <div><p className="text-zinc-400">Open</p><p className="text-lg font-bold text-yellow-400">{c.openCount}</p></div>
                        <div><p className="text-zinc-400">Sentiment</p><p className="text-sm mt-1">{c.sentiment}</p></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── TABS ── */}
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="rounded-2xl p-1" style={{borderColor:`${LIME}22`,backgroundColor:"#0a0a0a",border:"1px solid"}}>
            {["overview","ops","agents","insights","tickets"].map(tab=>(
              <TabsTrigger key={tab} value={tab} className="capitalize rounded-xl">
                {tab==="ops"?"Ops Tracking":tab.charAt(0).toUpperCase()+tab.slice(1)}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* OVERVIEW */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-3">
              <Card className="rounded-3xl xl:col-span-2 shadow-xl" style={{borderColor:`${LIME}22`,backgroundColor:"#0a0a0a"}}>
                <CardHeader><CardTitle className="text-white flex items-center gap-2">
                  Daily Ticket Trend
                  {trendData.length===0&&<span className="text-xs font-normal text-zinc-500">(no open-timestamp data from API yet)</span>}
                </CardTitle></CardHeader>
                <CardContent className="h-80">
                  {trendData.length>0?(
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trendData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a"/>
                        <XAxis dataKey="date" stroke="#a1a1aa"/>
                        <YAxis stroke="#a1a1aa"/>
                        <Tooltip contentStyle={tt}/>
                        <Area type="monotone" dataKey="tickets" stroke={LIME} fill={LIME} fillOpacity={0.12} strokeWidth={3}/>
                      </AreaChart>
                    </ResponsiveContainer>
                  ):(
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-zinc-600">
                      <p className="text-sm">No date-stamped data available</p>
                      <p className="text-xs">Requires ticket-level report from Bik with open timestamps</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="rounded-3xl shadow-xl" style={{borderColor:`${LIME}22`,backgroundColor:"#0a0a0a"}}>
                <CardHeader><CardTitle className="text-white">Ticket Stage Split</CardTitle></CardHeader>
                <CardContent className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={stageData} dataKey="value" nameKey="name" outerRadius={90} innerRadius={40}
                        label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`}>
                        {stageData.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                      </Pie>
                      <Tooltip contentStyle={tt}/>
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <Card className="rounded-3xl shadow-xl" style={{borderColor:`${LIME}22`,backgroundColor:"#0a0a0a"}}>
                <CardHeader><CardTitle className="text-white flex items-center gap-2">
                  🕐 Hourly Ticket Load
                  {!hourlyData.some(d=>d.tickets>0)&&<span className="text-xs font-normal text-zinc-500">(no timestamp data yet)</span>}
                </CardTitle></CardHeader>
                <CardContent className="h-80">
                  {hourlyData.some(d=>d.tickets>0)?(
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={hourlyData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a"/>
                        <XAxis dataKey="hour" stroke="#a1a1aa" tick={{fontSize:10}}/>
                        <YAxis stroke="#a1a1aa"/>
                        <Tooltip contentStyle={tt}/>
                        <Area type="monotone" dataKey="tickets" stroke={LIME} fill={LIME} fillOpacity={0.12} strokeWidth={2}/>
                      </AreaChart>
                    </ResponsiveContainer>
                  ):(
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-zinc-600">
                      <p className="text-sm">No hourly data available</p>
                      <p className="text-xs">Requires open timestamps from ticket-level report</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="rounded-3xl shadow-xl" style={{borderColor:`${LIME}22`,backgroundColor:"#0a0a0a"}}>
                <CardHeader><CardTitle className="text-white">Channel Breakdown</CardTitle></CardHeader>
                <CardContent className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={channelData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a"/>
                      <XAxis dataKey="name" stroke="#a1a1aa"/>
                      <YAxis stroke="#a1a1aa"/>
                      <Tooltip contentStyle={tt}/>
                      <Bar dataKey="value" fill={LIME} radius={[6,6,0,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <Card className="rounded-3xl shadow-xl" style={{borderColor:`${LIME}22`,backgroundColor:"#0a0a0a"}}>
              <CardHeader><CardTitle className="text-white">Top Ticket Labels</CardTitle></CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {issueData.length>0?issueData.map(issue=>(
                  <div key={issue.name} className="flex items-center justify-between rounded-2xl border px-4 py-3"
                    style={{borderColor:`${LIME}22`,backgroundColor:"#111"}}>
                    <span className="font-medium text-white">{issue.name}</span>
                    <span className="rounded-lg px-2 py-1 text-xs font-bold" style={{backgroundColor:LIME20,color:LIME}}>{issue.value}</span>
                  </div>
                )):<p className="text-zinc-500 col-span-3 text-center py-4">No label data — upload Excel</p>}
              </CardContent>
            </Card>
          </TabsContent>

          {/* OPS */}
          <TabsContent value="ops" className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-2">
              <Card className="rounded-3xl shadow-xl" style={{borderColor:`${LIME}22`,backgroundColor:"#0a0a0a"}}>
                <CardHeader><CardTitle className="text-white">Pending Ageing Buckets</CardTitle></CardHeader>
                <CardContent className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={ageingData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a"/>
                      <XAxis dataKey="name" stroke="#a1a1aa"/>
                      <YAxis stroke="#a1a1aa"/>
                      <Tooltip contentStyle={tt}/>
                      <Bar dataKey="value" radius={[6,6,0,0]}>
                        {ageingData.map((e,i)=><Cell key={i} fill={e.name==="24h+"?"#ef4444":e.name==="6-24 hr"?"#f97316":LIME}/>)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card className="rounded-3xl shadow-xl" style={{borderColor:`${LIME}22`,backgroundColor:"#0a0a0a"}}>
                <CardHeader><CardTitle className="text-white">FRT SLA Buckets</CardTitle></CardHeader>
                <CardContent className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={slaBucketData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a"/>
                      <XAxis dataKey="name" stroke="#a1a1aa"/>
                      <YAxis stroke="#a1a1aa"/>
                      <Tooltip contentStyle={tt}/>
                      <Bar dataKey="value" fill={LIME} radius={[6,6,0,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
            <Card className="rounded-3xl shadow-xl" style={{borderColor:`${LIME}22`,backgroundColor:"#0a0a0a"}}>
              <CardHeader><CardTitle className="text-white">Channel Performance</CardTitle></CardHeader>
              <CardContent>
                <table className="w-full text-sm text-white">
                  <thead><tr className="text-left" style={{borderBottom:`1px solid ${LIME}22`}}>
                    {["Channel","Avg FRT","Avg Closure"].map(h=><th key={h} className="pb-3 text-zinc-400">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {channelPerformanceData.map(row=>(
                      <tr key={row.channel} style={{borderBottom:`1px solid ${LIME}11`}}>
                        <td className="py-4 font-medium capitalize" style={{color:LIME}}>{row.channel}</td>
                        <td className="py-4">{formatMinutes(row.avgFRT)}</td>
                        <td className="py-4">{formatMinutes(row.avgClosure)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* AGENTS */}
          <TabsContent value="agents">
            <div className="grid gap-4 xl:grid-cols-3">
              <Card className="rounded-3xl xl:col-span-2 shadow-xl" style={{borderColor:`${LIME}22`,backgroundColor:"#0a0a0a"}}>
                <CardHeader><CardTitle className="text-white">Agent Performance Table</CardTitle></CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="min-w-full border-separate border-spacing-y-2 text-sm text-white">
                      <thead>
                        <tr className="text-left" style={{borderBottom:`1px solid ${LIME}22`}}>
                          {["Rank","Agent","Tickets","Open","Pending","Avg FRT","Avg Closure","High Priority","-CSAT","Resolution%","Score"].map(h=>(
                            <th key={h} className="pb-3 text-zinc-400">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[...agentData].sort((a,b)=>b.score-a.score).map((agent,i)=>{
                          const isTop=i===0; const isBot=i===agentData.length-1&&agentData.length>1;
                          return (
                            <tr key={agent.name} style={{backgroundColor:isTop?"#0d1200":isBot?"#1a0000":"#0b0b0b",borderRadius:12}}>
                              <td className="rounded-l-2xl px-4 py-3 font-bold" style={{color:isTop?LIME:isBot?"#ef4444":"#a1a1aa"}}>
                                {i===0?"🥇":i===1?"🥈":i===2?"🥉":`#${i+1}`}
                              </td>
                              <td className="px-4 py-3 font-medium" style={{color:isTop?LIME:isBot?"#ef4444":"#fff"}}>{agent.name}</td>
                              <td className="px-4 py-3">{agent.tickets}</td>
                              <td className="px-4 py-3 text-yellow-400">{agent.open}</td>
                              <td className="px-4 py-3 text-orange-400">{agent.pending}</td>
                              <td className="px-4 py-3">{formatMinutes(agent.avgFRT)}</td>
                              <td className="px-4 py-3">{formatMinutes(agent.avgClosure)}</td>
                              <td className="px-4 py-3">{agent.high}</td>
                              <td className="px-4 py-3 text-red-400">{agent.negative}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="h-1.5 w-12 rounded-full bg-zinc-800">
                                    <div className="h-1.5 rounded-full" style={{width:`${agent.resolutionRate}%`,backgroundColor:isBot?"#ef4444":LIME}}/>
                                  </div>
                                  <span className="text-xs">{agent.resolutionRate}%</span>
                                </div>
                              </td>
                              <td className="rounded-r-2xl px-4 py-3 font-bold" style={{color:isTop?LIME:isBot?"#ef4444":"#fff"}}>{Math.round(agent.score)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {agentData.length===0&&<p className="py-8 text-center text-zinc-500">No agent data — upload Excel or go Live</p>}
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-3xl shadow-xl" style={{borderColor:`${LIME}22`,backgroundColor:"#0a0a0a"}}>
                <CardHeader><CardTitle className="text-white">Agent Leaderboard</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {[...agentData].sort((a,b)=>b.score-a.score).slice(0,10).map((agent,index)=>(
                    <div key={agent.name} className="rounded-2xl border p-4" style={{borderColor:`${LIME}22`,backgroundColor:"#111"}}>
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-white">#{index+1} {agent.name}</p>
                        <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{backgroundColor:LIME20,color:LIME}}>{agent.tickets} tickets</span>
                      </div>
                      <div className="mt-2 text-sm text-zinc-400">FRT: {formatMinutes(agent.avgFRT)} • Score: {Math.round(agent.score)}</div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* INSIGHTS */}
          <TabsContent value="insights" className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-2">
              <Card className="rounded-3xl shadow-xl" style={{borderColor:`${LIME}22`,backgroundColor:"#0a0a0a"}}>
                <CardHeader><CardTitle className="text-white">📅 Day of Week Volume</CardTitle></CardHeader>
                <CardContent className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dayOfWeekData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a"/>
                      <XAxis dataKey="day" stroke="#a1a1aa"/>
                      <YAxis stroke="#a1a1aa"/>
                      <Tooltip contentStyle={tt}/>
                      <Bar dataKey="tickets" fill={LIME} radius={[6,6,0,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card className="rounded-3xl shadow-xl" style={{borderColor:`${LIME}22`,backgroundColor:"#0a0a0a"}}>
                <CardHeader><CardTitle className="text-white">😊 CSAT % by Month</CardTitle></CardHeader>
                <CardContent className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={csatTrendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a"/>
                      <XAxis dataKey="month" stroke="#a1a1aa"/>
                      <YAxis stroke="#a1a1aa" domain={[0,100]}/>
                      <Tooltip contentStyle={tt} formatter={v=>[`${v}%`,"CSAT"]}/>
                      <Line type="monotone" dataKey="csat" stroke={LIME} strokeWidth={3} dot={{fill:LIME,r:4}}/>
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <Card className="rounded-3xl shadow-xl" style={{borderColor:`${LIME}22`,backgroundColor:"#0a0a0a"}}>
              <CardHeader><CardTitle className="text-white">🚨 Escalation Risk by Agent</CardTitle></CardHeader>
              <CardContent className="h-64">
                {escalationData.length>0?(
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={escalationData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a"/>
                      <XAxis type="number" stroke="#a1a1aa"/>
                      <YAxis type="category" dataKey="agent" stroke="#a1a1aa" width={120}/>
                      <Tooltip contentStyle={tt}/>
                      <Bar dataKey="count" fill="#ef4444" radius={[0,6,6,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                ):<div className="flex h-full items-center justify-center text-zinc-500 text-sm">No escalation data</div>}
              </CardContent>
            </Card>

            <Card className="rounded-3xl shadow-xl" style={{borderColor:`${LIME}22`,backgroundColor:"#0a0a0a"}}>
              <CardHeader><CardTitle className="text-white">🔁 Repeat Contact Customers</CardTitle></CardHeader>
              <CardContent>
                <table className="w-full text-sm text-white">
                  <thead><tr className="text-left" style={{borderBottom:`1px solid ${LIME}22`}}>
                    {["Customer","Total Tickets","Channels"].map(h=><th key={h} className="pb-3 text-zinc-400">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {repeatContactsData.length===0
                      ?<tr><td colSpan={3} className="py-6 text-center text-zinc-500">No repeat contacts found</td></tr>
                      :repeatContactsData.map((c,i)=>(
                        <tr key={i} style={{borderBottom:`1px solid ${LIME}11`}}>
                          <td className="py-3 font-medium" style={{color:LIME}}>{c.name}</td>
                          <td className="py-3"><span className="px-2 py-1 rounded-lg text-xs font-bold" style={{backgroundColor:LIME20,color:LIME}}>{c.tickets}</span></td>
                          <td className="py-3 text-zinc-400">{c.channels}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TICKETS */}
          <TabsContent value="tickets">
            <Card className="rounded-3xl shadow-xl" style={{borderColor:`${LIME}22`,backgroundColor:"#0a0a0a"}}>
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
                      <tr className="text-left" style={{borderBottom:`1px solid ${LIME}22`}}>
                        {["Ticket ID","Customer","Channel","Issue","Agent","Stage","Priority","FRT","Closure","Ageing"].map(h=>(
                          <th key={h} className="pb-3 text-zinc-400">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.slice(0,500).map(row=>(
                        <tr key={`${row.id}-${row.openTimestamp}`} style={{borderBottom:`1px solid ${LIME}11`}}>
                          <td className="py-3 font-medium" style={{color:LIME}}>{row.id}</td>
                          <td className="py-3">{row.customerName}</td>
                          <td className="py-3 capitalize">{row.channel}</td>
                          <td className="py-3">{row.label}</td>
                          <td className="py-3">{row.agent}</td>
                          <td className="py-3">
                            <span className="px-2 py-1 rounded-lg text-xs font-medium"
                              style={{backgroundColor:row.stage==="Closed"?"#16a34a22":row.stage==="Open"?"#ef444422":"#f59e0b22",
                                      color:row.stage==="Closed"?"#4ade80":row.stage==="Open"?"#f87171":"#fbbf24"}}>
                              {row.stage}
                            </span>
                          </td>
                          <td className="py-3" style={{color:row.priority==="High"?"#f87171":row.priority==="Medium"?"#fbbf24":"#a1a1aa"}}>{row.priority}</td>
                          <td className="py-3">{formatMinutes(row.frt)}</td>
                          <td className="py-3">{formatMinutes(row.closure)}</td>
                          <td className="py-3">{formatMinutes(row.ageingMinutes)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filtered.length===0&&<p className="py-8 text-center text-zinc-500">No tickets — upload Excel or go Live</p>}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* ── FOOTER ── */}
        <div className="flex items-center justify-between rounded-2xl px-5 py-3 text-xs text-zinc-600"
          style={{border:"1px solid #BFFF0010",backgroundColor:"#050505"}}>
          <span>Crepdog Crew Support Dashboard</span>
          <span>Auto-refreshes every 5 min in Live Mode • {filtered.length} tickets loaded</span>
        </div>
      </div>

      {/* ── OPEN EMAIL TICKETS MODAL ── */}
      {emailModalOpen&&(
        <div className="fixed inset-0 z-50 flex items-start justify-end"
          style={{backgroundColor:"rgba(0,0,0,0.7)",backdropFilter:"blur(4px)"}}>
          <div className="h-full w-full max-w-2xl overflow-y-auto"
            style={{backgroundColor:"#0a0a0a",borderLeft:`2px solid ${LIME}44`}}>
            {/* Modal Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between p-6 pb-4"
              style={{backgroundColor:"#0a0a0a",borderBottom:`1px solid ${LIME}22`}}>
              <div>
                <h2 className="text-xl font-bold" style={{color:LIME}}>📧 Open Email Tickets</h2>
                <p className="text-xs text-zinc-400 mt-1">{openEmailTickets.length} open tickets awaiting response</p>
              </div>
              <button onClick={()=>setEmailModalOpen(false)}
                className="rounded-2xl p-2 transition hover:bg-zinc-800" style={{color:LIME}}>
                <X className="h-5 w-5"/>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-3">
              {openEmailTickets.length===0?(
                <div className="text-center py-16">
                  <Mail className="mx-auto h-12 w-12 mb-4 text-zinc-600"/>
                  <p className="text-zinc-400">No open email tickets right now 🎉</p>
                  <p className="text-xs text-zinc-600 mt-1">All caught up!</p>
                </div>
              ):openEmailTickets.map(ticket=>(
                <div key={ticket.id} className="rounded-2xl p-4 space-y-3"
                  style={{backgroundColor:"#111",border:`1px solid ${ticket.priority==="High"?"#ef444433":LIME+"22"}`}}>
                  {/* Ticket Header */}
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold px-2 py-1 rounded-lg" style={{backgroundColor:LIME20,color:LIME}}>{ticket.id}</span>
                        {ticket.priority==="High"&&<span className="text-xs px-2 py-1 rounded-lg bg-red-500/20 text-red-400 font-bold">🔥 High Priority</span>}
                      </div>
                      <p className="text-white font-semibold mt-2">{ticket.customerName||"Unknown Customer"}</p>
                      <p className="text-xs text-zinc-400">{ticket.contactInfo&&ticket.contactInfo!=="Unknown"?ticket.contactInfo:""}</p>
                    </div>
                    <div className="text-right text-xs text-zinc-400 shrink-0">
                      <p className="text-orange-400 font-bold">⏳ {formatMinutes(ticket.ageingMinutes)}</p>
                      <p className="mt-0.5">ageing</p>
                    </div>
                  </div>

                  {/* Ticket Details Grid */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl p-2" style={{backgroundColor:"#1a1a1a"}}>
                      <p className="text-zinc-500">Label / Issue</p>
                      <p className="text-white font-medium mt-0.5">{ticket.label}</p>
                    </div>
                    <div className="rounded-xl p-2" style={{backgroundColor:"#1a1a1a"}}>
                      <p className="text-zinc-500">Assigned Agent</p>
                      <p className="font-medium mt-0.5" style={{color:LIME}}>{ticket.agent||"Unassigned"}</p>
                    </div>
                    <div className="rounded-xl p-2" style={{backgroundColor:"#1a1a1a"}}>
                      <p className="text-zinc-500">First Response Time</p>
                      <p className={`font-medium mt-0.5 ${ticket.frt>30?"text-red-400":"text-green-400"}`}>{formatMinutes(ticket.frt)||"—"}</p>
                    </div>
                    <div className="rounded-xl p-2" style={{backgroundColor:"#1a1a1a"}}>
                      <p className="text-zinc-500">Opened On</p>
                      <p className="text-zinc-300 font-medium mt-0.5 text-[11px]">
                        {ticket.openTimestamp!=="Unknown"?new Date(ticket.openTimestamp).toLocaleString("en-IN",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}):"—"}
                      </p>
                    </div>
                    <div className="rounded-xl p-2 col-span-2" style={{backgroundColor:"#1a1a1a"}}>
                      <p className="text-zinc-500">CSAT Sentiment</p>
                      <p className={`font-medium mt-0.5 ${ticket.csatSentiment.toLowerCase().includes("negative")?"text-red-400":ticket.csatSentiment.toLowerCase().includes("positive")?"text-green-400":"text-zinc-300"}`}>
                        {ticket.csatSentiment||"No response yet"}
                      </p>
                    </div>
                  </div>

                  {/* Status bar */}
                  <div className="flex items-center gap-2 pt-1">
                    <span className="px-2 py-1 rounded-lg text-xs font-medium bg-red-500/20 text-red-400">Open</span>
                    <span className="px-2 py-1 rounded-lg text-xs capitalize" style={{backgroundColor:LIME10,color:LIME}}>email</span>
                    {ticket.frt>30&&<span className="px-2 py-1 rounded-lg text-xs bg-orange-500/20 text-orange-400">⚠ Slow FRT</span>}
                    {ticket.ageingMinutes>1440&&<span className="px-2 py-1 rounded-lg text-xs bg-red-500/20 text-red-400">🔴 24h+ old</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}