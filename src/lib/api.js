import { supabase } from "./supabaseClient.js";

/* ============================== MAPPERS ==============================
   Convertit entre les colonnes Postgres (snake_case) et les objets JS
   utilisés dans l'appli (camelCase), pour ne pas toucher à la logique
   métier existante. */

const toDepositRow = (d) => ({ id: d.id, platform: d.platform, amount: d.amount, date: d.date, recurring_id: d.recurringId || null });
const fromDepositRow = (r) => ({ id: r.id, platform: r.platform, amount: Number(r.amount), date: r.date, ...(r.recurring_id ? { recurringId: r.recurring_id } : {}) });

const toTransactionRow = (t) => ({ id: t.id, platform: t.platform, category: t.category, name: t.name, quantity: t.quantity, price: t.price, date: t.date, recurring_id: t.recurringId || null });
const fromTransactionRow = (r) => ({ id: r.id, platform: r.platform, category: r.category, name: r.name, quantity: Number(r.quantity), price: Number(r.price), date: r.date, ...(r.recurring_id ? { recurringId: r.recurring_id } : {}) });

const toAVRow = (d) => ({ id: d.id, amount: d.amount, date: d.date, note: d.note || null, recurring_id: d.recurringId || null });
const fromAVRow = (r) => ({ id: r.id, amount: Number(r.amount), date: r.date, note: r.note || "", ...(r.recurring_id ? { recurringId: r.recurring_id } : {}) });

const toExpenseRow = (e) => ({ id: e.id, type: e.type, category: e.category, amount: e.amount, date: e.date, recurring_id: e.recurringId || null });
const fromExpenseRow = (r) => ({ id: r.id, type: r.type, category: r.category, amount: Number(r.amount), date: r.date, ...(r.recurring_id ? { recurringId: r.recurring_id } : {}) });

const toRuleRow = (rule) => ({
  id: rule.id,
  kind: rule.kind,
  active: rule.active,
  platform: rule.platform || null,
  category: rule.category || null,
  name: rule.name || null,
  quantity: rule.quantity ?? null,
  price: rule.price ?? null,
  amount: rule.amount ?? null,
  note: rule.note || null,
  start_date: rule.startDate,
  frequency_value: rule.frequencyValue,
  frequency_unit: rule.frequencyUnit,
  end_date: rule.endDate || null,
  last_generated_date: rule.lastGeneratedDate || null,
});
const fromRuleRow = (r) => ({
  id: r.id,
  kind: r.kind,
  active: r.active,
  ...(r.platform ? { platform: r.platform } : {}),
  ...(r.category ? { category: r.category } : {}),
  ...(r.name ? { name: r.name } : {}),
  ...(r.quantity != null ? { quantity: Number(r.quantity) } : {}),
  ...(r.price != null ? { price: Number(r.price) } : {}),
  ...(r.amount != null ? { amount: Number(r.amount) } : {}),
  ...(r.note ? { note: r.note } : {}),
  startDate: r.start_date,
  frequencyValue: r.frequency_value,
  frequencyUnit: r.frequency_unit,
  endDate: r.end_date || null,
  lastGeneratedDate: r.last_generated_date || null,
});

/* ============================== LECTURE ============================== */

export async function fetchAll() {
  const [depositsRes, txRes, tpRes, avRes, exRes, settingsRes, rulesRes] = await Promise.all([
    supabase.from("deposits").select("*"),
    supabase.from("transactions").select("*"),
    supabase.from("test_prices").select("*"),
    supabase.from("av_deposits").select("*"),
    supabase.from("expenses").select("*"),
    supabase.from("settings").select("*").eq("id", 1).maybeSingle(),
    supabase.from("recurring_rules").select("*"),
  ]);

  [depositsRes, txRes, tpRes, avRes, exRes, settingsRes, rulesRes].forEach((res) => {
    if (res.error) console.error("Erreur de lecture Supabase :", res.error);
  });

  const testPrices = {};
  (tpRes.data || []).forEach((row) => {
    testPrices[row.position_key] = row.price === null || row.price === undefined ? "" : Number(row.price);
  });

  return {
    deposits: (depositsRes.data || []).map(fromDepositRow),
    transactions: (txRes.data || []).map(fromTransactionRow),
    testPrices,
    avDeposits: (avRes.data || []).map(fromAVRow),
    expenses: (exRes.data || []).map(fromExpenseRow),
    settings: { monthlyIncome: settingsRes.data ? Number(settingsRes.data.monthly_income) : 0 },
    rules: (rulesRes.data || []).map(fromRuleRow),
  };
}

/* ============================== ÉCRITURE ============================== */

async function insertRows(table, rows, mapper) {
  if (!rows.length) return;
  const { error } = await supabase.from(table).insert(rows.map(mapper));
  if (error) console.error(`Échec insertion ${table} :`, error);
}

export async function deleteRow(table, id) {
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) console.error(`Échec suppression ${table} :`, error);
}

export const insertDeposits = (rows) => insertRows("deposits", rows, toDepositRow);
export const insertTransactions = (rows) => insertRows("transactions", rows, toTransactionRow);
export const insertAVDeposits = (rows) => insertRows("av_deposits", rows, toAVRow);
export const insertExpenses = (rows) => insertRows("expenses", rows, toExpenseRow);

export async function upsertRule(rule) {
  const { error } = await supabase.from("recurring_rules").upsert(toRuleRow(rule));
  if (error) console.error("Échec upsert règle récurrente :", error);
}

export async function upsertTestPrice(key, price) {
  const value = price === "" || price === null || price === undefined ? null : Number(price);
  const { error } = await supabase.from("test_prices").upsert({ position_key: key, price: value });
  if (error) console.error("Échec upsert prix test :", error);
}

export async function upsertSettings(monthlyIncome) {
  const { error } = await supabase.from("settings").upsert({ id: 1, monthly_income: monthlyIncome });
  if (error) console.error("Échec upsert paramètres :", error);
}
