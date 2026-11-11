'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '../../lib/api';
import { AuditLog } from '../../lib/types';
import { Navbar } from '../../components/Navbar';
import {
  History,
  Search,
  Filter,
  RefreshCw,
  User,
  Shield,
  Bot,
  Globe,
  ExternalLink,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function loadLogs() {
    setLoading(true);
    try {
      const data = await api.getAuditLogs(undefined, actionFilter || undefined, 100);
      setLogs(data.logs);
      setTotal(data.total);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLogs();
  }, [actionFilter]);

  const actions = [
    '',
    'INVOICE_PROPOSED',
    'INVOICE_PROPOSAL_EDITED',
    'POLICY_EVALUATED',
    'INVOICE_APPROVED',
    'PAYPAL_DRAFT_CREATED',
    'INVOICE_SENT',
    'REMINDER_SENT',
    'WEBHOOK_PAID_RECEIVED',
    'INVOICE_PAID',
    'POLICY_CONFIG_UPDATED'
  ];

  const getActorBadge = (actor: string) => {
    switch (actor) {
      case 'FREELANCER':
        return { label: 'Freelancer', bg: 'bg-blue-50 text-blue-700 border-blue-200', icon: User };
      case 'POLICY_ENGINE':
        return { label: 'Policy Engine', bg: 'bg-purple-50 text-purple-700 border-purple-200', icon: Shield };
      case 'PAYPAL_WEBHOOK':
        return { label: 'PayPal Webhook', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: Globe };
      default:
        return { label: 'System', bg: 'bg-slate-100 text-slate-700 border-slate-200', icon: Bot };
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 pb-16">
      <Navbar />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl">
                <History className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">System Audit Trail</h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Append-only, immutable activity log tracking every proposal, approval, state change, and PayPal transaction
                </p>
              </div>
            </div>
          </div>

          {/* Action Filter */}
          <div className="flex items-center gap-2">
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Actions ({total})</option>
              {actions.filter(Boolean).map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>

            <button
              onClick={loadLogs}
              className="p-2 bg-white rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-50"
              title="Refresh logs"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Logs List Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-slate-500 text-sm">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-600 mb-2" />
              Loading audit records...
            </div>
          ) : logs.length === 0 ? (
            <div className="p-16 text-center text-slate-500 text-xs">
              No audit logs found for the selected filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="py-3.5 px-6">Timestamp</th>
                    <th className="py-3.5 px-4">Action</th>
                    <th className="py-3.5 px-4">Actor</th>
                    <th className="py-3.5 px-4">Associated Invoice</th>
                    <th className="py-3.5 px-6 text-right">Context Payload</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map((log) => {
                    const actorInfo = getActorBadge(log.actor);
                    const ActorIcon = actorInfo.icon;
                    const isExpanded = expandedId === log.id;

                    return (
                      <React.Fragment key={log.id}>
                        <tr className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-4 px-6 font-mono text-slate-600 text-[11px] whitespace-nowrap">
                            {new Date(log.createdAt).toLocaleString()}
                          </td>
                          <td className="py-4 px-4 font-mono font-bold text-slate-900">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span>{log.action}</span>
                              {(log.action.includes('SIMULATION') ||
                                (typeof log.details === 'object' && log.details?.simulated) ||
                                (typeof log.details === 'string' && log.details.includes('"simulated":true'))) && (
                                <span className="inline-flex items-center text-[10px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">
                                  SIMULATED
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${actorInfo.bg}`}>
                              <ActorIcon className="w-3 h-3" />
                              {actorInfo.label}
                            </span>
                          </td>
                          <td className="py-4 px-4 font-mono">
                            {log.invoiceId ? (
                              <Link
                                href={`/invoices/${log.invoiceId}`}
                                className="text-blue-600 hover:underline inline-flex items-center gap-1 font-bold"
                              >
                                <span>{log.invoice?.invoiceNumber || log.invoiceId.substring(0, 8)}</span>
                                <ExternalLink className="w-3 h-3" />
                              </Link>
                            ) : (
                              <span className="text-slate-400 italic">System Global</span>
                            )}
                          </td>
                          <td className="py-4 px-6 text-right">
                            {log.details ? (
                              <button
                                type="button"
                                onClick={() => setExpandedId(isExpanded ? null : log.id)}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg transition-colors"
                              >
                                <span>{isExpanded ? 'Hide' : 'Inspect'}</span>
                                {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              </button>
                            ) : (
                              <span className="text-slate-300">&mdash;</span>
                            )}
                          </td>
                        </tr>

                        {isExpanded && log.details && (
                          <tr className="bg-slate-900">
                            <td colSpan={5} className="p-4">
                              <pre className="text-slate-200 text-xs font-mono overflow-x-auto max-h-64 leading-relaxed">
                                {typeof log.details === 'string'
                                  ? log.details
                                  : JSON.stringify(log.details, null, 2)}
                              </pre>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
