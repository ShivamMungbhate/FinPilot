'use client';

import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { PolicyConfig, PolicyCheckResult } from '../../lib/types';
import { Navbar } from '../../components/Navbar';
import {
  ShieldCheck,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Play,
  RotateCcw,
  Sliders,
  DollarSign,
  Clock,
  Bell
} from 'lucide-react';

export default function PolicyEnginePage() {
  const [policy, setPolicy] = useState<PolicyConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form inputs
  const [maxAmountLimit, setMaxAmountLimit] = useState(10000);
  const [duplicateWindowHours, setDuplicateWindowHours] = useState(24);
  const [maxRemindersPerInvoice, setMaxRemindersPerInvoice] = useState(3);
  const [minDaysBetweenReminders, setMinDaysBetweenReminders] = useState(3);

  // Dry-run simulator
  const [testEmail, setTestEmail] = useState('client@example.com');
  const [testAmount, setTestAmount] = useState(12000);
  const [evalResult, setEvalResult] = useState<PolicyCheckResult | null>(null);
  const [evaluating, setEvaluating] = useState(false);

  async function loadPolicy() {
    setLoading(true);
    try {
      const data = await api.getPolicy();
      setPolicy(data.policy);
      setMaxAmountLimit(data.policy.maxAmountLimit);
      setDuplicateWindowHours(data.policy.duplicateWindowHours);
      setMaxRemindersPerInvoice(data.policy.maxRemindersPerInvoice);
      setMinDaysBetweenReminders(data.policy.minDaysBetweenReminders);
    } catch (err: any) {
      setError(err.message || 'Failed to load policy');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPolicy();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await api.updatePolicy({
        maxAmountLimit: Number(maxAmountLimit),
        duplicateWindowHours: Number(duplicateWindowHours),
        maxRemindersPerInvoice: Number(maxRemindersPerInvoice),
        minDaysBetweenReminders: Number(minDaysBetweenReminders),
      });
      setPolicy(res.policy);
      setSuccess('Policy configuration updated & recorded to audit log!');
    } catch (err: any) {
      setError(err.message || 'Failed to update policy');
    } finally {
      setSaving(false);
    }
  }

  async function handleEvaluateTest(e: React.FormEvent) {
    e.preventDefault();
    setEvaluating(true);
    setEvalResult(null);

    try {
      const res = await api.evaluatePolicy(testEmail, Number(testAmount));
      setEvalResult(res);
    } catch (err: any) {
      console.error(err);
    } finally {
      setEvaluating(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 pb-16">
      <Navbar />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-purple-100 text-purple-700 rounded-xl">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Policy Engine Configuration</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Hard rules governing max invoice caps, duplicate fraud checks, and reminder limits
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-2 text-xs text-rose-700">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-2 text-xs text-emerald-700">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Active Policies Form */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Sliders className="w-5 h-5 text-slate-700" />
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Enforced Invoicing Rules
              </h2>
            </div>

            <form onSubmit={handleSave} className="space-y-5">
              {/* Rule 1: Max Amount */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <DollarSign className="w-4 h-4 text-blue-600" />
                    <span>Maximum Invoice Amount Limit ($ USD)</span>
                  </label>
                  <span className="text-[10px] text-slate-500 font-mono">Hard cap</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Any draft invoice with a total exceeding this threshold will fail policy validation and require explicit override.
                </p>
                <input
                  type="number"
                  min="100"
                  step="100"
                  required
                  value={maxAmountLimit}
                  onChange={(e) => setMaxAmountLimit(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white font-mono"
                />
              </div>

              {/* Rule 2: Duplicate Window */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-amber-600" />
                    <span>Duplicate Invoice Window (Hours)</span>
                  </label>
                  <span className="text-[10px] text-slate-500 font-mono">Fraud prevention</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Flags an invoice as a duplicate violation if another invoice with identical amount was sent to the same recipient within this window.
                </p>
                <input
                  type="number"
                  min="1"
                  max="168"
                  required
                  value={duplicateWindowHours}
                  onChange={(e) => setDuplicateWindowHours(parseInt(e.target.value, 10) || 1)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white font-mono"
                />
              </div>

              {/* Rule 3: Max Reminders */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Bell className="w-4 h-4 text-orange-600" />
                    <span>Max Reminders per Invoice</span>
                  </label>
                  <span className="text-[10px] text-slate-500 font-mono">Spam mitigation</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Limits the maximum number of email notifications sent through PayPal Invoicing API per invoice.
                </p>
                <input
                  type="number"
                  min="1"
                  max="10"
                  required
                  value={maxRemindersPerInvoice}
                  onChange={(e) => setMaxRemindersPerInvoice(parseInt(e.target.value, 10) || 1)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white font-mono"
                />
              </div>

              {/* Rule 4: Min Days Between Reminders */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-indigo-600" />
                    <span>Minimum Days Between Reminders</span>
                  </label>
                  <span className="text-[10px] text-slate-500 font-mono">Cooldown period</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Enforces a cooling-off period before another reminder can be dispatched to the recipient.
                </p>
                <input
                  type="number"
                  min="1"
                  max="30"
                  required
                  value={minDaysBetweenReminders}
                  onChange={(e) => setMinDaysBetweenReminders(parseFloat(e.target.value) || 1)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white font-mono"
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  <span>Save Policy Limits</span>
                </button>
              </div>
            </form>
          </div>

          {/* Sandbox Dry-Run Tester */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Play className="w-5 h-5 text-emerald-600" />
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Dry-Run Policy Tester
              </h2>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Test an invoice candidate against active limits and the database's recent invoices without creating or saving any record.
            </p>

            <form onSubmit={handleEvaluateTest} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Test Recipient Email</label>
                <input
                  type="email"
                  required
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Test Total Amount ($ USD)</label>
                <input
                  type="number"
                  required
                  step="50"
                  value={testAmount}
                  onChange={(e) => setTestAmount(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 font-mono"
                />
              </div>

              <button
                type="submit"
                disabled={evaluating}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all disabled:opacity-50"
              >
                {evaluating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                <span>Evaluate Against Active Policy</span>
              </button>
            </form>

            {/* Test Results Output */}
            {evalResult && (
              <div
                className={`p-4 rounded-xl border text-xs space-y-2 ${
                  evalResult.allowed
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-rose-50 border-rose-200 text-rose-900'
                }`}
              >
                <div className="flex items-center gap-2 font-bold">
                  {evalResult.allowed ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Policy Check: ALLOWED (Compliant)</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-4 h-4 text-rose-600" />
                      <span>Policy Check: VIOLATION DETECTED</span>
                    </>
                  )}
                </div>

                {evalResult.violations.length > 0 && (
                  <div className="space-y-1 pt-1">
                    {evalResult.violations.map((v, i) => (
                      <div key={i} className="text-[11px] font-mono text-rose-800">
                        &bull; {v}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
