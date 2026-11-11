import { Invoice, PolicyCheckResult, AuditLog, PolicyConfig } from './types';

const API_BASE = typeof window !== 'undefined'
  ? '/api'
  : (process.env.BACKEND_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api');

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string>),
  };

  if (options?.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    // If session expired and user is in browser, redirect to login
    if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/auth/')) {
      if (window.location.pathname !== '/login') {
        window.location.href = '/login?expired=1';
      }
    }

    const errorMsg = data.message || data.error || `Request failed with status ${res.status}`;
    const err = new Error(errorMsg) as any;
    err.status = res.status;
    err.details = data.violations || data.details || null;
    err.requiresOverride = data.requiresOverride;
    throw err;
  }

  return data;
}

export const api = {
  // Authentication
  login: (email: string, password: string) =>
    request<{ user: { id: string; email: string } }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  logout: () =>
    request<{ success: boolean; message: string }>('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  getMe: async (): Promise<{ user: { id: string; email: string; createdAt?: string } | null }> => {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(4000),
      });

      if (res.status === 401) {
        return { user: null };
      }

      if (!res.ok) {
        return { user: null };
      }

      const data = await res.json().catch(() => ({}));
      return { user: data.user || null };
    } catch {
      return { user: null };
    }
  },

  getAuthConfig: () =>
    request<{
      demoMode: boolean;
      showDemoLogin?: boolean;
      enablePaymentSimulation?: boolean;
      demoEmail?: string | null;
      demoPassword?: string | null;
    }>('/auth/config'),

  // Invoices
  parsePrompt: (prompt: string) =>
    request<{ invoice: Invoice; policy: PolicyCheckResult }>('/invoices/parse', {
      method: 'POST',
      body: JSON.stringify({ prompt }),
    }),

  listInvoices: (status?: string, search?: string) => {
    const params = new URLSearchParams();
    if (status && status !== 'ALL') params.append('status', status);
    if (search) params.append('search', search);
    const query = params.toString() ? `?${params.toString()}` : '';
    return request<{ invoices: Invoice[] }>(`/invoices${query}`);
  },

  getInvoice: (id: string) =>
    request<{ invoice: Invoice; policy: PolicyCheckResult }>(`/invoices/${id}`),

  updateInvoice: (id: string, payload: any) =>
    request<{ invoice: Invoice; policy: PolicyCheckResult }>(`/invoices/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  approveInvoice: (id: string, overrideWarnings = false) =>
    request<{ message: string; invoice: Invoice }>(`/invoices/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ overrideWarnings }),
    }),

  createPayPalDraft: (id: string) =>
    request<{ message: string; invoice: Invoice }>(`/invoices/${id}/create-paypal`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  sendInvoice: (id: string) =>
    request<{ message: string; invoice: Invoice }>(`/invoices/${id}/send`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  sendReminder: (id: string, tone?: string, customNote?: string) =>
    request<{ message: string; invoice: Invoice; reminderDetails: any }>(`/invoices/${id}/remind`, {
      method: 'POST',
      body: JSON.stringify({ tone, customNote }),
    }),

  syncInvoice: (id: string) =>
    request<{ message: string; currentStatus: string; paypalDetails: any }>(`/invoices/${id}/sync`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  // Webhooks simulation
  simulateWebhook: (payload: {
    paypalInvoiceId: string;
    eventType?: string;
    paidStatus?: string;
    dueAmount?: number;
    paidAmount?: number;
  }) =>
    request<any>('/webhooks/simulate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Audit Logs
  getAuditLogs: (invoiceId?: string, action?: string, limit = 50) => {
    const params = new URLSearchParams();
    if (invoiceId) params.append('invoiceId', invoiceId);
    if (action) params.append('action', action);
    params.append('limit', limit.toString());
    return request<{ logs: AuditLog[]; total: number }>(`/audit-logs?${params.toString()}`);
  },

  // Policy Engine
  getPolicy: () =>
    request<{ policy: PolicyConfig }>('/policy'),

  updatePolicy: (data: Partial<PolicyConfig>) =>
    request<{ message: string; policy: PolicyConfig }>('/policy', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  evaluatePolicy: (recipientEmail: string, totalAmount: number) =>
    request<PolicyCheckResult>('/policy/evaluate', {
      method: 'POST',
      body: JSON.stringify({ recipientEmail, totalAmount }),
    }),
};
