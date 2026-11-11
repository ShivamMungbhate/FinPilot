'use client';

import React from 'react';
import { InvoiceStatus, Invoice } from '../lib/types';
import { Check, CircleDot, ArrowRight, ShieldAlert, Sparkles, Send, CreditCard } from 'lucide-react';

interface Props {
  invoice: Invoice;
}

export function StateStepper({ invoice }: Props) {
  const currentStatus = invoice.status;

  const steps = [
    {
      id: 'PROPOSED',
      label: '1. AI Proposal',
      desc: 'Extracted from plain text',
      icon: Sparkles
    },
    {
      id: 'APPROVED',
      label: '2. Freelancer Approval',
      desc: 'Explicit user authorization',
      icon: Check
    },
    {
      id: 'CREATED',
      label: '3. PayPal Draft',
      desc: 'Generated on PayPal API',
      icon: CreditCard
    },
    {
      id: 'SENT',
      label: '4. Dispatched',
      desc: 'Sent to client via email',
      icon: Send
    },
    {
      id: currentStatus === 'OVERDUE' ? 'OVERDUE' : 'PAID',
      label: currentStatus === 'OVERDUE' ? '5. Overdue' : '5. Paid & Verified',
      desc: currentStatus === 'OVERDUE' ? 'Due date elapsed' : 'Confirmed via Webhook & API',
      icon: currentStatus === 'OVERDUE' ? ShieldAlert : Check
    }
  ];

  const stateOrder: Record<InvoiceStatus, number> = {
    PROPOSED: 1,
    APPROVED: 2,
    CREATED: 3,
    SENT: 4,
    OVERDUE: 5,
    PAID: 5,
    CANCELLED: -1
  };

  const currentStepNum = stateOrder[currentStatus] || 1;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">
            Lifecycle State Machine
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Strict transitions governed by billing policies. No dispatch without explicit approval.
          </p>
        </div>
        <div className="text-xs font-mono px-2.5 py-1 bg-slate-100 text-slate-700 rounded-md border border-slate-200">
          State: <strong className="text-blue-600">{currentStatus}</strong>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 relative mt-6">
        {steps.map((step, idx) => {
          const stepNum = idx + 1;
          const isCompleted = stepNum < currentStepNum || (stepNum === 5 && currentStatus === 'PAID');
          const isCurrent = stepNum === currentStepNum && !(stepNum === 5 && currentStatus === 'PAID');
          const isOverdue = step.id === 'OVERDUE' && currentStatus === 'OVERDUE';
          const Icon = step.icon;

          return (
            <div
              key={step.id}
              className={`relative flex flex-col p-4 rounded-xl border transition-all ${
                isCurrent
                  ? isOverdue
                    ? 'border-rose-400 bg-rose-50/70 shadow-sm ring-2 ring-rose-200'
                    : 'border-blue-400 bg-blue-50/70 shadow-sm ring-2 ring-blue-200'
                  : isCompleted
                  ? 'border-emerald-200 bg-emerald-50/30'
                  : 'border-slate-200 bg-slate-50/60 opacity-60'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
                    isCurrent
                      ? isOverdue
                        ? 'bg-rose-600 text-white'
                        : 'bg-blue-600 text-white'
                      : isCompleted
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {isCompleted ? <Check className="w-4 h-4 stroke-[3]" /> : stepNum}
                </div>
                {idx < 4 && (
                  <ArrowRight className="hidden sm:block absolute -right-2 top-8 z-10 w-4 h-4 text-slate-300" />
                )}
              </div>

              <div className="text-sm font-semibold text-slate-900 mt-1">{step.label}</div>
              <div className="text-xs text-slate-500 mt-0.5 leading-snug">{step.desc}</div>

              {/* Timestamp tags */}
              {step.id === 'APPROVED' && invoice.approvedAt && (
                <div className="mt-2 text-[10px] text-emerald-700 bg-emerald-100/70 px-1.5 py-0.5 rounded w-fit font-mono">
                  {new Date(invoice.approvedAt).toLocaleDateString()}
                </div>
              )}
              {step.id === 'SENT' && invoice.sentAt && (
                <div className="mt-2 text-[10px] text-sky-700 bg-sky-100/70 px-1.5 py-0.5 rounded w-fit font-mono">
                  {new Date(invoice.sentAt).toLocaleDateString()}
                </div>
              )}
              {step.id === 'PAID' && invoice.paidAt && (
                <div className="mt-2 text-[10px] text-emerald-700 bg-emerald-100/70 px-1.5 py-0.5 rounded w-fit font-mono">
                  {new Date(invoice.paidAt).toLocaleDateString()}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
