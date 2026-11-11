'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../lib/api';
import { Sparkles, X, Loader2, AlertCircle, ArrowRight, Lightbulb } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

export function PromptModal({ isOpen, onClose, onCreated }: Props) {
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const samplePrompts = [
    {
      title: 'Standard Retainer',
      text: 'Invoice John at Horizon Media (finance@horizonmedia.co) $1,200 for monthly SEO audit & copywriting retainer, due in 14 days. Net 14 terms.'
    },
    {
      title: 'Hourly Dev Work',
      text: 'Bill NexaTech (payables@nexatech.io) $2,250 for React Native & FastAPI mobile architecture (30 hrs @ $75/hr), due next Friday.'
    },
    {
      title: 'High-Value Project (Triggers Policy)',
      text: 'Invoice Global Enterprise Corp (invoicing@globalent.com) $15,000 for full cloud infrastructure migration, due in 30 days.'
    }
  ];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const result = await api.parsePrompt(prompt);
      onClose();
      if (onCreated) onCreated();
      router.push(`/invoices/${result.invoice.id}`);
    } catch (err: any) {
      setError(err.message || 'Unable to draft invoice proposal. Please check your request and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-100 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-xl backdrop-blur-md">
              <Sparkles className="w-5 h-5 text-blue-100" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Draft Invoice with Natural Language</h2>
              <p className="text-xs text-blue-100 mt-0.5">
                Type what you worked on, the client name, email, and rate. FinPilot will automatically structure the invoice.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-blue-100 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6">
          {error && (
            <div className="mb-4 p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 text-sm text-rose-700">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-500" />
              <div>
                <strong>Unable to generate proposal:</strong> {error}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              Your Plain-Text Invoice Request
            </label>
            <textarea
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Invoice John at Acme Studio (billing@acmestudio.com) $1,500 for landing page redesign and brand tokens, due next Friday."
              className="w-full px-4 py-3 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900 placeholder-slate-400 font-normal leading-relaxed"
              required
            />
          </div>

          {/* Quick sample chips */}
          <div className="mt-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 mb-2">
              <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
              <span>Or try a quick sample:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {samplePrompts.map((s, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setPrompt(s.text)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-left transition-colors"
                >
                  {s.title}
                </button>
              ))}
            </div>
          </div>

          {/* Policy rule notice */}
          <div className="mt-5 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center justify-between">
            <span>
              🛡️ Evaluated automatically against: <strong>Max Limit ($10,000)</strong> & <strong>Duplicate Check (24h)</strong>
            </span>
          </div>

          {/* Footer actions */}
          <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !prompt.trim()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold shadow-md shadow-blue-500/20 transition-all"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Structuring Proposal...</span>
                </>
              ) : (
                <>
                  <span>Generate Proposal</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
