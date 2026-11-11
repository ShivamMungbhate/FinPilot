'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Invoice, PolicyCheckResult } from '../../../lib/types';
import { api } from '../../../lib/api';
import { Navbar } from '../../../components/Navbar';
import { StatusBadge } from '../../../components/StatusBadge';
import { StateStepper } from '../../../components/StateStepper';
import { ProposalEditorModal } from '../../../components/ProposalEditorModal';
import { ReminderModal } from '../../../components/ReminderModal';
import { WebhookSimulatorModal } from '../../../components/WebhookSimulatorModal';
import { AuditTimeline } from '../../../components/AuditTimeline';
import {
  ArrowLeft,
  CheckCircle2,
  CloudUpload,
  Send,
  Bell,
  RefreshCw,
  ExternalLink,
  Edit,
  AlertTriangle,
  ShieldCheck,
  Sparkles,
  DollarSign,
  FileText,
  Loader2,
  Calendar,
  Mail,
  User,
  ShieldAlert,
  Play
} from 'lucide-react';

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [policy, setPolicy] = useState<PolicyCheckResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overrideWarnings, setOverrideWarnings] = useState(false);

  // Modals
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isReminderOpen, setIsReminderOpen] = useState(false);
  const [isWebhookOpen, setIsWebhookOpen] = useState(false);
  const [enablePaymentSimulation, setEnablePaymentSimulation] = useState(false);

  useEffect(() => {
    api.getAuthConfig().then((cfg) => {
      setEnablePaymentSimulation(Boolean(cfg.enablePaymentSimulation));
    }).catch(() => {});
  }, []);

  async function loadInvoiceDetails() {
    if (!id) return;
    setLoading(true);
    try {
      const data = await api.getInvoice(id);
      setInvoice(data.invoice);
      setPolicy(data.policy);
    } catch (err: any) {
      setError(err.message || 'Failed to load invoice');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadInvoiceDetails();
  }, [id]);

  // State Machine Action Handlers

  // 1. Explicit Approval: PROPOSED -> APPROVED
  async function handleApprove() {
    if (!invoice) return;
    setActionLoading(true);
    setError(null);
    try {
      const res = await api.approveInvoice(invoice.id, overrideWarnings);
      await loadInvoiceDetails();
    } catch (err: any) {
      setError(err.message || 'Approval blocked by policy engine');
    } finally {
      setActionLoading(false);
    }
  }

  // 2. PayPal Draft Creation: APPROVED -> CREATED
  async function handleCreatePayPalDraft() {
    if (!invoice) return;
    setActionLoading(true);
    setError(null);
    try {
      await api.createPayPalDraft(invoice.id);
      await loadInvoiceDetails();
    } catch (err: any) {
      setError(err.message || 'Failed to create PayPal draft invoice');
    } finally {
      setActionLoading(false);
    }
  }

  // 3. Dispatch to Client: CREATED -> SENT
  async function handleSendInvoice() {
    if (!invoice) return;
    setActionLoading(true);
    setError(null);
    try {
      await api.sendInvoice(invoice.id);
      await loadInvoiceDetails();
    } catch (err: any) {
      setError(err.message || 'Failed to dispatch invoice via PayPal');
    } finally {
      setActionLoading(false);
    }
  }

  // 4. Live Sync with PayPal API
  async function handleSyncWithPayPal() {
    if (!invoice) return;
    setActionLoading(true);
    setError(null);
    try {
      await api.syncInvoice(invoice.id);
      await loadInvoiceDetails();
    } catch (err: any) {
      setError(err.message || 'Failed to sync with PayPal');
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50">
        <Navbar />
        <div className="max-w-xl mx-auto my-20 p-8 bg-white rounded-2xl border border-slate-200 text-center">
          <h2 className="text-lg font-bold text-slate-800">Invoice not found</h2>
          <p className="text-xs text-slate-500 mt-2">The requested invoice ID does not exist.</p>
          <Link href="/" className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-blue-600">
            <ArrowLeft className="w-4 h-4" /> Back to Invoices
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 pb-16">
      <Navbar />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-6">
        {/* Top Navigation & Invoice ID Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 bg-white rounded-xl border border-slate-200 text-slate-600 hover:text-slate-900 shadow-sm transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold font-mono text-slate-900">{invoice.invoiceNumber}</h1>
                <StatusBadge status={invoice.status} size="lg" />
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Billed to <strong className="text-slate-700">{invoice.recipientName}</strong> &bull; Created{' '}
                {new Date(invoice.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>

          {/* External links */}
          <div className="flex items-center gap-2">
            {invoice.paypalPaymentUrl && (
              <a
                href={invoice.paypalPaymentUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold shadow-sm transition-colors"
              >
                <span>PayPal Payer View</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
              </a>
            )}

            {invoice.paypalInvoiceId && (
              <button
                type="button"
                onClick={handleSyncWithPayPal}
                disabled={actionLoading}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
                title="Re-query PayPal API for status changes"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${actionLoading ? 'animate-spin' : ''}`} />
                <span>Sync with PayPal</span>
              </button>
            )}
          </div>
        </div>

        {/* Global error banner */}
        {error && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3 text-xs text-rose-800">
            <AlertTriangle className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
            <div className="flex-1">
              <strong>Action Blocked:</strong> {error}
            </div>
          </div>
        )}

        {/* State Machine Stepper */}
        <StateStepper invoice={invoice} />

        {/* Action Bar based on State Machine */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Current Required Workflow Step
              </span>
              <div className="text-base font-bold text-slate-900 mt-0.5">
                {invoice.status === 'PROPOSED' && 'Review AI Draft & Provide Explicit Approval'}
                {invoice.status === 'APPROVED' && 'Generate Official PayPal Invoice Draft'}
                {invoice.status === 'CREATED' && 'Dispatch Invoice to Client via PayPal Email'}
                {invoice.status === 'SENT' && 'Invoice Dispatched - Track Payment or Send Reminders'}
                {invoice.status === 'OVERDUE' && 'Invoice Past Due - Eligible for Automated Reminders'}
                {invoice.status === 'PAID' && 'Invoice Fully Settled & Verified via PayPal'}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {invoice.status === 'PROPOSED' &&
                  'Review details below, edit if needed, and confirm explicit approval.'}
                {invoice.status === 'APPROVED' &&
                  'You authorized this invoice. Click to generate the official PayPal invoice draft.'}
                {invoice.status === 'CREATED' &&
                  'PayPal invoice draft created. Nothing is emailed to the client until you click Send below.'}
                {invoice.status === 'SENT' &&
                  'Client has received the invoice link. The webhook will automatically verify settlement when paid.'}
                {invoice.status === 'OVERDUE' &&
                  'The due date elapsed without payment. You can dispatch polite or firm reminders within policy limits.'}
                {invoice.status === 'PAID' &&
                  'Confirmed settlement: PayPal returned status PAID and confirmed $0.00 outstanding balance.'}
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-3">
              {/* State: PROPOSED actions */}
              {invoice.status === 'PROPOSED' && (
                <>
                  <button
                    type="button"
                    onClick={() => setIsEditorOpen(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold transition-colors"
                  >
                    <Edit className="w-3.5 h-3.5" />
                    <span>Edit Proposal</span>
                  </button>

                  <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2">
                    {policy && !policy.allowed && (
                      <label className="flex items-center gap-1.5 text-xs text-amber-700 font-semibold cursor-pointer">
                        <input
                          type="checkbox"
                          checked={overrideWarnings}
                          onChange={(e) => setOverrideWarnings(e.target.checked)}
                          className="rounded text-amber-600 focus:ring-amber-500"
                        />
                        <span>Acknowledge Policy Warning & Override</span>
                      </label>
                    )}

                    <button
                      type="button"
                      onClick={handleApprove}
                      disabled={Boolean(actionLoading || (policy && !policy.allowed && !overrideWarnings))}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition-all"
                    >
                      {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      <span>Approve Invoice Proposal</span>
                    </button>
                  </div>
                </>
              )}

              {/* State: APPROVED actions */}
              {invoice.status === 'APPROVED' && (
                <button
                  type="button"
                  onClick={handleCreatePayPalDraft}
                  disabled={actionLoading}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-500/20 disabled:opacity-50 transition-all"
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />}
                  <span>Create PayPal Invoice Draft</span>
                </button>
              )}

              {/* State: CREATED actions */}
              {invoice.status === 'CREATED' && (
                <button
                  type="button"
                  onClick={handleSendInvoice}
                  disabled={actionLoading}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-500/20 disabled:opacity-50 transition-all"
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  <span>Send to Client via PayPal</span>
                </button>
              )}

              {/* State: SENT or OVERDUE actions */}
              {(invoice.status === 'SENT' || invoice.status === 'OVERDUE') && (
                <>
                  <button
                    type="button"
                    onClick={() => setIsReminderOpen(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 text-xs font-semibold shadow-sm transition-colors"
                  >
                    <Bell className="w-3.5 h-3.5" />
                    <span>Send AI Reminder ({invoice.reminderCount}/3)</span>
                  </button>

                  {enablePaymentSimulation && (
                    <button
                      type="button"
                      onClick={() => setIsWebhookOpen(true)}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-500/20 transition-all"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Simulate Webhook & Re-fetch</span>
                    </button>
                  )}
                </>
              )}

              {/* State: PAID badge */}
              {invoice.status === 'PAID' && (
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Settlement Confirmed on {invoice.paidAt ? new Date(invoice.paidAt).toLocaleDateString() : 'PayPal'}</span>
                  {invoice.auditLogs?.some((l) => (typeof l.details === 'object' && l.details?.simulated) || l.action === 'WEBHOOK_SIMULATION_TRIGGERED') && (
                    <span className="ml-1 text-[10px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">
                      SIMULATED
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Policy Engine Evaluation Banner */}
        {policy && (
          <div
            className={`rounded-2xl border p-5 ${
              policy.allowed
                ? 'bg-emerald-50/60 border-emerald-200'
                : 'bg-amber-50/80 border-amber-300'
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`p-2 rounded-xl ${
                  policy.allowed ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'
                }`}
              >
                {policy.allowed ? <ShieldCheck className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    Policy Engine Evaluation: {policy.allowed ? 'Passed (Compliant)' : 'Policy Flag Triggered'}
                  </h4>
                  <span className="text-[11px] font-mono text-slate-500">
                    Max: ${policy.policySnapshot.maxAmountLimit.toLocaleString()} | Duplicate Window:{' '}
                    {policy.policySnapshot.duplicateWindowHours}h
                  </span>
                </div>

                {policy.allowed ? (
                  <p className="text-xs text-emerald-800 mt-1">
                    Invoice complies with all policy constraints: Amount is within the permitted limit and no duplicate
                    active invoices to {invoice.recipientEmail} were identified within {policy.policySnapshot.duplicateWindowHours} hours.
                  </p>
                ) : (
                  <div className="mt-2 space-y-1">
                    {policy.violations.map((violation, idx) => (
                      <div key={idx} className="text-xs text-amber-900 font-medium flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
                        <span>{violation}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Two-Column Grid: Invoice Summary & Metadata */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Cols: Items & Invoice Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Line Items Card */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-600" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Line Items & Deliverables</h3>
                </div>
                <span className="text-xs font-mono font-semibold text-slate-600">
                  {invoice.items.length} item{invoice.items.length === 1 ? '' : 's'}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/60 border-b border-slate-100 text-slate-500 font-semibold uppercase">
                    <tr>
                      <th className="py-3 px-6">Description</th>
                      <th className="py-3 px-4 text-center">Qty</th>
                      <th className="py-3 px-4 text-right">Unit Price</th>
                      <th className="py-3 px-6 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {invoice.items.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="py-3.5 px-6">
                          <div className="font-semibold text-slate-900">{item.name}</div>
                          {item.description && (
                            <div className="text-slate-500 text-[11px] mt-0.5">{item.description}</div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono text-slate-700">{item.quantity}</td>
                        <td className="py-3.5 px-4 text-right font-mono text-slate-700">
                          ${item.unitPrice.toFixed(2)}
                        </td>
                        <td className="py-3.5 px-6 text-right font-mono font-bold text-slate-900">
                          ${item.total.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals Section */}
              <div className="p-6 bg-slate-50 border-t border-slate-200 flex flex-col items-end space-y-1">
                <div className="flex items-center justify-between w-64 text-xs text-slate-600">
                  <span>Subtotal:</span>
                  <span className="font-mono">${invoice.totalAmount.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between w-64 text-xs text-slate-600">
                  <span>Estimated Tax:</span>
                  <span className="font-mono">$0.00</span>
                </div>
                <div className="flex items-center justify-between w-64 text-base font-bold text-slate-900 pt-2 border-t border-slate-200">
                  <span>Total Due:</span>
                  <span className="font-mono text-blue-600">
                    ${invoice.totalAmount.toFixed(2)} {invoice.currency}
                  </span>
                </div>
              </div>
            </div>

            {/* Natural Language Prompt Preview */}
            {invoice.rawPrompt && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-purple-600" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Original Plain-Text Freelancer Prompt
                  </h3>
                  {invoice.confidenceScore && (
                    <span className="ml-auto text-[11px] font-mono px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                      AI Confidence: {(invoice.confidenceScore * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
                <p className="text-xs font-mono text-slate-700 bg-slate-50 p-3.5 rounded-xl border border-slate-200 leading-relaxed italic">
                  "{invoice.rawPrompt}"
                </p>
                {invoice.notes && (
                  <div className="mt-3 text-xs text-slate-600">
                    <strong>Invoice Note:</strong> {invoice.notes}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Col: Client Metadata & PayPal IDs */}
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b border-slate-100 pb-2">
                Client & Terms
              </h3>

              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-slate-400 block mb-0.5">Recipient Name</span>
                  <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    <span>{invoice.recipientName}</span>
                  </div>
                </div>

                <div>
                  <span className="text-slate-400 block mb-0.5">Email Address</span>
                  <div className="font-mono text-slate-700 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    <span>{invoice.recipientEmail}</span>
                  </div>
                </div>

                <div>
                  <span className="text-slate-400 block mb-0.5">Payment Due Date</span>
                  <div className="font-mono text-slate-700 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>{new Date(invoice.dueDate).toLocaleDateString()}</span>
                  </div>
                </div>

                <div>
                  <span className="text-slate-400 block mb-0.5">Currency</span>
                  <div className="font-mono text-slate-700 font-bold">{invoice.currency}</div>
                </div>
              </div>

              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b border-slate-100 pt-4 pb-2">
                PayPal Integration
              </h3>

              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-slate-400 block mb-0.5">PayPal Invoice ID</span>
                  {invoice.paypalInvoiceId ? (
                    <div className="font-mono text-blue-700 bg-blue-50 px-2 py-1 rounded border border-blue-200 break-all">
                      {invoice.paypalInvoiceId}
                    </div>
                  ) : (
                    <span className="text-slate-400 italic">Not created yet</span>
                  )}
                </div>

                <div>
                  <span className="text-slate-400 block mb-0.5">PayPal Status</span>
                  <div className="font-mono text-slate-800 font-semibold">
                    {invoice.paypalStatus || 'DRAFT (Local)'}
                  </div>
                </div>

                <div>
                  <span className="text-slate-400 block mb-0.5">Reminders Sent</span>
                  <div className="font-mono text-slate-800">
                    {invoice.reminderCount} of 3 dispatched
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Audit Trail Timeline */}
        <AuditTimeline logs={invoice.auditLogs || []} />
      </div>

      {/* Modals */}
      <ProposalEditorModal
        invoice={invoice}
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        onSaved={(updated) => setInvoice(updated)}
      />

      <ReminderModal
        invoice={invoice}
        isOpen={isReminderOpen}
        onClose={() => setIsReminderOpen(false)}
        onSent={(updated) => setInvoice(updated)}
      />

      <WebhookSimulatorModal
        invoice={invoice}
        isOpen={isWebhookOpen}
        onClose={() => setIsWebhookOpen(false)}
        onSuccess={loadInvoiceDetails}
      />
    </div>
  );
}
