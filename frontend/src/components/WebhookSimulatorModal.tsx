'use client';

import React, { useState } from 'react';
import { Invoice } from '../lib/types';
import { api } from '../lib/api';
import { X, Play, Loader2, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';

interface Props {
  invoice: Invoice;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function WebhookSimulatorModal({ invoice, isOpen, onClose, onSuccess }: Props) {
  const [scenario, setScenario] = useState<'full_paid' | 'partial_paid' | 'pending'>('full_paid');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleSimulate() {
    if (!invoice.paypalInvoiceId) {
      setError('Invoice has no PayPal Invoice ID. Please create the PayPal draft first.');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    const dueAmount = scenario === 'full_paid' ? 0.0 : scenario === 'partial_paid' ? 150.0 : 0.0;
    const paidAmount = scenario === 'full_paid' ? invoice.totalAmount : invoice.totalAmount - 150.0;
    const paidStatus = scenario === 'full_paid' ? 'PAID' : scenario === 'partial_paid' ? 'PARTIALLY_PAID' : 'PENDING';

    try {
      const response = await api.simulateWebhook({
        paypalInvoiceId: invoice.paypalInvoiceId,
        eventType: 'INVOICING.INVOICE.PAID',
        paidStatus,
        dueAmount,
        paidAmount
      });

      setResult(response);
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Webhook simulation failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-100 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 px-6 py-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-xl backdrop-blur-md">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold">PayPal Webhook Simulator & Re-fetch Verifier</h2>
              <p className="text-xs text-emerald-100 mt-0.5">
                Tests INVOICING.INVOICE.PAID, signature verification, and PayPal re-fetch validation
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-emerald-100 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 leading-relaxed">
            <strong>Rule verification in action:</strong> PayPal sends events for full, partial, and pending payments.
            FinPilot re-fetches the live invoice from PayPal and marks it <strong>PAID</strong> only if status is verified as <code className="bg-blue-100 px-1 py-0.5 rounded font-mono">PAID</code> and remaining due amount is <code className="bg-blue-100 px-1 py-0.5 rounded font-mono">$0.00</code>.
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              Select Test Scenario
            </label>
            <div className="space-y-2">
              <label
                onClick={() => setScenario('full_paid')}
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  scenario === 'full_paid'
                    ? 'border-emerald-500 bg-emerald-50/50 ring-1 ring-emerald-400'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="scenario"
                  checked={scenario === 'full_paid'}
                  onChange={() => {}}
                  className="mt-1 text-emerald-600 focus:ring-emerald-500"
                />
                <div>
                  <strong className="text-xs text-slate-900 block">
                    Scenario 1: Full Payment Confirmed ($0.00 Due)
                  </strong>
                  <span className="text-[11px] text-slate-500">
                    PayPal returns status 'PAID', due amount = 0.00. Invoice transitions to PAID.
                  </span>
                </div>
              </label>

              <label
                onClick={() => setScenario('partial_paid')}
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  scenario === 'partial_paid'
                    ? 'border-amber-500 bg-amber-50/50 ring-1 ring-amber-400'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="scenario"
                  checked={scenario === 'partial_paid'}
                  onChange={() => {}}
                  className="mt-1 text-amber-600 focus:ring-amber-500"
                />
                <div>
                  <strong className="text-xs text-slate-900 block">
                    Scenario 2: Partial Payment Event ($150.00 Due Remaining)
                  </strong>
                  <span className="text-[11px] text-slate-500">
                    PayPal event arrives, but re-fetch detects due balance remains. Status remains SENT/OVERDUE.
                  </span>
                </div>
              </label>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
              {error}
            </div>
          )}

          {result && (
            <div className="p-3.5 bg-slate-900 text-slate-100 rounded-xl text-xs font-mono space-y-1">
              <div className="text-emerald-400 font-bold mb-1 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                Webhook Processed: {result.status || 'SUCCESS'}
              </div>
              <div>Result Message: {result.message}</div>
              <div>Invoice Status: <span className="text-yellow-300 font-bold">{result.invoiceStatus || result.currentStatus}</span></div>
              <div>Verified Status: {result.verifiedStatus}</div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleSimulate}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-md shadow-emerald-500/20 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Dispatching Webhook...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span>Fire Webhook Event</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
