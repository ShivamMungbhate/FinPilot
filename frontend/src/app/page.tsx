'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Invoice, InvoiceStatus } from '../lib/types';
import { api } from '../lib/api';
import { Navbar } from '../components/Navbar';
import { StatusBadge } from '../components/StatusBadge';
import { PromptModal } from '../components/PromptModal';
import {
  Sparkles,
  Receipt,
  Search,
  Filter,
  DollarSign,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowUpRight,
  RefreshCw,
  Plus
} from 'lucide-react';

export default function DashboardPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [isPromptOpen, setIsPromptOpen] = useState(false);

  async function loadInvoices() {
    setLoading(true);
    try {
      const data = await api.listInvoices(selectedStatus, search);
      setInvoices(data.invoices);
    } catch (err) {
      console.error('Failed to load invoices:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadInvoices();
  }, [selectedStatus]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    loadInvoices();
  }

  // Calculate summary metrics
  const totalBilled = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
  const totalPaid = invoices.filter(i => i.status === 'PAID').reduce((sum, inv) => sum + inv.totalAmount, 0);
  const totalOverdue = invoices.filter(i => i.status === 'OVERDUE').reduce((sum, inv) => sum + inv.totalAmount, 0);
  const pendingCount = invoices.filter(i => ['PROPOSED', 'APPROVED', 'CREATED', 'SENT'].includes(i.status)).length;

  const statusTabs = [
    { id: 'ALL', label: 'All Invoices' },
    { id: 'PROPOSED', label: 'Proposed (Draft)' },
    { id: 'APPROVED', label: 'Approved' },
    { id: 'CREATED', label: 'Created' },
    { id: 'SENT', label: 'Sent' },
    { id: 'PAID', label: 'Paid' },
    { id: 'OVERDUE', label: 'Overdue' },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar onOpenPrompt={() => setIsPromptOpen(true)} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full flex-1">
        {/* Hero Banner */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-700 via-indigo-700 to-purple-800 p-8 sm:p-10 text-white shadow-xl shadow-blue-900/10 mb-8">
          <div className="relative z-10 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-xs font-semibold text-blue-100 mb-4 border border-white/20">
              <Sparkles className="w-3.5 h-3.5 text-blue-200" />
              <span>AI-Assisted & Policy-Governed PayPal Invoicing</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Type plain text. Review proposal. FinPilot handles PayPal.
            </h1>
            <p className="mt-3 text-sm sm:text-base text-blue-100/90 leading-relaxed">
              Strict state machine enforcement: nothing is sent without your explicit approval. 
              Protected with real-time policy limits, duplicate detection, and verified PayPal webhooks.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                onClick={() => setIsPromptOpen(true)}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white text-blue-700 hover:bg-blue-50 text-sm font-bold shadow-lg shadow-black/10 active:scale-95 transition-all"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>Create Invoice with AI</span>
              </button>
              <Link
                href="/policy"
                className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-semibold border border-white/20 backdrop-blur-sm transition-all"
              >
                <span>View Policy Limits</span>
              </Link>
            </div>
          </div>
          {/* Decorative shapes */}
          <div className="absolute right-0 top-0 -mt-10 -mr-10 w-96 h-96 rounded-full bg-white/5 blur-3xl pointer-events-none"></div>
        </div>

        {/* Financial Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase">Total Billed</span>
              <div className="text-2xl font-bold text-slate-900 mt-1 font-mono">
                ${totalBilled.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <span className="text-xs text-slate-400 mt-0.5 block">{invoices.length} invoices total</span>
            </div>
            <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
              <Receipt className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase">Verified Paid</span>
              <div className="text-2xl font-bold text-emerald-600 mt-1 font-mono">
                ${totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <span className="text-xs text-slate-400 mt-0.5 block">Via PayPal re-fetch confirmation</span>
            </div>
            <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase">Overdue Amount</span>
              <div className="text-2xl font-bold text-rose-600 mt-1 font-mono">
                ${totalOverdue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <span className="text-xs text-slate-400 mt-0.5 block">Eligible for AI reminders</span>
            </div>
            <div className="p-3 bg-rose-50 rounded-xl text-rose-600">
              <AlertCircle className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase">Awaiting Action</span>
              <div className="text-2xl font-bold text-indigo-600 mt-1 font-mono">
                {pendingCount}
              </div>
              <span className="text-xs text-slate-400 mt-0.5 block">Pending review, creation or payment</span>
            </div>
            <div className="p-3 bg-indigo-50 rounded-xl text-indigo-600">
              <Clock className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Filter Tabs & Search Bar */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-6 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            {/* Status Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 scrollbar-none">
              {statusTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSelectedStatus(tab.id)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-xl whitespace-nowrap transition-colors ${
                    selectedStatus === tab.id
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <form onSubmit={handleSearch} className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search invoice #, client, email..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 w-64 text-slate-800"
                />
              </div>
              <button
                type="button"
                onClick={loadInvoices}
                className="p-2 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors"
                title="Refresh list"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>

        {/* Invoices List Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-slate-500 text-sm">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-600 mb-2" />
              Loading invoices...
            </div>
          ) : invoices.length === 0 ? (
            <div className="p-16 text-center">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400 mb-3">
                <Receipt className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-800">No invoices match your filter</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Type your first freelance request to generate a structured invoice proposal.
              </p>
              <button
                onClick={() => setIsPromptOpen(true)}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Create Invoice</span>
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="py-3.5 px-4">Invoice #</th>
                    <th className="py-3.5 px-4">Recipient</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4">Amount</th>
                    <th className="py-3.5 px-4">Due Date</th>
                    <th className="py-3.5 px-4">PayPal Ref</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50/80 transition-colors group">
                      <td className="py-4 px-4 font-mono font-bold text-slate-900">
                        <Link href={`/invoices/${inv.id}`} className="hover:text-blue-600 flex items-center gap-1">
                          <span>{inv.invoiceNumber}</span>
                          <ArrowUpRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </Link>
                      </td>
                      <td className="py-4 px-4">
                        <div className="font-semibold text-slate-900">{inv.recipientName}</div>
                        <div className="text-slate-500 text-[11px] font-mono">{inv.recipientEmail}</div>
                      </td>
                      <td className="py-4 px-4">
                        <StatusBadge status={inv.status} />
                      </td>
                      <td className="py-4 px-4 font-mono font-bold text-slate-900">
                        ${inv.totalAmount.toFixed(2)} <span className="text-[10px] text-slate-500 font-normal">{inv.currency}</span>
                      </td>
                      <td className="py-4 px-4 text-slate-600 font-mono">
                        {new Date(inv.dueDate).toLocaleDateString()}
                      </td>
                      <td className="py-4 px-4">
                        {inv.paypalInvoiceId ? (
                          <span className="font-mono text-[11px] bg-slate-100 px-2 py-0.5 rounded text-slate-700 border border-slate-200">
                            {inv.paypalInvoiceId}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">Not created</span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-right">
                        <Link
                          href={`/invoices/${inv.id}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold transition-colors"
                        >
                          <span>Manage</span>
                          <ArrowUpRight className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <PromptModal
        isOpen={isPromptOpen}
        onClose={() => setIsPromptOpen(false)}
        onCreated={loadInvoices}
      />
    </div>
  );
}
