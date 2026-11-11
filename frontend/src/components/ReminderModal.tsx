'use client';

import React, { useState } from 'react';
import { Invoice } from '../lib/types';
import { api } from '../lib/api';
import { Bell, X, Send, Loader2, AlertCircle, Sparkles, Clock, CheckCircle } from 'lucide-react';

interface Props {
  invoice: Invoice;
  isOpen: boolean;
  onClose: () => void;
  onSent: (updated: Invoice) => void;
}

export function ReminderModal({ invoice, isOpen, onClose, onSent }: Props) {
  const [tone, setTone] = useState<'gentle' | 'firm' | 'urgent'>('gentle');
  const [customNote, setCustomNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentCount = invoice.reminderCount || 0;
  const maxReminders = 3; // default policy
  const daysOverdue = Math.max(0, Math.floor((Date.now() - new Date(invoice.dueDate).getTime()) / (1000 * 60 * 60 * 24)));

  async function handleSendReminder(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await api.sendReminder(invoice.id, tone, customNote || undefined);
      setSuccess('Reminder successfully sent via PayPal!');
      setTimeout(() => {
        onSent(res.invoice);
        onClose();
      }, 1200);
    } catch (err: any) {
      setError(err.message || 'Failed to dispatch reminder');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-100 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-600 px-6 py-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-xl backdrop-blur-md">
              <Bell className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Send Payment Reminder</h2>
              <p className="text-xs text-orange-100 mt-0.5">
                AI drafts personalized copy & sends through PayPal Invoicing API
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-orange-100 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSendReminder} className="p-6 space-y-4">
          {error && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
              <div>
                <strong>Policy Rejection:</strong> {error}
              </div>
            </div>
          )}

          {success && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-xs text-emerald-700">
              <CheckCircle className="w-4 h-4 text-emerald-600" />
              <span>{success}</span>
            </div>
          )}

          {/* Quota & Cooldown info */}
          <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
            <div>
              <span className="text-slate-500 block">Reminder Quota:</span>
              <strong className="text-slate-800 font-mono">
                {currentCount} of {maxReminders} used
              </strong>
            </div>
            <div>
              <span className="text-slate-500 block">Status / Due Date:</span>
              <strong className={daysOverdue > 0 ? 'text-rose-600' : 'text-slate-800'}>
                {daysOverdue > 0 ? `${daysOverdue} days overdue` : 'Due soon'}
              </strong>
            </div>
          </div>

          {/* Tone Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              Select AI Reminder Tone
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['gentle', 'firm', 'urgent'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTone(t)}
                  className={`py-2 px-3 text-xs font-semibold rounded-xl border capitalize transition-all ${
                    tone === t
                      ? 'bg-orange-50 border-orange-400 text-orange-800 shadow-sm'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {t === 'urgent' ? '🚨 Urgent / Final' : t === 'firm' ? '⚡ Firm' : '🌿 Friendly'}
                </button>
              ))}
            </div>
          </div>

          {/* Preview Copy */}
          <div className="p-3.5 rounded-xl bg-slate-100 border border-slate-200 text-xs text-slate-700 font-mono">
            <div className="text-[10px] text-slate-400 uppercase font-semibold mb-1">
              Live AI Preview ({tone} tone):
            </div>
            <p className="line-clamp-4 leading-relaxed">
              {tone === 'gentle'
                ? `Hi ${invoice.recipientName}, friendly reminder that invoice #${invoice.invoiceNumber} ($${invoice.totalAmount.toFixed(2)} ${invoice.currency}) was due on ${invoice.dueDate.split('T')[0]}. Please let me know if you have any questions!`
                : tone === 'firm'
                ? `Dear ${invoice.recipientName}, invoice #${invoice.invoiceNumber} for $${invoice.totalAmount.toFixed(2)} is past due. Please settle via the PayPal invoice link at your earliest convenience.`
                : `URGENT NOTICE TO ${invoice.recipientName}: Invoice #${invoice.invoiceNumber} is critically overdue. Please remit $${invoice.totalAmount.toFixed(2)} immediately to avoid service interruption.`}
            </p>
          </div>

          {/* Custom Note Override */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Custom Addendum / Note (Optional)
            </label>
            <textarea
              rows={2}
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              placeholder="Add any specific personal message or bank transfer detail..."
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-orange-500"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || currentCount >= maxReminders}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-xs font-semibold shadow-md shadow-orange-500/20"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Dispatching...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Send via PayPal</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
