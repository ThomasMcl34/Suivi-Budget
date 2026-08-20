import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  ResponsiveContainer, ComposedChart, LineChart, Line, Bar, BarChart,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import {
  Home, TrendingUp, Umbrella, Receipt, BarChart3, Plus, Trash2, X,
  ChevronLeft, ChevronRight, Wallet, AlertTriangle, Landmark, Loader2, Repeat,
} from "lucide-react";
import * as api from "./lib/api.js";

/* ============================== CONSTANTES ============================== */

const PLATFORMS = [
  { id: "traderepublic", label: "Trade Republic" },
  { id: "binance", label: "Binance" },
];

const FREQ_UNITS = [
  { id: "jour", label: "jour(s)" },
  { id: "semaine", label: "semaine(s)" },
  { id: "mois", label: "mois" },
];

const CATEGORIES_INVEST = ["ETF", "Action", "Crypto"];
const EXPENSE_CATEGORIES = ["Logement", "Alimentation", "Transport", "Loisirs", "Abonnements", "Santé", "Shopping", "Autre"];
const POSITION_COLORS = ["#24504D", "#C97A3E", "#2E9E4F", "#8858B0", "#2F6FB0", "#B0562F", "#4F9A8F", "#B04F84", "#7A8C2E", "#C94545"];

const PERIODS = [
  { id: "1j", label: "1 jour" },
  { id: "7j", label: "7 jours" },
  { id: "1m", label: "1 mois" },
  { id: "1a", label: "1 an" },
  { id: "tout", label: "Depuis le début" },
];

const TABS = [
  { id: "accueil", label: "Accueil", icon: Home },
  { id: "placements", label: "Placements", icon: TrendingUp },
  { id: "av", label: "Assurance vie", icon: Umbrella },
  { id: "depenses", label: "Dépenses", icon: Receipt },
  { id: "graphes", label: "Graphes", icon: BarChart3 },
];

/* ============================== HELPERS ============================== */

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const todayStr = () => new Date().toISOString().slice(0, 10);

const eur = (n) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(n || 0);

const signedEur = (n) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${eur(Math.abs(n || 0))}`;
const signedPct = (n) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n || 0).toFixed(1)}%`;

function periodRange(period, offset = 0) {
  const end = new Date(); end.setHours(23, 59, 59, 999);
  if (period === "1j") end.setDate(end.getDate() - offset);
  else if (period === "7j") end.setDate(end.getDate() - offset * 7);
  else if (period === "1m") end.setMonth(end.getMonth() - offset);
  else if (period === "1a") end.setFullYear(end.getFullYear() - offset);
  const start = new Date(end);
  if (period === "1j") start.setDate(start.getDate() - 1);
  else if (period === "7j") start.setDate(start.getDate() - 7);
  else if (period === "1m") start.setMonth(start.getMonth() - 1);
  else if (period === "1a") start.setFullYear(start.getFullYear() - 1);
  else { start.setFullYear(2000, 0, 1); start.setHours(0, 0, 0, 0); }
  return { start, end };
}

function inPeriodRange(dateStr, period, offset = 0) {
  if (period === "tout") return true;
  const { start, end } = periodRange(period, offset);
  const d = new Date(dateStr);
  return d >= start && d <= end;
}

function bucketsForPeriod(period, offset = 0) {
  const { start, end } = periodRange(period, offset);
  const useMonth = period === "1a" || period === "tout";
  const buckets = [];
  if (!useMonth) {
    const cursor = new Date(start); cursor.setHours(0, 0, 0, 0);
    while (cursor <= end) {
      const bStart = new Date(cursor);
      const bEnd = new Date(cursor); bEnd.setHours(23, 59, 59, 999);
      buckets.push({ label: bStart.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }), start: bStart, end: bEnd });
      cursor.setDate(cursor.getDate() + 1);
    }
  } else {
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cursor <= end) {
      const bStart = new Date(cursor);
      const bEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999);
      buckets.push({ label: bStart.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" }), start: bStart, end: bEnd });
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }
  return buckets.length ? buckets : [{ label: "—", start, end }];
}

function formatAxisEur(v) {
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(Math.round(v) % 1000 === 0 ? 0 : 1)}k€`;
  return `${Math.round(v)}€`;
}
function tickInterval(len) {
  if (!len || len <= 10) return 0;
  return Math.ceil(len / 8) - 1;
}

function addInterval(date, value, unit) {
  const d = new Date(date);
  const n = Number(value) || 1;
  if (unit === "jour") d.setDate(d.getDate() + n);
  else if (unit === "semaine") d.setDate(d.getDate() + n * 7);
  else d.setMonth(d.getMonth() + n);
  return d;
}

function computeDueDates(rule, todayStrValue) {
  const dates = [];
  const today = new Date(todayStrValue); today.setHours(23, 59, 59, 999);
  const cap = rule.endDate ? new Date(new Date(rule.endDate).setHours(23, 59, 59, 999)) : null;
  const limit = cap && cap < today ? cap : today;
  let cursor = rule.lastGeneratedDate ? addInterval(rule.lastGeneratedDate, rule.frequencyValue, rule.frequencyUnit) : new Date(rule.startDate);
  let safety = 0;
  while (cursor <= limit && safety < 2000) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor = addInterval(cursor, rule.frequencyValue, rule.frequencyUnit);
    safety++;
  }
  return dates;
}

function runRecurringCatchUp(rules, deposits, avDeposits, transactions, expenses) {
  const today = todayStr();
  let newDeposits = [...deposits];
  let newAV = [...avDeposits];
  let newTx = [...transactions];
  let newExpenses = [...expenses];
  const updatedRules = rules.map((rule) => {
    if (!rule.active) return rule;
    const due = computeDueDates(rule, today);
    let lastGeneratedDate = rule.lastGeneratedDate;
    if (due.length > 0) {
      due.forEach((date) => {
        if (rule.kind === "deposit") newDeposits.push({ id: uid(), platform: rule.platform, amount: rule.amount, date, recurringId: rule.id });
        else if (rule.kind === "av") newAV.push({ id: uid(), amount: rule.amount, date, note: rule.note || "Versement périodique", recurringId: rule.id });
        else if (rule.kind === "transaction") newTx.push({ id: uid(), platform: rule.platform, category: rule.category, name: rule.name, quantity: rule.quantity, price: rule.price, date, recurringId: rule.id });
        else if (rule.kind === "expense") newExpenses.push({ id: uid(), type: "fixe", category: rule.category, amount: rule.amount, date, recurringId: rule.id });
      });
      lastGeneratedDate = due[due.length - 1];
    }
    const finished = rule.endDate && lastGeneratedDate && new Date(lastGeneratedDate) >= new Date(rule.endDate);
    return { ...rule, lastGeneratedDate, active: finished ? false : rule.active };
  });
  return { updatedRules, newDeposits, newAV, newTx, newExpenses };
}

function recurringLabel(rule) {
  const freqUnit = FREQ_UNITS.find((f) => f.id === rule.frequencyUnit)?.label || rule.frequencyUnit;
  const freq = `tous les ${rule.frequencyValue} ${freqUnit}`;
  const until = rule.endDate ? ` · jusqu'au ${new Date(rule.endDate).toLocaleDateString("fr-FR")}` : "";
  if (rule.kind === "deposit") return `${PLATFORMS.find((p) => p.id === rule.platform)?.label} · ${eur(rule.amount)} ${freq}${until}`;
  if (rule.kind === "av") return `${eur(rule.amount)} ${freq}${until}`;
  if (rule.kind === "expense") return `${rule.category} · ${eur(rule.amount)} ${freq}${until}`;
  return `${rule.name} · ${rule.quantity} × ${eur(rule.price)} ${freq} sur ${PLATFORMS.find((p) => p.id === rule.platform)?.label}${until}`;
}

function RecurringList({ rules, onDelete }) {
  if (!rules.length) return null;
  return (
    <div className="bt-recurring-list">
      {rules.map((r) => (
        <div className="bt-recurring-chip" key={r.id}>
          <Repeat size={13} />
          <span>{recurringLabel(r)}</span>
          <button className="bt-icon-btn bt-icon-danger" onClick={() => onDelete(r.id)}><X size={13} /></button>
        </div>
      ))}
    </div>
  );
}

function computePositions(transactions, testPrices) {
  const map = new Map();
  transactions.forEach((t) => {
    const key = `${t.platform}|${t.category}|${t.name}`;
    if (!map.has(key)) map.set(key, { key, platform: t.platform, category: t.category, name: t.name, qty: 0, invested: 0, txs: [] });
    const p = map.get(key);
    p.qty += Number(t.quantity);
    p.invested += Number(t.quantity) * Number(t.price);
    p.txs.push(t);
  });
  return Array.from(map.values()).map((p) => {
    const avgPrice = p.qty > 0 ? p.invested / p.qty : 0;
    const testPrice = testPrices[p.key];
    const hasTest = testPrice !== undefined && testPrice !== null && testPrice !== "";
    const testValue = hasTest ? Number(testPrice) * p.qty : null;
    const pv = hasTest ? testValue - p.invested : null;
    const pvPct = hasTest && p.invested > 0 ? (pv / p.invested) * 100 : null;
    return { ...p, avgPrice, testPrice: hasTest ? testPrice : "", hasTest, testValue, pv, pvPct };
  }).sort((a, b) => b.invested - a.invested);
}

/* ============================== UI ATOMS ============================== */

function ConfirmDialog({ open, title, message, onConfirm, onCancel }) {
  const ref = useRef(null);
  useEffect(() => { if (open && ref.current) ref.current.focus(); }, [open]);
  if (!open) return null;
  const handleKeyDown = (e) => {
    if (e.key === "Escape") onCancel();
    else if (e.key === "Enter") onConfirm();
  };
  return (
    <div className="bt-overlay" onClick={onCancel}>
      <div className="bt-dialog" ref={ref} tabIndex={-1} onKeyDown={handleKeyDown} onClick={(e) => e.stopPropagation()}>
        <div className="bt-dialog-icon"><AlertTriangle size={20} /></div>
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="bt-dialog-actions">
          <button className="bt-btn-ghost" onClick={onCancel}>Annuler</button>
          <button className="bt-btn-danger" onClick={onConfirm}>Supprimer</button>
        </div>
      </div>
    </div>
  );
}

function Modal({ open, title, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => { if (open && ref.current) ref.current.focus(); }, [open]);
  if (!open) return null;
  const handleKeyDown = (e) => {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") {
      const btn = ref.current?.querySelector(".bt-btn-primary:not(:disabled)");
      if (btn) { e.preventDefault(); btn.click(); }
    }
  };
  return (
    <div className="bt-overlay" onClick={onClose}>
      <div className="bt-modal" ref={ref} tabIndex={-1} onKeyDown={handleKeyDown} onClick={(e) => e.stopPropagation()}>
        <div className="bt-modal-head">
          <h3>{title}</h3>
          <button className="bt-icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="bt-modal-body">{children}</div>
      </div>
    </div>
  );
}

function DeltaPill({ value, mode = "eur", size = "md" }) {
  if (value === null || value === undefined) return <span className="bt-pill bt-pill-neutral bt-pill-md">— non simulé</span>;
  const positive = value >= 0;
  const label = mode === "pct" ? signedPct(value) : signedEur(value);
  return (
    <span className={`bt-pill ${positive ? "bt-pill-pos" : "bt-pill-neg"} bt-pill-${size}`}>
      {positive ? "▲" : "▼"} {label}
    </span>
  );
}

function PeriodBar({ value, onChange }) {
  return (
    <div className="bt-segment">
      {PERIODS.map((p) => (
        <button key={p.id} className={`bt-segment-btn ${value === p.id ? "active" : ""}`} onClick={() => onChange(p.id)}>{p.label}</button>
      ))}
    </div>
  );
}

function PeriodNav({ period, onPeriodChange, offset, onOffsetChange }) {
  const { start, end } = periodRange(period, offset);
  const fmt = (d) => d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" });
  return (
    <div className="bt-period-nav">
      <PeriodBar value={period} onChange={(p) => { onPeriodChange(p); onOffsetChange(0); }} />
      {period !== "tout" && (
        <div className="bt-period-window">
          <button className="bt-icon-btn" onClick={() => onOffsetChange(offset + 1)} aria-label="Période précédente"><ChevronLeft size={16} /></button>
          <span>{fmt(start)} → {fmt(end)}</span>
          <button className="bt-icon-btn" onClick={() => onOffsetChange(Math.max(0, offset - 1))} disabled={offset === 0} aria-label="Période suivante"><ChevronRight size={16} /></button>
        </div>
      )}
    </div>
  );
}

function ModeToggle({ value, onChange }) {
  return (
    <div className="bt-toggle2">
      <button className={value === "eur" ? "active" : ""} onClick={() => onChange("eur")}>€</button>
      <button className={value === "pct" ? "active" : ""} onClick={() => onChange("pct")}>%</button>
    </div>
  );
}

function StatCard({ label, value, sub, tone }) {
  return (
    <div className="bt-stat">
      <div className="bt-stat-label">{label}</div>
      <div className={`bt-stat-value ${tone === "pos" ? "bt-text-pos" : tone === "neg" ? "bt-text-neg" : ""}`}>{value}</div>
      {sub && <div className="bt-stat-sub">{sub}</div>}
    </div>
  );
}

function EmptyState({ text }) {
  return <div className="bt-empty">{text}</div>;
}

function FieldRow({ label, children }) {
  return (
    <label className="bt-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

/* ============================== ACCUEIL ============================== */

function buildOverviewData(period, offset, { transactions, avDeposits, expenses }, mode) {
  const buckets = bucketsForPeriod(period, offset);
  const investEvents = [
    ...transactions.map((t) => ({ date: t.date, amount: Number(t.quantity) * Number(t.price) })),
    ...avDeposits.map((d) => ({ date: d.date, amount: Number(d.amount) })),
  ];
  const totalDepensesRange = expenses
    .filter((e) => new Date(e.date) >= buckets[0].start)
    .reduce((s, e) => s + Number(e.amount), 0);
  let baseline = null;
  return buckets.map((b) => {
    const investUpTo = investEvents.filter((ev) => new Date(ev.date) <= b.end).reduce((s, ev) => s + ev.amount, 0);
    const depBucket = expenses.filter((e) => { const d = new Date(e.date); return d >= b.start && d <= b.end; }).reduce((s, e) => s + Number(e.amount), 0);
    if (baseline === null) baseline = investUpTo;
    let placements = investUpTo;
    let depenses = depBucket;
    if (mode === "pct") {
      placements = baseline > 0 ? ((investUpTo - baseline) / baseline) * 100 : 0;
      depenses = totalDepensesRange > 0 ? (depBucket / totalDepensesRange) * 100 : 0;
    }
    return { label: b.label, placements, depenses };
  });
}

function AccueilTab({ data }) {
  const { deposits, transactions, testPrices, avDeposits, expenses, settings } = data;
  const [period, setPeriod] = useState("1m");
  const [offset, setOffset] = useState(0);
  const [mode, setMode] = useState("eur");
  const [filter, setFilter] = useState("tout");

  const totalVerseTR = useMemo(() => deposits.filter((d) => d.platform === "traderepublic").reduce((s, d) => s + Number(d.amount), 0), [deposits]);
  const totalVerseBinance = useMemo(() => deposits.filter((d) => d.platform === "binance").reduce((s, d) => s + Number(d.amount), 0), [deposits]);
  const totalVerseAV = useMemo(() => avDeposits.reduce((s, d) => s + Number(d.amount), 0), [avDeposits]);
  const totalInvesti = useMemo(() => transactions.reduce((s, t) => s + Number(t.quantity) * Number(t.price), 0), [transactions]);
  const patrimoineTotal = totalVerseTR + totalVerseBinance + totalVerseAV;

  const positions = useMemo(() => computePositions(transactions, testPrices), [transactions, testPrices]);
  const testedPositions = positions.filter((p) => p.hasTest);
  const pvGlobale = testedPositions.reduce((s, p) => s + p.pv, 0);
  const investiTeste = testedPositions.reduce((s, p) => s + p.invested, 0);
  const pvGlobalePct = investiTeste > 0 ? (pvGlobale / investiTeste) * 100 : null;
  const nonSimule = positions.length - testedPositions.length;

  const now = new Date();
  const depensesMois = expenses.filter((e) => { const d = new Date(e.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).reduce((s, e) => s + Number(e.amount), 0);
  const solde = (Number(settings.monthlyIncome) || 0) - depensesMois;

  const chartData = useMemo(() => buildOverviewData(period, offset, { transactions, avDeposits, expenses }, mode), [period, offset, mode, transactions, avDeposits, expenses]);

  const pieData = [
    { name: "Trade Republic", value: totalVerseTR, color: "#24504D" },
    { name: "Binance", value: totalVerseBinance, color: "#C97A3E" },
    { name: "Assurance vie", value: totalVerseAV, color: "#2F6FB0" },
  ].filter((d) => d.value > 0);

  const recent = useMemo(() => {
    const items = [
      ...transactions.map((t) => ({ id: t.id, date: t.date, label: `Achat ${t.name}`, amount: -(Number(t.quantity) * Number(t.price)), type: "placement" })),
      ...avDeposits.map((d) => ({ id: d.id, date: d.date, label: "Versement assurance vie", amount: -Number(d.amount), type: "av" })),
      ...expenses.map((e) => ({ id: e.id, date: e.date, label: `${e.category} (${e.type})`, amount: -Number(e.amount), type: "depense" })),
    ];
    return items.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 6);
  }, [transactions, avDeposits, expenses]);

  return (
    <div className="bt-tab">
      <div className="bt-grid-stats">
        <StatCard label="Patrimoine investi total" value={eur(patrimoineTotal)} sub="Versements réels sur toutes plateformes" />
        <StatCard label="Plus-value globale (positions simulées)" value={pvGlobale ? signedEur(pvGlobale) : "—"} sub={nonSimule > 0 ? `${nonSimule} position(s) sans simulation` : (pvGlobalePct !== null ? signedPct(pvGlobalePct) : "")} tone={testedPositions.length ? (pvGlobale >= 0 ? "pos" : "neg") : undefined} />
        <StatCard label="Dépenses ce mois-ci" value={eur(depensesMois)} sub={`${expenses.filter(e => { const d = new Date(e.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).length} opération(s)`} />
        <StatCard label="Solde du mois" value={signedEur(solde)} sub="Revenu mensuel − dépenses" tone={solde >= 0 ? "pos" : "neg"} />
      </div>

      <div className="bt-card">
        <div className="bt-card-head">
          <h3>Vue d'ensemble</h3>
          <div className="bt-controls-row">
            <div className="bt-segment bt-segment-sm">
              {["tout", "placements", "depenses"].map((f) => (
                <button key={f} className={`bt-segment-btn ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>
                  {f === "tout" ? "Tout" : f === "placements" ? "Placements" : "Dépenses"}
                </button>
              ))}
            </div>
            <ModeToggle value={mode} onChange={setMode} />
          </div>
        </div>
        <PeriodNav period={period} onPeriodChange={setPeriod} offset={offset} onOffsetChange={setOffset} />
        <div className="bt-chart-wrap">
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--bt-border)" vertical={false} />
              <XAxis dataKey="label" interval={tickInterval(chartData.length)} tick={{ fontSize: 11, fill: "var(--bt-ink-soft)" }} axisLine={{ stroke: "var(--bt-border)" }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "var(--bt-ink-soft)" }} axisLine={false} tickLine={false} width={54} tickFormatter={(v) => mode === "pct" ? `${v.toFixed(0)}%` : formatAxisEur(v)} />
              <Tooltip formatter={(v) => mode === "pct" ? `${v.toFixed(1)}%` : eur(v)} contentStyle={{ background: "var(--bt-surface)", border: "1px solid var(--bt-border)", borderRadius: 10, fontSize: 12 }} />
              {(filter === "tout" || filter === "depenses") && <Bar dataKey="depenses" name="Dépenses" fill="#C97A3E" radius={[4, 4, 0, 0]} barSize={mode === "pct" ? 14 : 14} />}
              {(filter === "tout" || filter === "placements") && <Line dataKey="placements" name="Placements (cumulé)" stroke="#24504D" strokeWidth={2.5} dot={false} type="monotone" />}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bt-two-col">
        <div className="bt-card">
          <div className="bt-card-head"><h3>Répartition du versé</h3></div>
          {pieData.length === 0 ? <EmptyState text="Aucun versement enregistré pour l'instant." /> : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip formatter={(v) => eur(v)} contentStyle={{ background: "var(--bt-surface)", border: "1px solid var(--bt-border)", borderRadius: 10, fontSize: 12 }} />
                <Legend verticalAlign="bottom" height={30} wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="bt-card">
          <div className="bt-card-head"><h3>Dernières opérations</h3></div>
          {recent.length === 0 ? <EmptyState text="Aucune opération pour l'instant." /> : (
            <ul className="bt-recent-list">
              {recent.map((r) => (
                <li key={r.id + r.type}>
                  <span className="bt-recent-label">{r.label}</span>
                  <span className="bt-recent-date">{new Date(r.date).toLocaleDateString("fr-FR")}</span>
                  <span className="bt-recent-amount">{eur(Math.abs(r.amount))}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================== PLACEMENTS ============================== */

function buildPositionSeries(positions, selectedKeys, period, offset) {
  const selected = positions.filter((p) => selectedKeys.has(p.key));
  const buckets = bucketsForPeriod(period, offset);
  return buckets.map((b) => {
    const row = { label: b.label };
    let total = 0;
    selected.forEach((p) => {
      const val = p.txs.filter((t) => new Date(t.date) <= b.end).reduce((s, t) => s + Number(t.quantity) * Number(t.price), 0);
      row[p.key] = val;
      total += val;
    });
    row.total = total;
    return row;
  });
}

function RecurrenceToggle({ mode, setMode, freqValue, setFreqValue, freqUnit, setFreqUnit, startDate, previewCount }) {
  return (
    <>
      <FieldRow label="Type de versement">
        <div className="bt-toggle2 bt-toggle2-wide">
          <button className={mode === "ponctuel" ? "active" : ""} onClick={() => setMode("ponctuel")}>Ponctuel</button>
          <button className={mode === "periodique" ? "active" : ""} onClick={() => setMode("periodique")}>Périodique</button>
        </div>
      </FieldRow>
      {mode === "periodique" && (
        <FieldRow label="Fréquence">
          <div className="bt-freq-row">
            <span>Tous les</span>
            <input type="number" min="1" step="1" value={freqValue} onChange={(e) => setFreqValue(e.target.value)} />
            <select value={freqUnit} onChange={(e) => setFreqUnit(e.target.value)}>
              {FREQ_UNITS.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
            </select>
          </div>
        </FieldRow>
      )}
      {mode === "periodique" && previewCount > 0 && (
        <div className="bt-form-preview bt-form-preview-recurring">
          <Repeat size={13} /> {previewCount} échéance{previewCount > 1 ? "s" : ""} depuis le {new Date(startDate).toLocaleDateString("fr-FR")} {previewCount > 1 ? "seront ajoutées" : "sera ajoutée"} tout de suite. Les suivantes s'ajouteront automatiquement à chaque ouverture de l'appli.
        </div>
      )}
    </>
  );
}

function TransactionForm({ onSubmitOnce, onSubmitRecurring, onCancel }) {
  const [platform, setPlatform] = useState("traderepublic");
  const [category, setCategory] = useState("ETF");
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [date, setDate] = useState(todayStr());
  const [mode, setMode] = useState("ponctuel");
  const [freqValue, setFreqValue] = useState("1");
  const [freqUnit, setFreqUnit] = useState("mois");
  const valid = name.trim() && Number(quantity) > 0 && Number(price) > 0 && (mode === "ponctuel" || Number(freqValue) > 0);
  const previewCount = useMemo(() => {
    if (mode !== "periodique" || !Number(freqValue)) return 0;
    return computeDueDates({ lastGeneratedDate: null, startDate: date, frequencyValue: Number(freqValue), frequencyUnit: freqUnit }, todayStr()).length;
  }, [mode, freqValue, freqUnit, date]);
  const handleSubmit = () => {
    if (mode === "ponctuel") onSubmitOnce({ id: uid(), platform, category, name: name.trim(), quantity: Number(quantity), price: Number(price), date });
    else onSubmitRecurring({ id: uid(), kind: "transaction", active: true, platform, category, name: name.trim(), quantity: Number(quantity), price: Number(price), startDate: date, frequencyValue: Number(freqValue), frequencyUnit: freqUnit, lastGeneratedDate: null });
  };
  return (
    <div className="bt-form">
      <FieldRow label="Plateforme">
        <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
          {PLATFORMS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </FieldRow>
      <FieldRow label="Catégorie">
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES_INVEST.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </FieldRow>
      <FieldRow label="Nom (ex : MSCI World, Apple, Bitcoin...)">
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom de l'actif" />
      </FieldRow>
      <div className="bt-form-row">
        <FieldRow label="Quantité">
          <input type="number" min="0" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" />
        </FieldRow>
        <FieldRow label="Prix unitaire (€)">
          <input type="number" min="0" step="any" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
        </FieldRow>
      </div>
      <RecurrenceToggle mode={mode} setMode={setMode} freqValue={freqValue} setFreqValue={setFreqValue} freqUnit={freqUnit} setFreqUnit={setFreqUnit} startDate={date} previewCount={previewCount} />
      <FieldRow label={mode === "ponctuel" ? "Date" : "Premier achat le"}>
        <input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} />
      </FieldRow>
      {quantity && price && <div className="bt-form-preview">Montant investi {mode === "periodique" ? "(par occurrence)" : ""} : <strong>{eur(Number(quantity) * Number(price))}</strong></div>}
      <div className="bt-modal-actions">
        <button className="bt-btn-ghost" onClick={onCancel}>Annuler</button>
        <button className="bt-btn-primary" disabled={!valid} onClick={handleSubmit}>{mode === "ponctuel" ? "Ajouter l'achat" : "Créer l'achat périodique"}</button>
      </div>
    </div>
  );
}

function DepositForm({ onSubmitOnce, onSubmitRecurring, onCancel }) {
  const [platform, setPlatform] = useState("traderepublic");
  const [mode, setMode] = useState("ponctuel");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayStr());
  const [freqValue, setFreqValue] = useState("1");
  const [freqUnit, setFreqUnit] = useState("mois");
  const valid = Number(amount) > 0 && (mode === "ponctuel" || Number(freqValue) > 0);
  const previewCount = useMemo(() => {
    if (mode !== "periodique" || !Number(freqValue)) return 0;
    return computeDueDates({ lastGeneratedDate: null, startDate: date, frequencyValue: Number(freqValue), frequencyUnit: freqUnit }, todayStr()).length;
  }, [mode, freqValue, freqUnit, date]);
  const handleSubmit = () => {
    if (mode === "ponctuel") onSubmitOnce({ id: uid(), platform, amount: Number(amount), date });
    else onSubmitRecurring({ id: uid(), kind: "deposit", active: true, platform, amount: Number(amount), startDate: date, frequencyValue: Number(freqValue), frequencyUnit: freqUnit, lastGeneratedDate: null });
  };
  return (
    <div className="bt-form">
      <FieldRow label="Plateforme">
        <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
          {PLATFORMS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </FieldRow>
      <FieldRow label="Montant versé (€)">
        <input type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
      </FieldRow>
      <RecurrenceToggle mode={mode} setMode={setMode} freqValue={freqValue} setFreqValue={setFreqValue} freqUnit={freqUnit} setFreqUnit={setFreqUnit} startDate={date} previewCount={previewCount} />
      <FieldRow label={mode === "ponctuel" ? "Date" : "Premier versement le"}>
        <input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} />
      </FieldRow>
      <div className="bt-modal-actions">
        <button className="bt-btn-ghost" onClick={onCancel}>Annuler</button>
        <button className="bt-btn-primary" disabled={!valid} onClick={handleSubmit}>{mode === "ponctuel" ? "Ajouter le versement" : "Créer le versement périodique"}</button>
      </div>
    </div>
  );
}

function PlacementsTab({ data, actions }) {
  const { deposits, transactions, testPrices, rules } = data;
  const [chartPeriod, setChartPeriod] = useState("tout");
  const [chartOffset, setChartOffset] = useState(0);
  const [showTxForm, setShowTxForm] = useState(false);
  const [showDepositForm, setShowDepositForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [selectedKeys, setSelectedKeys] = useState(null);

  const depositRules = rules.filter((r) => r.kind === "deposit");
  const transactionRules = rules.filter((r) => r.kind === "transaction");

  const positions = useMemo(() => computePositions(transactions, testPrices), [transactions, testPrices]);

  useEffect(() => {
    if (selectedKeys === null && positions.length) setSelectedKeys(new Set(positions.map((p) => p.key)));
  }, [positions, selectedKeys]);

  const totalVerseTR = deposits.filter((d) => d.platform === "traderepublic").reduce((s, d) => s + Number(d.amount), 0);
  const totalVerseBinance = deposits.filter((d) => d.platform === "binance").reduce((s, d) => s + Number(d.amount), 0);
  const totalInvesti = transactions.reduce((s, t) => s + Number(t.quantity) * Number(t.price), 0);

  const tested = positions.filter((p) => p.hasTest);
  const pvVsInvesti = tested.reduce((s, p) => s + p.pv, 0);
  const investiTeste = tested.reduce((s, p) => s + p.invested, 0);
  const valeurEstimee = tested.reduce((s, p) => s + p.testValue, 0) + positions.filter((p) => !p.hasTest).reduce((s, p) => s + p.invested, 0);
  const pvVsVerse = valeurEstimee - (totalVerseTR + totalVerseBinance);

  const sortedTx = useMemo(() => [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date)), [transactions]);
  const seriesData = useMemo(() => selectedKeys ? buildPositionSeries(positions, selectedKeys, chartPeriod, chartOffset) : [], [positions, selectedKeys, chartPeriod, chartOffset]);

  const toggleKey = (key) => setSelectedKeys((prev) => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  return (
    <div className="bt-tab">
      <div className="bt-grid-stats">
        <StatCard label="Versé Trade Republic" value={eur(totalVerseTR)} />
        <StatCard label="Versé Binance" value={eur(totalVerseBinance)} />
        <StatCard label="Total investi" value={eur(totalInvesti)} sub={`${positions.length} position(s)`} />
        <StatCard label="PV vs investi / vs versé" value={tested.length ? signedEur(pvVsInvesti) : "—"} sub={tested.length ? `vs versé : ${signedEur(pvVsVerse)}` : `${positions.length} non simulée(s)`} tone={tested.length ? (pvVsInvesti >= 0 ? "pos" : "neg") : undefined} />
      </div>

      <div className="bt-card">
        <div className="bt-card-head">
          <h3>Mes positions</h3>
          <button className="bt-btn-primary bt-btn-sm" onClick={() => setShowTxForm(true)}><Plus size={16} /> Ajouter un achat</button>
        </div>
        {positions.length === 0 ? <EmptyState text="Aucune position pour l'instant. Ajoute ton premier achat." /> : (
          <div className="bt-positions">
            {positions.map((p, i) => (
              <div className="bt-position-row" key={p.key}>
                <div className="bt-position-check">
                  <input type="checkbox" checked={selectedKeys ? selectedKeys.has(p.key) : true} onChange={() => toggleKey(p.key)} style={{ accentColor: POSITION_COLORS[i % POSITION_COLORS.length] }} />
                </div>
                <div className="bt-position-main">
                  <div className="bt-position-name">
                    <span className="bt-dot" style={{ background: POSITION_COLORS[i % POSITION_COLORS.length] }} />
                    {p.name}
                    <span className="bt-tag">{p.category}</span>
                    <span className="bt-tag bt-tag-alt">{PLATFORMS.find((pl) => pl.id === p.platform)?.label}</span>
                  </div>
                  <div className="bt-position-sub">{p.qty} unités · PRU {eur(p.avgPrice)} · investi {eur(p.invested)}</div>
                </div>
                <div className="bt-position-test">
                  <label>Prix test (€)</label>
                  <input type="number" min="0" step="any" placeholder="prix de vente" value={p.testPrice} onChange={(e) => actions.setTestPrice(p.key, e.target.value)} />
                </div>
                <div className="bt-position-pv">
                  <DeltaPill value={p.pv} />
                  {p.pvPct !== null && <DeltaPill value={p.pvPct} mode="pct" size="sm" />}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bt-card">
        <div className="bt-card-head"><h3>Évolution des positions (montant investi cumulé)</h3></div>
        {positions.length === 0 ? <EmptyState text="Ajoute des achats pour voir le graphique." /> : (
          <>
            <PeriodNav period={chartPeriod} onPeriodChange={setChartPeriod} offset={chartOffset} onOffsetChange={setChartOffset} />
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={seriesData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--bt-border)" vertical={false} />
                <XAxis dataKey="label" interval={tickInterval(seriesData.length)} tick={{ fontSize: 11, fill: "var(--bt-ink-soft)" }} axisLine={{ stroke: "var(--bt-border)" }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "var(--bt-ink-soft)" }} axisLine={false} tickLine={false} width={54} tickFormatter={formatAxisEur} />
                <Tooltip formatter={(v) => eur(v)} contentStyle={{ background: "var(--bt-surface)", border: "1px solid var(--bt-border)", borderRadius: 10, fontSize: 12 }} />
                {positions.filter((p) => selectedKeys && selectedKeys.has(p.key)).map((p, i) => (
                  <Line key={p.key} dataKey={p.key} name={p.name} stroke={POSITION_COLORS[positions.findIndex(pp => pp.key === p.key) % POSITION_COLORS.length]} strokeWidth={2} dot={false} type="monotone" />
                ))}
                <Line dataKey="total" name="Total" stroke="var(--bt-ink)" strokeWidth={2} strokeDasharray="5 3" dot={false} type="monotone" />
              </LineChart>
            </ResponsiveContainer>
          </>
        )}
      </div>

      <div className="bt-card">
        <div className="bt-card-head">
          <h3>Historique des achats</h3>
        </div>
        <RecurringList rules={transactionRules} onDelete={(id) => setConfirmDelete({ type: "rule", id })} />
        {sortedTx.length === 0 ? <EmptyState text="Aucun achat pour l'instant." /> : (
          <ul className="bt-list bt-list-scroll">
            {sortedTx.map((t) => (
              <li key={t.id}>
                <div className="bt-list-main">
                  <span className="bt-list-title">{t.name} <span className="bt-tag">{t.category}</span>{t.recurringId && <Repeat size={12} className="bt-recurring-mark" />}</span>
                  <span className="bt-list-sub">{t.quantity} × {eur(t.price)} · {PLATFORMS.find((p) => p.id === t.platform)?.label} · {new Date(t.date).toLocaleDateString("fr-FR")}</span>
                </div>
                <div className="bt-list-amount">{eur(t.quantity * t.price)}</div>
                <button className="bt-icon-btn bt-icon-danger" onClick={() => setConfirmDelete({ type: "tx", id: t.id })}><Trash2 size={16} /></button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bt-card">
        <div className="bt-card-head">
          <h3>Versements par plateforme</h3>
          <button className="bt-btn-primary bt-btn-sm" onClick={() => setShowDepositForm(true)}><Plus size={16} /> Ajouter</button>
        </div>
        <RecurringList rules={depositRules} onDelete={(id) => setConfirmDelete({ type: "rule", id })} />
        {deposits.length === 0 ? <EmptyState text="Aucun versement enregistré." /> : (
          <ul className="bt-list">
            {[...deposits].sort((a, b) => new Date(b.date) - new Date(a.date)).map((d) => (
              <li key={d.id}>
                <div className="bt-list-main">
                  <span className="bt-list-title">{PLATFORMS.find((p) => p.id === d.platform)?.label}{d.recurringId && <Repeat size={12} className="bt-recurring-mark" />}</span>
                  <span className="bt-list-sub">{new Date(d.date).toLocaleDateString("fr-FR")}</span>
                </div>
                <div className="bt-list-amount">{eur(d.amount)}</div>
                <button className="bt-icon-btn bt-icon-danger" onClick={() => setConfirmDelete({ type: "deposit", id: d.id })}><Trash2 size={16} /></button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal open={showTxForm} title="Ajouter un achat" onClose={() => setShowTxForm(false)}>
        <TransactionForm
          onSubmitOnce={(tx) => { actions.addTransaction(tx); setShowTxForm(false); }}
          onSubmitRecurring={(rule) => { actions.addRecurringRule(rule); setShowTxForm(false); }}
          onCancel={() => setShowTxForm(false)}
        />
      </Modal>
      <Modal open={showDepositForm} title="Ajouter un versement" onClose={() => setShowDepositForm(false)}>
        <DepositForm
          onSubmitOnce={(d) => { actions.addDeposit(d); setShowDepositForm(false); }}
          onSubmitRecurring={(rule) => { actions.addRecurringRule(rule); setShowDepositForm(false); }}
          onCancel={() => setShowDepositForm(false)}
        />
      </Modal>
      <ConfirmDialog
        open={!!confirmDelete}
        title={confirmDelete?.type === "rule" ? "Arrêter cette récurrence ?" : "Supprimer cet élément ?"}
        message={confirmDelete?.type === "rule" ? "Les versements déjà effectués restent enregistrés. Seules les prochaines échéances automatiques seront arrêtées." : "Cette action est définitive et ne peut pas être annulée."}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete.type === "tx") actions.deleteTransaction(confirmDelete.id);
          else if (confirmDelete.type === "deposit") actions.deleteDeposit(confirmDelete.id);
          else if (confirmDelete.type === "rule") actions.deleteRecurringRule(confirmDelete.id);
          setConfirmDelete(null);
        }}
      />
    </div>
  );
}

/* ============================== ASSURANCE VIE ============================== */

function AVForm({ onSubmitOnce, onSubmitRecurring, onCancel }) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState("");
  const [mode, setMode] = useState("ponctuel");
  const [freqValue, setFreqValue] = useState("1");
  const [freqUnit, setFreqUnit] = useState("mois");
  const valid = Number(amount) > 0 && (mode === "ponctuel" || Number(freqValue) > 0);
  const previewCount = useMemo(() => {
    if (mode !== "periodique" || !Number(freqValue)) return 0;
    return computeDueDates({ lastGeneratedDate: null, startDate: date, frequencyValue: Number(freqValue), frequencyUnit: freqUnit }, todayStr()).length;
  }, [mode, freqValue, freqUnit, date]);
  const handleSubmit = () => {
    if (mode === "ponctuel") onSubmitOnce({ id: uid(), amount: Number(amount), date, note: note.trim() });
    else onSubmitRecurring({ id: uid(), kind: "av", active: true, amount: Number(amount), note: note.trim(), startDate: date, frequencyValue: Number(freqValue), frequencyUnit: freqUnit, lastGeneratedDate: null });
  };
  return (
    <div className="bt-form">
      <FieldRow label="Montant versé (€)">
        <input type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
      </FieldRow>
      <RecurrenceToggle mode={mode} setMode={setMode} freqValue={freqValue} setFreqValue={setFreqValue} freqUnit={freqUnit} setFreqUnit={setFreqUnit} startDate={date} previewCount={previewCount} />
      <FieldRow label={mode === "ponctuel" ? "Date" : "Premier versement le"}>
        <input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} />
      </FieldRow>
      <FieldRow label="Note (optionnel)">
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Versement mensuel..." />
      </FieldRow>
      <div className="bt-modal-actions">
        <button className="bt-btn-ghost" onClick={onCancel}>Annuler</button>
        <button className="bt-btn-primary" disabled={!valid} onClick={handleSubmit}>{mode === "ponctuel" ? "Ajouter le versement" : "Créer le versement périodique"}</button>
      </div>
    </div>
  );
}

function AVTab({ data, actions }) {
  const { avDeposits, rules } = data;
  const [chartPeriod, setChartPeriod] = useState("tout");
  const [chartOffset, setChartOffset] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const avRules = rules.filter((r) => r.kind === "av");

  const total = avDeposits.reduce((s, d) => s + Number(d.amount), 0);
  const now = new Date();
  const thisMonth = avDeposits.filter((d) => { const dt = new Date(d.date); return dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear(); }).reduce((s, d) => s + Number(d.amount), 0);
  const sortedDeposits = useMemo(() => [...avDeposits].sort((a, b) => new Date(b.date) - new Date(a.date)), [avDeposits]);

  const chartData = useMemo(() => {
    const buckets = bucketsForPeriod(chartPeriod, chartOffset);
    const sorted = [...avDeposits].sort((a, b) => new Date(a.date) - new Date(b.date));
    return buckets.map((b) => {
      const total = sorted.filter((d) => new Date(d.date) <= b.end).reduce((s, d) => s + Number(d.amount), 0);
      return { label: b.label, total };
    });
  }, [avDeposits, chartPeriod, chartOffset]);

  return (
    <div className="bt-tab">
      <div className="bt-grid-stats">
        <StatCard label="Total versé (approximatif)" value={eur(total)} sub={`${avDeposits.length} versement(s)`} />
        <StatCard label="Versé ce mois-ci" value={eur(thisMonth)} />
      </div>

      <div className="bt-card">
        <div className="bt-card-head"><h3>Évolution des versements cumulés</h3></div>
        {avDeposits.length === 0 ? <EmptyState text="Ajoute ton premier versement pour voir le graphique." /> : (
          <>
            <PeriodNav period={chartPeriod} onPeriodChange={setChartPeriod} offset={chartOffset} onOffsetChange={setChartOffset} />
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--bt-border)" vertical={false} />
                <XAxis dataKey="label" interval={tickInterval(chartData.length)} tick={{ fontSize: 11, fill: "var(--bt-ink-soft)" }} axisLine={{ stroke: "var(--bt-border)" }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "var(--bt-ink-soft)" }} axisLine={false} tickLine={false} width={54} tickFormatter={formatAxisEur} />
                <Tooltip formatter={(v) => eur(v)} contentStyle={{ background: "var(--bt-surface)", border: "1px solid var(--bt-border)", borderRadius: 10, fontSize: 12 }} />
                <Line dataKey="total" name="Total versé" stroke="#2F6FB0" strokeWidth={2.5} dot={false} type="monotone" />
              </LineChart>
            </ResponsiveContainer>
          </>
        )}
      </div>

      <div className="bt-card">
        <div className="bt-card-head">
          <h3>Historique des versements</h3>
          <button className="bt-btn-primary bt-btn-sm" onClick={() => setShowForm(true)}><Plus size={16} /> Ajouter</button>
        </div>
        <RecurringList rules={avRules} onDelete={(id) => setConfirmDelete({ type: "rule", id })} />
        {sortedDeposits.length === 0 ? <EmptyState text="Aucun versement pour l'instant." /> : (
          <ul className="bt-list bt-list-scroll">
            {sortedDeposits.map((d) => (
              <li key={d.id}>
                <div className="bt-list-main">
                  <span className="bt-list-title">{d.note || "Versement"}{d.recurringId && <Repeat size={12} className="bt-recurring-mark" />}</span>
                  <span className="bt-list-sub">{new Date(d.date).toLocaleDateString("fr-FR")}</span>
                </div>
                <div className="bt-list-amount">{eur(d.amount)}</div>
                <button className="bt-icon-btn bt-icon-danger" onClick={() => setConfirmDelete({ type: "deposit", id: d.id })}><Trash2 size={16} /></button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal open={showForm} title="Ajouter un versement" onClose={() => setShowForm(false)}>
        <AVForm
          onSubmitOnce={(d) => { actions.addAVDeposit(d); setShowForm(false); }}
          onSubmitRecurring={(rule) => { actions.addRecurringRule(rule); setShowForm(false); }}
          onCancel={() => setShowForm(false)}
        />
      </Modal>
      <ConfirmDialog
        open={!!confirmDelete}
        title={confirmDelete?.type === "rule" ? "Arrêter cette récurrence ?" : "Supprimer ce versement ?"}
        message={confirmDelete?.type === "rule" ? "Les versements déjà effectués restent enregistrés. Seules les prochaines échéances automatiques seront arrêtées." : "Cette action est définitive et ne peut pas être annulée."}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete.type === "deposit") actions.deleteAVDeposit(confirmDelete.id);
          else if (confirmDelete.type === "rule") actions.deleteRecurringRule(confirmDelete.id);
          setConfirmDelete(null);
        }}
      />
    </div>
  );
}

/* ============================== DEPENSES ============================== */

function ExpenseForm({ onSubmitOnce, onSubmitRecurring, onCancel }) {
  const [type, setType] = useState("variable");
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [customCategory, setCustomCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayStr());
  const [freqValue, setFreqValue] = useState("1");
  const [freqUnit, setFreqUnit] = useState("mois");
  const [endDate, setEndDate] = useState("");
  const finalCategory = category === "__custom__" ? customCategory.trim() : category;
  const valid = Number(amount) > 0 && finalCategory && (type === "variable" || Number(freqValue) > 0);
  const previewCount = useMemo(() => {
    if (type !== "fixe" || !Number(freqValue)) return 0;
    return computeDueDates({ lastGeneratedDate: null, startDate: date, frequencyValue: Number(freqValue), frequencyUnit: freqUnit, endDate: endDate || null }, todayStr()).length;
  }, [type, freqValue, freqUnit, date, endDate]);
  const handleSubmit = () => {
    if (type === "variable") {
      onSubmitOnce({ id: uid(), type: "variable", category: finalCategory, amount: Number(amount), date });
    } else {
      onSubmitRecurring({ id: uid(), kind: "expense", active: true, category: finalCategory, amount: Number(amount), startDate: date, frequencyValue: Number(freqValue), frequencyUnit: freqUnit, endDate: endDate || null, lastGeneratedDate: null });
    }
  };
  return (
    <div className="bt-form">
      <FieldRow label="Type">
        <div className="bt-toggle2 bt-toggle2-wide">
          <button className={type === "fixe" ? "active" : ""} onClick={() => setType("fixe")}>Fixe</button>
          <button className={type === "variable" ? "active" : ""} onClick={() => setType("variable")}>Variable</button>
        </div>
      </FieldRow>
      <FieldRow label="Catégorie">
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          <option value="__custom__">Autre (préciser)...</option>
        </select>
      </FieldRow>
      {category === "__custom__" && (
        <FieldRow label="Catégorie personnalisée">
          <input type="text" value={customCategory} onChange={(e) => setCustomCategory(e.target.value)} placeholder="Nom de la catégorie" />
        </FieldRow>
      )}
      <FieldRow label="Montant (€)">
        <input type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
      </FieldRow>
      {type === "fixe" && (
        <FieldRow label="Fréquence">
          <div className="bt-freq-row">
            <span>Tous les</span>
            <input type="number" min="1" step="1" value={freqValue} onChange={(e) => setFreqValue(e.target.value)} />
            <select value={freqUnit} onChange={(e) => setFreqUnit(e.target.value)}>
              {FREQ_UNITS.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
            </select>
          </div>
        </FieldRow>
      )}
      <FieldRow label={type === "variable" ? "Date" : "Première échéance le"}>
        <input type="date" value={date} max={type === "variable" ? todayStr() : undefined} onChange={(e) => setDate(e.target.value)} />
      </FieldRow>
      {type === "fixe" && (
        <FieldRow label="Échéance de fin (optionnel)">
          <input type="date" value={endDate} min={date} onChange={(e) => setEndDate(e.target.value)} />
        </FieldRow>
      )}
      {type === "fixe" && previewCount > 0 && (
        <div className="bt-form-preview bt-form-preview-recurring">
          <Repeat size={13} /> {previewCount} échéance{previewCount > 1 ? "s" : ""} depuis le {new Date(date).toLocaleDateString("fr-FR")} {previewCount > 1 ? "seront ajoutées" : "sera ajoutée"} tout de suite. {endDate ? `Ça s'arrêtera au ${new Date(endDate).toLocaleDateString("fr-FR")}.` : "Sans date de fin, ça continuera automatiquement à chaque ouverture de l'appli."}
        </div>
      )}
      <div className="bt-modal-actions">
        <button className="bt-btn-ghost" onClick={onCancel}>Annuler</button>
        <button className="bt-btn-primary" disabled={!valid} onClick={handleSubmit}>{type === "variable" ? "Ajouter la dépense" : "Créer la dépense fixe"}</button>
      </div>
    </div>
  );
}

function DepensesTab({ data, actions }) {
  const { expenses, settings, rules } = data;
  const [period, setPeriod] = useState("1m");
  const [offset, setOffset] = useState(0);
  const [mode, setMode] = useState("eur");
  const [showForm, setShowForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [incomeInput, setIncomeInput] = useState(settings.monthlyIncome || "");
  const expenseRules = rules.filter((r) => r.kind === "expense");

  useEffect(() => setIncomeInput(settings.monthlyIncome || ""), [settings.monthlyIncome]);

  const now = new Date();
  const depensesMois = expenses.filter((e) => { const d = new Date(e.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
  const totalMois = depensesMois.reduce((s, e) => s + Number(e.amount), 0);
  const fixeMois = depensesMois.filter((e) => e.type === "fixe").reduce((s, e) => s + Number(e.amount), 0);
  const variableMois = depensesMois.filter((e) => e.type === "variable").reduce((s, e) => s + Number(e.amount), 0);
  const solde = (Number(settings.monthlyIncome) || 0) - totalMois;

  const filtered = useMemo(() => expenses.filter((e) => inPeriodRange(e.date, period, offset)).sort((a, b) => new Date(b.date) - new Date(a.date)), [expenses, period, offset]);
  const totalPeriode = filtered.reduce((s, e) => s + Number(e.amount), 0);

  const chartData = useMemo(() => {
    const buckets = bucketsForPeriod(period, offset);
    return buckets.map((b) => {
      const inBucket = expenses.filter((e) => { const d = new Date(e.date); return d >= b.start && d <= b.end; });
      const fixe = inBucket.filter((e) => e.type === "fixe").reduce((s, e) => s + Number(e.amount), 0);
      const variable = inBucket.filter((e) => e.type === "variable").reduce((s, e) => s + Number(e.amount), 0);
      if (mode === "pct" && totalPeriode > 0) return { label: b.label, fixe: (fixe / totalPeriode) * 100, variable: (variable / totalPeriode) * 100 };
      return { label: b.label, fixe, variable };
    });
  }, [expenses, period, offset, mode, totalPeriode]);

  const catData = useMemo(() => {
    const map = {};
    filtered.forEach((e) => { map[e.category] = (map[e.category] || 0) + Number(e.amount); });
    return Object.entries(map).map(([name, value], i) => ({ name, value, color: POSITION_COLORS[i % POSITION_COLORS.length] })).sort((a, b) => b.value - a.value);
  }, [filtered]);

  return (
    <div className="bt-tab">
      <div className="bt-grid-stats">
        <StatCard label="Dépenses ce mois-ci" value={eur(totalMois)} sub={`Fixe ${eur(fixeMois)} · Variable ${eur(variableMois)}`} />
        <StatCard label="Solde du mois" value={signedEur(solde)} tone={solde >= 0 ? "pos" : "neg"} sub={
          <span className="bt-income-inline">
            Revenu mensuel :{" "}
            <input type="number" min="0" step="any" value={incomeInput} onChange={(e) => setIncomeInput(e.target.value)} onBlur={() => actions.setMonthlyIncome(Number(incomeInput) || 0)} placeholder="0" />
            €
          </span>
        } />
      </div>

      <div className="bt-card">
        <div className="bt-card-head">
          <h3>Dépenses par période</h3>
          <div className="bt-controls-row">
            <ModeToggle value={mode} onChange={setMode} />
            <button className="bt-btn-primary bt-btn-sm" onClick={() => setShowForm(true)}><Plus size={16} /> Ajouter</button>
          </div>
        </div>
        <PeriodNav period={period} onPeriodChange={setPeriod} offset={offset} onOffsetChange={setOffset} />
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--bt-border)" vertical={false} />
            <XAxis dataKey="label" interval={tickInterval(chartData.length)} tick={{ fontSize: 11, fill: "var(--bt-ink-soft)" }} axisLine={{ stroke: "var(--bt-border)" }} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "var(--bt-ink-soft)" }} axisLine={false} tickLine={false} width={54} tickFormatter={(v) => mode === "pct" ? `${v.toFixed(0)}%` : formatAxisEur(v)} />
            <Tooltip formatter={(v) => mode === "pct" ? `${v.toFixed(1)}%` : eur(v)} contentStyle={{ background: "var(--bt-surface)", border: "1px solid var(--bt-border)", borderRadius: 10, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="fixe" name="Fixe" stackId="a" fill="#24504D" radius={[0, 0, 0, 0]} />
            <Bar dataKey="variable" name="Variable" stackId="a" fill="#C97A3E" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bt-two-col">
        <div className="bt-card">
          <div className="bt-card-head"><h3>Répartition par catégorie</h3></div>
          {catData.length === 0 ? <EmptyState text="Aucune dépense sur cette période." /> : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={catData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {catData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip formatter={(v) => eur(v)} contentStyle={{ background: "var(--bt-surface)", border: "1px solid var(--bt-border)", borderRadius: 10, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="bt-card">
          <div className="bt-card-head"><h3>Détail des dépenses</h3><span className="bt-total-chip">{eur(totalPeriode)}</span></div>
          <RecurringList rules={expenseRules} onDelete={(id) => setConfirmDelete({ type: "rule", id })} />
          {filtered.length === 0 ? <EmptyState text="Aucune dépense sur cette période." /> : (
            <ul className="bt-list bt-list-scroll">
              {filtered.map((e) => (
                <li key={e.id}>
                  <div className="bt-list-main">
                    <span className="bt-list-title">{e.category} <span className={`bt-tag ${e.type === "fixe" ? "bt-tag-fixe" : "bt-tag-variable"}`}>{e.type}</span>{e.recurringId && <Repeat size={12} className="bt-recurring-mark" />}</span>
                    <span className="bt-list-sub">{new Date(e.date).toLocaleDateString("fr-FR")}</span>
                  </div>
                  <div className="bt-list-amount">{eur(e.amount)}</div>
                  <button className="bt-icon-btn bt-icon-danger" onClick={() => setConfirmDelete({ type: "expense", id: e.id })}><Trash2 size={16} /></button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <Modal open={showForm} title="Ajouter une dépense" onClose={() => setShowForm(false)}>
        <ExpenseForm
          onSubmitOnce={(e) => { actions.addExpense(e); setShowForm(false); }}
          onSubmitRecurring={(rule) => { actions.addRecurringRule(rule); setShowForm(false); }}
          onCancel={() => setShowForm(false)}
        />
      </Modal>
      <ConfirmDialog
        open={!!confirmDelete}
        title={confirmDelete?.type === "rule" ? "Arrêter cette dépense fixe ?" : "Supprimer cette dépense ?"}
        message={confirmDelete?.type === "rule" ? "Les dépenses déjà générées restent enregistrées. Seules les prochaines échéances automatiques seront arrêtées." : "Cette action est définitive et ne peut pas être annulée."}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete.type === "expense") actions.deleteExpense(confirmDelete.id);
          else if (confirmDelete.type === "rule") actions.deleteRecurringRule(confirmDelete.id);
          setConfirmDelete(null);
        }}
      />
    </div>
  );
}

/* ============================== GRAPHES LIBRES ============================== */

function GraphesTab({ data }) {
  const { deposits, transactions, avDeposits, expenses } = data;
  const [index, setIndex] = useState(0);
  const [touchX, setTouchX] = useState(null);

  const totalVerseTR = deposits.filter((d) => d.platform === "traderepublic").reduce((s, d) => s + Number(d.amount), 0);
  const totalVerseBinance = deposits.filter((d) => d.platform === "binance").reduce((s, d) => s + Number(d.amount), 0);
  const totalVerseAV = avDeposits.reduce((s, d) => s + Number(d.amount), 0);

  const overviewData = useMemo(() => buildOverviewData("tout", { transactions, avDeposits, expenses }, "eur"), [transactions, avDeposits, expenses]);

  const pieRepartition = [
    { name: "Trade Republic", value: totalVerseTR, color: "#24504D" },
    { name: "Binance", value: totalVerseBinance, color: "#C97A3E" },
    { name: "Assurance vie", value: totalVerseAV, color: "#2F6FB0" },
  ].filter((d) => d.value > 0);

  const placementsData = useMemo(() => {
    const buckets = bucketsForPeriod("tout");
    const events = transactions.map((t) => ({ date: t.date, amount: Number(t.quantity) * Number(t.price) }));
    return buckets.map((b) => ({ label: b.label, investi: events.filter((e) => new Date(e.date) <= b.end).reduce((s, e) => s + e.amount, 0) }));
  }, [transactions]);

  const avData = useMemo(() => {
    const buckets = bucketsForPeriod("tout");
    return buckets.map((b) => {
      const cum = avDeposits.filter((d) => new Date(d.date) <= b.end).reduce((s, d) => s + Number(d.amount), 0);
      const mensuel = avDeposits.filter((d) => { const dt = new Date(d.date); return dt >= b.start && dt <= b.end; }).reduce((s, d) => s + Number(d.amount), 0);
      return { label: b.label, cumule: cum, mensuel };
    });
  }, [avDeposits]);

  const depensesData = useMemo(() => {
    const buckets = bucketsForPeriod("tout");
    return buckets.map((b) => {
      const inB = expenses.filter((e) => { const d = new Date(e.date); return d >= b.start && d <= b.end; });
      return { label: b.label, fixe: inB.filter((e) => e.type === "fixe").reduce((s, e) => s + Number(e.amount), 0), variable: inB.filter((e) => e.type === "variable").reduce((s, e) => s + Number(e.amount), 0) };
    });
  }, [expenses]);

  const graphs = [
    {
      title: "Vue d'ensemble",
      empty: transactions.length === 0 && avDeposits.length === 0 && expenses.length === 0,
      render: () => (
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={overviewData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--bt-border)" vertical={false} />
            <XAxis dataKey="label" interval={tickInterval(overviewData.length)} tick={{ fontSize: 11, fill: "var(--bt-ink-soft)" }} axisLine={{ stroke: "var(--bt-border)" }} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "var(--bt-ink-soft)" }} axisLine={false} tickLine={false} width={54} tickFormatter={formatAxisEur} />
            <Tooltip formatter={(v) => eur(v)} contentStyle={{ background: "var(--bt-surface)", border: "1px solid var(--bt-border)", borderRadius: 10, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="depenses" name="Dépenses" fill="#C97A3E" radius={[4, 4, 0, 0]} />
            <Line dataKey="placements" name="Placements (cumulé)" stroke="#24504D" strokeWidth={2.5} dot={false} type="monotone" />
          </ComposedChart>
        </ResponsiveContainer>
      ),
    },
    {
      title: "Répartition du patrimoine",
      empty: pieRepartition.length === 0,
      render: () => (
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie data={pieRepartition} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={2}>
              {pieRepartition.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
            <Tooltip formatter={(v) => eur(v)} contentStyle={{ background: "var(--bt-surface)", border: "1px solid var(--bt-border)", borderRadius: 10, fontSize: 12 }} />
            <Legend verticalAlign="bottom" wrapperStyle={{ fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      ),
    },
    {
      title: "Placements — évolution",
      empty: transactions.length === 0,
      render: () => (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={placementsData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--bt-border)" vertical={false} />
            <XAxis dataKey="label" interval={tickInterval(placementsData.length)} tick={{ fontSize: 11, fill: "var(--bt-ink-soft)" }} axisLine={{ stroke: "var(--bt-border)" }} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "var(--bt-ink-soft)" }} axisLine={false} tickLine={false} width={54} tickFormatter={formatAxisEur} />
            <Tooltip formatter={(v) => eur(v)} contentStyle={{ background: "var(--bt-surface)", border: "1px solid var(--bt-border)", borderRadius: 10, fontSize: 12 }} />
            <Line dataKey="investi" name="Montant investi cumulé" stroke="#24504D" strokeWidth={2.5} dot={false} type="monotone" />
          </LineChart>
        </ResponsiveContainer>
      ),
    },
    {
      title: "Assurance vie — versements",
      empty: avDeposits.length === 0,
      render: () => (
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={avData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--bt-border)" vertical={false} />
            <XAxis dataKey="label" interval={tickInterval(avData.length)} tick={{ fontSize: 11, fill: "var(--bt-ink-soft)" }} axisLine={{ stroke: "var(--bt-border)" }} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "var(--bt-ink-soft)" }} axisLine={false} tickLine={false} width={54} tickFormatter={formatAxisEur} />
            <Tooltip formatter={(v) => eur(v)} contentStyle={{ background: "var(--bt-surface)", border: "1px solid var(--bt-border)", borderRadius: 10, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="mensuel" name="Versement" fill="#2F6FB0" radius={[4, 4, 0, 0]} />
            <Line dataKey="cumule" name="Cumulé" stroke="var(--bt-ink)" strokeWidth={2} dot={false} type="monotone" />
          </ComposedChart>
        </ResponsiveContainer>
      ),
    },
    {
      title: "Dépenses — fixe vs extra",
      empty: expenses.length === 0,
      render: () => (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={depensesData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--bt-border)" vertical={false} />
            <XAxis dataKey="label" interval={tickInterval(depensesData.length)} tick={{ fontSize: 11, fill: "var(--bt-ink-soft)" }} axisLine={{ stroke: "var(--bt-border)" }} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "var(--bt-ink-soft)" }} axisLine={false} tickLine={false} width={54} tickFormatter={formatAxisEur} />
            <Tooltip formatter={(v) => eur(v)} contentStyle={{ background: "var(--bt-surface)", border: "1px solid var(--bt-border)", borderRadius: 10, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="fixe" name="Fixe" stackId="a" fill="#24504D" />
            <Bar dataKey="variable" name="Variable" stackId="a" fill="#C97A3E" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ),
    },
  ];

  const current = graphs[index];
  const go = (dir) => setIndex((i) => (i + dir + graphs.length) % graphs.length);

  return (
    <div className="bt-tab">
      <div className="bt-card">
        <div className="bt-carousel-head">
          <button className="bt-icon-btn bt-carousel-arrow" onClick={() => go(-1)}><ChevronLeft size={20} /></button>
          <div className="bt-carousel-title">
            <span className="bt-carousel-index">{index + 1}/{graphs.length}</span>
            <h3>{current.title}</h3>
          </div>
          <button className="bt-icon-btn bt-carousel-arrow" onClick={() => go(1)}><ChevronRight size={20} /></button>
        </div>
        <div
          className="bt-chart-wrap"
          onTouchStart={(e) => setTouchX(e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (touchX === null) return;
            const dx = e.changedTouches[0].clientX - touchX;
            if (dx > 50) go(-1); else if (dx < -50) go(1);
            setTouchX(null);
          }}
        >
          {current.empty ? <EmptyState text="Pas encore assez de données pour ce graphique." /> : current.render()}
        </div>
        <div className="bt-carousel-dots">
          {graphs.map((g, i) => <button key={i} className={`bt-dot-btn ${i === index ? "active" : ""}`} onClick={() => setIndex(i)} aria-label={g.title} />)}
        </div>
      </div>
    </div>
  );
}

/* ============================== APP ============================== */

export default function App() {
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("accueil");
  const [deposits, setDeposits] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [testPrices, setTestPrices] = useState({});
  const [avDeposits, setAvDeposits] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [settings, setSettings] = useState({ monthlyIncome: 0 });
  const [rules, setRules] = useState([]);

  useEffect(() => {
    (async () => {
      const { deposits: loadedDeposits, transactions: loadedTx, testPrices: loadedTestPrices, avDeposits: loadedAV, expenses: loadedExpenses, settings: loadedSettings, rules: loadedRules } = await api.fetchAll();

      setTestPrices(loadedTestPrices);
      setSettings(loadedSettings);

      const { updatedRules, newDeposits, newAV, newTx, newExpenses } = runRecurringCatchUp(loadedRules, loadedDeposits, loadedAV, loadedTx, loadedExpenses);
      setDeposits(newDeposits);
      setAvDeposits(newAV);
      setTransactions(newTx);
      setExpenses(newExpenses);
      setRules(updatedRules);

      // Ne persiste que les nouvelles lignes générées par le rattrapage des récurrences
      api.insertDeposits(newDeposits.slice(loadedDeposits.length));
      api.insertAVDeposits(newAV.slice(loadedAV.length));
      api.insertTransactions(newTx.slice(loadedTx.length));
      api.insertExpenses(newExpenses.slice(loadedExpenses.length));
      updatedRules.forEach((ur) => {
        const orig = loadedRules.find((r) => r.id === ur.id);
        if (!orig || orig.lastGeneratedDate !== ur.lastGeneratedDate || orig.active !== ur.active) {
          api.upsertRule(ur);
        }
      });

      setLoading(false);
    })();
  }, []);

  const actions = {
    addDeposit: (d) => { setDeposits((prev) => [...prev, d]); api.insertDeposits([d]); },
    deleteDeposit: (id) => { setDeposits((prev) => prev.filter((x) => x.id !== id)); api.deleteRow("deposits", id); },
    addTransaction: (t) => { setTransactions((prev) => [...prev, t]); api.insertTransactions([t]); },
    deleteTransaction: (id) => { setTransactions((prev) => prev.filter((x) => x.id !== id)); api.deleteRow("transactions", id); },
    setTestPrice: (key, value) => { setTestPrices((prev) => ({ ...prev, [key]: value === "" ? "" : Number(value) })); api.upsertTestPrice(key, value); },
    addAVDeposit: (d) => { setAvDeposits((prev) => [...prev, d]); api.insertAVDeposits([d]); },
    deleteAVDeposit: (id) => { setAvDeposits((prev) => prev.filter((x) => x.id !== id)); api.deleteRow("av_deposits", id); },
    addExpense: (e) => { setExpenses((prev) => [...prev, e]); api.insertExpenses([e]); },
    deleteExpense: (id) => { setExpenses((prev) => prev.filter((x) => x.id !== id)); api.deleteRow("expenses", id); },
    setMonthlyIncome: (v) => { setSettings((prev) => ({ ...prev, monthlyIncome: v })); api.upsertSettings(v); },
    addRecurringRule: (rule) => {
      const newRulesList = [...rules, rule];
      const { updatedRules, newDeposits, newAV, newTx, newExpenses } = runRecurringCatchUp(newRulesList, deposits, avDeposits, transactions, expenses);
      setRules(updatedRules);
      setDeposits(newDeposits);
      setAvDeposits(newAV);
      setTransactions(newTx);
      setExpenses(newExpenses);

      const finalRule = updatedRules.find((r) => r.id === rule.id);
      api.upsertRule(finalRule);
      api.insertDeposits(newDeposits.slice(deposits.length));
      api.insertAVDeposits(newAV.slice(avDeposits.length));
      api.insertTransactions(newTx.slice(transactions.length));
      api.insertExpenses(newExpenses.slice(expenses.length));
    },
    deleteRecurringRule: (id) => { setRules((prev) => prev.filter((x) => x.id !== id)); api.deleteRow("recurring_rules", id); },
  };

  const data = { deposits, transactions, testPrices, avDeposits, expenses, settings, rules };

  return (
    <div className="bt-app">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Space+Mono:wght@400;700&family=Inter:wght@400;500;600;700&display=swap');

        .bt-app {
          --bt-bg: #F6F4EF;
          --bt-surface: #FFFFFF;
          --bt-surface-alt: #EFEBE2;
          --bt-ink: #1E2422;
          --bt-ink-soft: #6B7570;
          --bt-teal: #24504D;
          --bt-teal-soft: #DDEAE7;
          --bt-amber: #C97A3E;
          --bt-amber-soft: #F3E1CD;
          --bt-green: #2E9E4F;
          --bt-green-soft: #E3F5E7;
          --bt-red: #D64545;
          --bt-red-soft: #FBE7E7;
          --bt-border: #E4DFD3;
          font-family: 'Inter', system-ui, sans-serif;
          color: var(--bt-ink);
          background: var(--bt-bg);
          min-height: 100vh;
          display: flex;
          box-sizing: border-box;
        }
        .bt-app * { box-sizing: border-box; }
        .bt-app button { font-family: inherit; cursor: pointer; }
        .bt-app input, .bt-app select { font-family: inherit; }

        .bt-sidebar {
          width: 220px;
          flex-shrink: 0;
          background: var(--bt-surface);
          border-right: 1px solid var(--bt-border);
          padding: 28px 16px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .bt-brand {
          font-family: 'Fraunces', serif;
          font-weight: 600;
          font-size: 20px;
          padding: 0 10px 24px;
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--bt-teal);
        }
        .bt-nav-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 11px 12px;
          border-radius: 10px;
          border: none;
          background: transparent;
          color: var(--bt-ink-soft);
          font-size: 14.5px;
          font-weight: 500;
          text-align: left;
        }
        .bt-nav-item:hover { background: var(--bt-surface-alt); }
        .bt-nav-item.active { background: var(--bt-teal-soft); color: var(--bt-teal); }

        .bt-main { flex: 1; min-width: 0; padding: 28px 32px 100px; max-width: 1180px; }
        .bt-page-title { font-family: 'Fraunces', serif; font-size: 26px; font-weight: 600; margin: 0 0 20px; }

        .bt-tab { display: flex; flex-direction: column; gap: 20px; }

        .bt-grid-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 14px; }
        .bt-stat { background: var(--bt-surface); border: 1px solid var(--bt-border); border-radius: 14px; padding: 16px 18px; }
        .bt-stat-label { font-size: 12.5px; color: var(--bt-ink-soft); margin-bottom: 6px; }
        .bt-stat-value { font-family: 'Space Mono', monospace; font-size: 21px; font-weight: 700; }
        .bt-stat-sub { font-size: 12px; color: var(--bt-ink-soft); margin-top: 4px; }
        .bt-text-pos { color: var(--bt-green); }
        .bt-text-neg { color: var(--bt-red); }

        .bt-card { background: var(--bt-surface); border: 1px solid var(--bt-border); border-radius: 16px; padding: 18px 20px; }
        .bt-card-head { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 14px; }
        .bt-card-head h3 { font-family: 'Fraunces', serif; font-size: 17px; font-weight: 600; margin: 0; }

        .bt-controls-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }

        .bt-segment { display: inline-flex; background: var(--bt-surface-alt); border-radius: 10px; padding: 3px; gap: 2px; flex-wrap: wrap; margin-bottom: 14px; }
        .bt-segment-sm { margin-bottom: 0; }
        .bt-period-nav { margin-bottom: 14px; }
        .bt-period-window { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
        .bt-period-window span { font-family: 'Space Mono', monospace; font-size: 12.5px; color: var(--bt-ink-soft); font-weight: 600; }
        .bt-period-window .bt-icon-btn { background: var(--bt-surface-alt); border-radius: 8px; width: 30px; height: 30px; }
        .bt-period-window .bt-icon-btn:disabled { opacity: 0.35; cursor: not-allowed; }
        .bt-period-window .bt-icon-btn:disabled:hover { background: var(--bt-surface-alt); }
        .bt-segment-btn { border: none; background: transparent; padding: 7px 12px; border-radius: 8px; font-size: 13px; color: var(--bt-ink-soft); font-weight: 500; }
        .bt-segment-btn.active { background: var(--bt-surface); color: var(--bt-teal); box-shadow: 0 1px 2px rgba(0,0,0,0.06); }

        .bt-toggle2 { display: inline-flex; background: var(--bt-surface-alt); border-radius: 10px; padding: 3px; gap: 2px; }
        .bt-toggle2 button { border: none; background: transparent; padding: 7px 14px; border-radius: 8px; font-size: 13px; color: var(--bt-ink-soft); font-weight: 600; }
        .bt-toggle2 button.active { background: var(--bt-teal); color: white; }
        .bt-toggle2-wide button { padding: 8px 20px; }

        .bt-chart-wrap { margin-top: 4px; }

        .bt-two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        @media (max-width: 860px) { .bt-two-col { grid-template-columns: 1fr; } }

        .bt-pill { display: inline-flex; align-items: center; gap: 4px; font-family: 'Space Mono', monospace; font-size: 12.5px; font-weight: 700; padding: 4px 9px; border-radius: 999px; }
        .bt-pill-pos { background: var(--bt-green-soft); color: var(--bt-green); }
        .bt-pill-neg { background: var(--bt-red-soft); color: var(--bt-red); }
        .bt-pill-neutral { background: var(--bt-surface-alt); color: var(--bt-ink-soft); font-weight: 500; }
        .bt-pill-sm { font-size: 11px; padding: 3px 7px; }

        .bt-empty { text-align: center; color: var(--bt-ink-soft); font-size: 13.5px; padding: 30px 10px; }

        .bt-btn-primary { display: inline-flex; align-items: center; gap: 6px; background: var(--bt-teal); color: white; border: none; padding: 10px 16px; border-radius: 10px; font-weight: 600; font-size: 14px; }
        .bt-btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
        .bt-btn-sm { padding: 7px 12px; font-size: 13px; }
        .bt-btn-ghost { background: transparent; border: 1px solid var(--bt-border); color: var(--bt-ink); padding: 10px 16px; border-radius: 10px; font-weight: 600; font-size: 14px; }
        .bt-btn-danger { background: var(--bt-red); color: white; border: none; padding: 10px 16px; border-radius: 10px; font-weight: 600; font-size: 14px; }
        .bt-icon-btn { background: transparent; border: none; padding: 6px; border-radius: 8px; color: var(--bt-ink-soft); display: inline-flex; align-items: center; justify-content: center; }
        .bt-icon-btn:hover { background: var(--bt-surface-alt); }
        .bt-icon-danger:hover { background: var(--bt-red-soft); color: var(--bt-red); }
        .bt-link-btn { background: none; border: none; color: var(--bt-teal); font-size: 12px; font-weight: 600; padding: 0; text-decoration: underline; }

        .bt-positions { display: flex; flex-direction: column; gap: 10px; }
        .bt-position-row { display: flex; align-items: center; gap: 14px; padding: 12px; border: 1px solid var(--bt-border); border-radius: 12px; flex-wrap: wrap; }
        .bt-position-check input { width: 17px; height: 17px; }
        .bt-position-main { flex: 1; min-width: 160px; }
        .bt-position-name { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 14.5px; }
        .bt-position-sub { font-size: 12.5px; color: var(--bt-ink-soft); margin-top: 3px; }
        .bt-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
        .bt-tag { font-size: 10.5px; background: var(--bt-surface-alt); color: var(--bt-ink-soft); padding: 2px 7px; border-radius: 999px; font-weight: 600; }
        .bt-tag-alt { background: var(--bt-teal-soft); color: var(--bt-teal); }
        .bt-tag-fixe { background: var(--bt-teal-soft); color: var(--bt-teal); }
        .bt-tag-variable { background: var(--bt-amber-soft); color: var(--bt-amber); }
        .bt-position-test { display: flex; flex-direction: column; gap: 3px; }
        .bt-position-test label { font-size: 11px; color: var(--bt-ink-soft); }
        .bt-position-test input { width: 110px; padding: 7px 9px; border: 1px solid var(--bt-border); border-radius: 8px; font-size: 13px; background: var(--bt-bg); }
        .bt-position-pv { display: flex; flex-direction: column; gap: 4px; align-items: flex-end; }

        .bt-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
        .bt-list-scroll { max-height: 320px; overflow-y: auto; }
        .bt-list li { display: flex; align-items: center; gap: 12px; padding: 10px 4px; border-bottom: 1px solid var(--bt-border); }
        .bt-list li:last-child { border-bottom: none; }
        .bt-list-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .bt-list-title { font-size: 13.5px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
        .bt-list-sub { font-size: 12px; color: var(--bt-ink-soft); }
        .bt-list-amount { font-family: 'Space Mono', monospace; font-size: 13.5px; font-weight: 700; white-space: nowrap; }
        .bt-total-chip { font-family: 'Space Mono', monospace; font-size: 13px; font-weight: 700; background: var(--bt-surface-alt); padding: 4px 10px; border-radius: 999px; }

        .bt-recent-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
        .bt-recent-list li { display: flex; align-items: center; gap: 10px; padding: 9px 2px; border-bottom: 1px solid var(--bt-border); font-size: 13px; }
        .bt-recent-list li:last-child { border-bottom: none; }
        .bt-recent-label { flex: 1; font-weight: 500; }
        .bt-recent-date { color: var(--bt-ink-soft); font-size: 12px; }
        .bt-recent-amount { font-family: 'Space Mono', monospace; font-weight: 700; }

        .bt-income-inline { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--bt-ink-soft); }
        .bt-income-inline input { width: 60px; padding: 3px 6px; border: 1px solid var(--bt-border); border-radius: 6px; font-size: 12px; }

        .bt-carousel-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
        .bt-carousel-arrow { background: var(--bt-surface-alt); border-radius: 50%; width: 36px; height: 36px; }
        .bt-carousel-title { text-align: center; }
        .bt-carousel-index { font-family: 'Space Mono', monospace; font-size: 11px; color: var(--bt-ink-soft); }
        .bt-carousel-title h3 { font-family: 'Fraunces', serif; font-size: 19px; font-weight: 600; margin: 2px 0 0; }
        .bt-carousel-dots { display: flex; justify-content: center; gap: 6px; margin-top: 10px; }
        .bt-dot-btn { width: 7px; height: 7px; border-radius: 50%; background: var(--bt-border); border: none; padding: 0; }
        .bt-dot-btn.active { background: var(--bt-teal); width: 18px; border-radius: 4px; }

        .bt-overlay { position: fixed; inset: 0; background: rgba(20,20,18,0.45); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 16px; }
        .bt-modal { background: var(--bt-surface); border-radius: 16px; width: 100%; max-width: 440px; max-height: 90vh; overflow-y: auto; }
        .bt-modal-head { display: flex; align-items: center; justify-content: space-between; padding: 18px 20px 4px; }
        .bt-modal-head h3 { font-family: 'Fraunces', serif; font-size: 18px; margin: 0; }
        .bt-modal-body { padding: 14px 20px 20px; }
        .bt-modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }

        .bt-dialog { background: var(--bt-surface); border-radius: 16px; width: 100%; max-width: 360px; padding: 22px; text-align: center; }
        .bt-dialog-icon { width: 44px; height: 44px; border-radius: 50%; background: var(--bt-red-soft); color: var(--bt-red); display: flex; align-items: center; justify-content: center; margin: 0 auto 12px; }
        .bt-dialog h3 { font-family: 'Fraunces', serif; font-size: 17px; margin: 0 0 6px; }
        .bt-dialog p { font-size: 13.5px; color: var(--bt-ink-soft); margin: 0; }
        .bt-dialog-actions { display: flex; gap: 10px; margin-top: 18px; }
        .bt-dialog-actions button { flex: 1; }

        .bt-form { display: flex; flex-direction: column; gap: 12px; }
        .bt-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .bt-field { display: flex; flex-direction: column; gap: 5px; font-size: 12.5px; font-weight: 600; color: var(--bt-ink-soft); }
        .bt-field input, .bt-field select { padding: 10px 11px; border: 1px solid var(--bt-border); border-radius: 9px; font-size: 14px; color: var(--bt-ink); background: var(--bt-bg); }
        .bt-field input:focus, .bt-field select:focus { outline: 2px solid var(--bt-teal); outline-offset: 1px; }
        .bt-form-preview { font-size: 13px; background: var(--bt-teal-soft); color: var(--bt-teal); padding: 8px 12px; border-radius: 9px; }
        .bt-form-preview-recurring { display: flex; align-items: flex-start; gap: 7px; background: var(--bt-amber-soft); color: var(--bt-amber); line-height: 1.4; }
        .bt-form-preview-recurring svg { flex-shrink: 0; margin-top: 2px; }
        .bt-freq-row { display: flex; align-items: center; gap: 8px; }
        .bt-freq-row span { font-size: 13px; color: var(--bt-ink-soft); font-weight: 500; white-space: nowrap; }
        .bt-freq-row input { width: 64px; padding: 10px 11px; border: 1px solid var(--bt-border); border-radius: 9px; font-size: 14px; background: var(--bt-bg); }
        .bt-freq-row select { flex: 1; padding: 10px 11px; border: 1px solid var(--bt-border); border-radius: 9px; font-size: 14px; background: var(--bt-bg); }
        .bt-recurring-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
        .bt-recurring-chip { display: flex; align-items: center; gap: 8px; background: var(--bt-amber-soft); color: var(--bt-amber); font-size: 12.5px; font-weight: 600; padding: 7px 10px; border-radius: 9px; }
        .bt-recurring-chip span { flex: 1; }
        .bt-recurring-chip svg:first-child { flex-shrink: 0; }
        .bt-recurring-mark { color: var(--bt-amber); margin-left: 5px; vertical-align: -1px; }

        .bt-bottomnav { display: none; }
        .bt-loading { display: flex; align-items: center; justify-content: center; height: 100vh; width: 100%; gap: 10px; color: var(--bt-ink-soft); font-size: 14px; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        @media (max-width: 768px) {
          .bt-sidebar { display: none; }
          .bt-main { padding: 20px 14px 90px; }
          .bt-bottomnav {
            display: flex;
            position: fixed;
            bottom: 0; left: 0; right: 0;
            background: var(--bt-surface);
            border-top: 1px solid var(--bt-border);
            padding: 8px 6px calc(8px + env(safe-area-inset-bottom));
            justify-content: space-around;
            z-index: 50;
          }
          .bt-bottomnav button {
            display: flex; flex-direction: column; align-items: center; gap: 3px;
            background: none; border: none; color: var(--bt-ink-soft); font-size: 10.5px; font-weight: 600; padding: 4px 6px;
          }
          .bt-bottomnav button.active { color: var(--bt-teal); }
          .bt-form-row { grid-template-columns: 1fr; }
          .bt-position-row { flex-direction: column; align-items: stretch; }
          .bt-position-pv { align-items: flex-start; flex-direction: row; gap: 8px; }
        }
      `}</style>

      {loading ? (
        <div className="bt-loading"><Loader2 className="bt-spin" size={20} style={{ animation: "spin 1s linear infinite" }} /> Chargement de tes données…</div>
      ) : (
        <>
          <nav className="bt-sidebar">
            <div className="bt-brand"><Landmark size={20} /> Suivi budget</div>
            {TABS.map((t) => {
              const Icon = t.icon;
              return (
                <button key={t.id} className={`bt-nav-item ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
                  <Icon size={17} /> {t.label}
                </button>
              );
            })}
          </nav>

          <main className="bt-main">
            <h1 className="bt-page-title">{TABS.find((t) => t.id === tab)?.label}</h1>
            {tab === "accueil" && <AccueilTab data={data} />}
            {tab === "placements" && <PlacementsTab data={data} actions={actions} />}
            {tab === "av" && <AVTab data={data} actions={actions} />}
            {tab === "depenses" && <DepensesTab data={data} actions={actions} />}
            {tab === "graphes" && <GraphesTab data={data} />}
          </main>

          <nav className="bt-bottomnav">
            {TABS.map((t) => {
              const Icon = t.icon;
              return (
                <button key={t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>
                  <Icon size={19} /> {t.label}
                </button>
              );
            })}
          </nav>
        </>
      )}
    </div>
  );
}
