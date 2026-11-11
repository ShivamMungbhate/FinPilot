'use client';

import React, { useState } from 'react';
import { AuditLog } from '../lib/types';
import { History, Shield, User, Bot, Globe, ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  logs: AuditLog[];
}

export function AuditTimeline({ logs }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!logs || logs.length === 0) {
    return (
      <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 text-slate-500 text-sm">
        No audit log records found.
      </div>
    );
  }

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
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-6">
        <History className="w-5 h-5 text-slate-600" />
        <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">
          Immutable Audit Log Trail ({logs.length} actions)
        </h3>
      </div>

      <div className="relative border-l-2 border-slate-200 ml-3 space-y-6">
        {logs.map((log) => {
          const actorInfo = getActorBadge(log.actor);
          const ActorIcon = actorInfo.icon;
          const isExpanded = expandedId === log.id;

          return (
            <div key={log.id} className="relative pl-6 group">
              {/* Dot icon on line */}
              <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-white border-2 border-slate-400 group-hover:border-blue-600 group-hover:scale-110 transition-transform"></div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs font-bold text-slate-900">
                    {log.action}
                  </span>
                  <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${actorInfo.bg}`}>
                    <ActorIcon className="w-3 h-3" />
                    {actorInfo.label}
                  </span>
                  {(log.action.includes('SIMULATION') ||
                    (typeof log.details === 'object' && log.details?.simulated) ||
                    (typeof log.details === 'string' && log.details.includes('"simulated":true'))) && (
                    <span className="inline-flex items-center text-[10px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">
                      SIMULATED
                    </span>
                  )}
                  {log.invoice?.invoiceNumber && (
                    <span className="text-xs text-slate-500 font-mono">
                      #{log.invoice.invoiceNumber}
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-400 font-mono">
                  {new Date(log.createdAt).toLocaleString()}
                </div>
              </div>

              {/* Action details collapsible */}
              {log.details && (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : log.id)}
                    className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 transition-colors"
                  >
                    <span>{isExpanded ? 'Hide payload' : 'Inspect payload & context'}</span>
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>

                  {isExpanded && (
                    <pre className="mt-2 p-3 bg-slate-900 text-slate-200 rounded-xl text-xs font-mono overflow-x-auto max-h-56">
                      {typeof log.details === 'string'
                        ? log.details
                        : JSON.stringify(log.details, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
