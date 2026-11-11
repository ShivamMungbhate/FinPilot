import React from 'react';
import { InvoiceStatus } from '../lib/types';
import { FileText, CheckCircle2, CloudUpload, Send, BadgeDollarSign, AlertCircle, XCircle } from 'lucide-react';

interface Props {
  status: InvoiceStatus;
  size?: 'sm' | 'md' | 'lg';
}

export function StatusBadge({ status, size = 'md' }: Props) {
  const configs: Record<InvoiceStatus, { label: string; bg: string; text: string; border: string; icon: any }> = {
    PROPOSED: {
      label: 'Draft (Proposed)',
      bg: 'bg-slate-100',
      text: 'text-slate-700',
      border: 'border-slate-300',
      icon: FileText
    },
    APPROVED: {
      label: 'Approved',
      bg: 'bg-blue-50',
      text: 'text-blue-700',
      border: 'border-blue-200',
      icon: CheckCircle2
    },
    CREATED: {
      label: 'PayPal Draft',
      bg: 'bg-indigo-50',
      text: 'text-indigo-700',
      border: 'border-indigo-200',
      icon: CloudUpload
    },
    SENT: {
      label: 'Sent (Awaiting Payment)',
      bg: 'bg-amber-50',
      text: 'text-amber-800',
      border: 'border-amber-200',
      icon: Send
    },
    PAID: {
      label: 'Paid & Verified',
      bg: 'bg-emerald-50',
      text: 'text-emerald-700',
      border: 'border-emerald-200',
      icon: BadgeDollarSign
    },
    OVERDUE: {
      label: 'Overdue',
      bg: 'bg-rose-50',
      text: 'text-rose-700',
      border: 'border-rose-200',
      icon: AlertCircle
    },
    CANCELLED: {
      label: 'Cancelled',
      bg: 'bg-slate-100',
      text: 'text-slate-500',
      border: 'border-slate-200',
      icon: XCircle
    }
  };

  const c = configs[status] || configs.PROPOSED;
  const Icon = c.icon;

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-1 gap-1.5 font-medium',
    lg: 'text-sm px-3.5 py-1.5 gap-2 font-semibold'
  }[size];

  return (
    <span className={`inline-flex items-center rounded-full border ${c.bg} ${c.text} ${c.border} ${sizeClasses}`}>
      <Icon className={size === 'sm' ? 'w-3 h-3' : size === 'lg' ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
      {c.label}
    </span>
  );
}
