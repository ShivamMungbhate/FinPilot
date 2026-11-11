'use client';

import React, { useState } from 'react';
import { Invoice, InvoiceItem } from '../lib/types';
import { api } from '../lib/api';
import { X, Plus, Trash2, Loader2, AlertCircle, Save } from 'lucide-react';

interface Props {
  invoice: Invoice;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (updated: Invoice) => void;
}

export function ProposalEditorModal({ invoice, isOpen, onClose, onSaved }: Props) {
  const [recipientName, setRecipientName] = useState(invoice.recipientName);
  const [recipientEmail, setRecipientEmail] = useState(invoice.recipientEmail);
  const [dueDate, setDueDate] = useState(invoice.dueDate.split('T')[0]);
  const [currency, setCurrency] = useState(invoice.currency);
  const [notes, setNotes] = useState(invoice.notes || '');
  const [items, setItems] = useState<InvoiceItem[]>(
    invoice.items.length > 0
      ? invoice.items
      : [{ name: '', description: '', quantity: 1, unitPrice: 0, total: 0 }]
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  function updateItem(index: number, field: keyof InvoiceItem, value: any) {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    if (field === 'quantity' || field === 'unitPrice') {
      const q = parseFloat(field === 'quantity' ? value : updated[index].quantity.toString()) || 0;
      const p = parseFloat(field === 'unitPrice' ? value : updated[index].unitPrice.toString()) || 0;
      updated[index].total = Math.round(q * p * 100) / 100;
    }
    setItems(updated);
  }

  function addItem() {
    setItems([...items, { name: '', description: '', quantity: 1, unitPrice: 0, total: 0 }]);
  }

  function removeItem(index: number) {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  }

  const computedTotal = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await api.updateInvoice(invoice.id, {
        recipientName,
        recipientEmail,
        dueDate,
        currency,
        notes,
        items: items.map(i => ({
          name: i.name,
          description: i.description,
          quantity: parseFloat(i.quantity.toString()),
          unitPrice: parseFloat(i.unitPrice.toString())
        }))
      });

      onSaved(res.invoice);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update proposal');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-100 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <h2 className="text-base font-bold text-slate-900">Edit Proposed Invoice ({invoice.invoiceNumber})</h2>
            <p className="text-xs text-slate-500">Fine-tune details before submitting explicit approval</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form */}
        <form onSubmit={handleSave} className="p-6 overflow-y-auto space-y-5 flex-1">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          {/* Client Info Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Client / Company Name</label>
              <input
                type="text"
                required
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Client Email Address</label>
              <input
                type="email"
                required
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Due Date</label>
              <input
                type="date"
                required
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Currency</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
                <option value="CAD">CAD ($)</option>
                <option value="AUD">AUD ($)</option>
              </select>
            </div>
          </div>

          {/* Line Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Line Items
              </label>
              <button
                type="button"
                onClick={addItem}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Item
              </button>
            </div>

            <div className="space-y-3">
              {items.map((item, idx) => (
                <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Service / Item Name"
                      value={item.name}
                      onChange={(e) => updateItem(idx, 'name', e.target.value)}
                      required
                      className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-slate-300 bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      disabled={items.length <= 1}
                      className="p-1.5 text-slate-400 hover:text-rose-600 disabled:opacity-30"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase font-semibold">Qty</span>
                      <input
                        type="number"
                        step="0.5"
                        min="0.5"
                        value={item.quantity}
                        onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                        required
                        className="w-full px-2 py-1 text-sm rounded border border-slate-300 bg-white"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase font-semibold">Unit Price ($)</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.unitPrice}
                        onChange={(e) => updateItem(idx, 'unitPrice', e.target.value)}
                        required
                        className="w-full px-2 py-1 text-sm rounded border border-slate-300 bg-white"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase font-semibold">Total</span>
                      <div className="px-2 py-1 text-sm font-semibold text-slate-800 bg-slate-100 rounded border border-slate-200">
                        ${(item.quantity * item.unitPrice).toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 flex justify-end text-sm font-bold text-slate-900">
              Total Amount: ${computedTotal.toFixed(2)} {currency}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Invoice Notes / Terms</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300"
            />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>Save Changes</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
