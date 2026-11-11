export interface ExtractedItem {
  name: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface ExtractedInvoiceProposal {
  recipientName: string;
  recipientEmail: string;
  items: ExtractedItem[];
  currency: string;
  dueDate: string; // YYYY-MM-DD
  notes: string;
  confidenceScore: number;
  rawPrompt: string;
  entities: {
    detectedEmail?: string;
    detectedTotal?: number;
    detectedDueDate?: string;
  };
}

export function parseInvoicePrompt(prompt: string, referenceDateStr?: string): ExtractedInvoiceProposal {
  const text = prompt.trim();
  const refDate = referenceDateStr ? new Date(referenceDateStr) : new Date();

  // 1. Detect Email
  const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/;
  const emailMatch = text.match(emailRegex);
  const detectedEmail = emailMatch ? emailMatch[1] : 'client@example.com';

  // 2. Detect Recipient Name
  let recipientName = 'Valued Client';
  const namePatterns = [
    /(?:invoice|bill|charge|send to)\s+([A-Z][a-zA-Z0-9\s&]+?)(?:\s+(?:for|\$|at|\d|due|email|with|\()|$)/i,
    /(?:client|customer|recipient)(?:\s+is)?\s+([A-Z][a-zA-Z0-9\s&]+?)(?:\s+(?:for|\$|at|\d|due|email|\()|$)/i,
    /(?:for|to)\s+([A-Z][a-zA-Z0-9\s&]+?)(?:\s+(?:for|\$|due|at|email|\()|$)/i
  ];

  for (const pat of namePatterns) {
    const match = text.match(pat);
    if (match && match[1] && match[1].trim().length > 1) {
      const candidate = match[1].trim();
      // exclude common stop words
      if (!['him', 'her', 'them', 'the client', 'a client', 'me'].includes(candidate.toLowerCase())) {
        recipientName = candidate;
        break;
      }
    }
  }

  // If email was found and name was default, infer from email prefix
  if (recipientName === 'Valued Client' && emailMatch) {
    const emailPrefix = emailMatch[1].split('@')[0];
    const cleanPrefix = emailPrefix.replace(/[._-]/g, ' ');
    recipientName = cleanPrefix.charAt(0).toUpperCase() + cleanPrefix.slice(1);
  }

  // 3. Detect Currency
  let currency = 'USD';
  if (/(\$|usd|dollars)/i.test(text)) currency = 'USD';
  else if (/(\€|eur|euros)/i.test(text)) currency = 'EUR';
  else if (/(\£|gbp|pounds)/i.test(text)) currency = 'GBP';
  else if (/(cad)/i.test(text)) currency = 'CAD';
  else if (/(aud)/i.test(text)) currency = 'AUD';

  // 4. Detect Line Items & Amounts
  const items: ExtractedItem[] = [];

  // Hourly pattern: e.g. "20 hrs @ $75/hr", "15 hours at 50"
  const hourlyMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:hrs?|hours?)\s*(?:@|at)?\s*\$?(\d+(?:\.\d+)?)/i);
  
  // Rate x quantity pattern: e.g. "5 pages at $100 each"
  const quantityRateMatch = text.match(/(\d+)\s+([a-zA-Z\s]+?)\s+(?:@|at)\s*\$?(\d+(?:\.\d+)?)/i);

  // Direct total pattern: "$500 for landing page design", "500 USD for web development"
  const directTotalMatch = text.match(/(?:\$|usd\s*|eur\s*|gbp\s*)?(\d+(?:\.\d{1,2})?)\s*(?:\$|usd|eur|gbp)?\s*(?:for|towards)\s+([^,.;\n]+)/i) ||
                           text.match(/(?:for|towards)\s+([^,.;\n]+?)\s+(?:amounting to\s+|\$?|\b)(\d+(?:\.\d{1,2})?)/i);

  if (hourlyMatch) {
    const hours = parseFloat(hourlyMatch[1]);
    const rate = parseFloat(hourlyMatch[2]);
    const total = Math.round(hours * rate * 100) / 100;

    // extract description if possible
    let desc = 'Professional Consulting & Development Services';
    const forMatch = text.match(/for\s+([^,.;\n]+?)(?:\s+(?:due|at|\$|\d|net|\()|$)/i);
    if (forMatch && forMatch[1]) {
      desc = forMatch[1].trim();
    }

    items.push({
      name: desc,
      description: `${hours} hours billed at $${rate.toFixed(2)} / hr`,
      quantity: hours,
      unitPrice: rate,
      total
    });
  } else if (quantityRateMatch && !quantityRateMatch[2].toLowerCase().includes('hour') && !quantityRateMatch[2].toLowerCase().includes('hr')) {
    const qty = parseInt(quantityRateMatch[1], 10);
    const itemName = quantityRateMatch[2].trim();
    const rate = parseFloat(quantityRateMatch[3]);
    const total = Math.round(qty * rate * 100) / 100;

    items.push({
      name: itemName,
      description: `${qty} units at $${rate.toFixed(2)} each`,
      quantity: qty,
      unitPrice: rate,
      total
    });
  } else if (directTotalMatch) {
    const isAmountFirst = !isNaN(parseFloat(directTotalMatch[1]));
    const amountVal = isAmountFirst ? parseFloat(directTotalMatch[1]) : parseFloat(directTotalMatch[2]);
    const serviceName = isAmountFirst ? directTotalMatch[2].trim() : directTotalMatch[1].trim();

    items.push({
      name: serviceName || 'Freelance Services',
      description: `Delivery of ${serviceName || 'contract deliverables'}`,
      quantity: 1,
      unitPrice: amountVal,
      total: amountVal
    });
  } else {
    // General amount fallback
    const anyAmountMatch = text.match(/(?:\$|usd\s*)(\d+(?:\.\d{1,2})?)/i) || text.match(/(\d+(?:\.\d{1,2})?)\s*(?:dollars|usd|\$)/i);
    const amountVal = anyAmountMatch ? parseFloat(anyAmountMatch[1]) : 250.00;

    items.push({
      name: 'Professional Freelance Services',
      description: text.length > 80 ? text.substring(0, 80) + '...' : text,
      quantity: 1,
      unitPrice: amountVal,
      total: amountVal
    });
  }

  // 5. Detect Due Date
  let targetDueDate = new Date(refDate);
  let detectedDueDateStr: string | undefined;

  // Check explicit ISO date
  const isoDateMatch = text.match(/\b(202\d-[01]\d-[0-3]\d)\b/);
  if (isoDateMatch) {
    targetDueDate = new Date(isoDateMatch[1]);
    detectedDueDateStr = targetDueDate.toISOString().split('T')[0];
  } else if (/due\s+(?:in\s+)?(\d+)\s+days?/i.test(text)) {
    const days = parseInt(text.match(/due\s+(?:in\s+)?(\d+)\s+days?/i)![1], 10);
    targetDueDate.setDate(targetDueDate.getDate() + days);
    detectedDueDateStr = targetDueDate.toISOString().split('T')[0];
  } else if (/net\s*30/i.test(text)) {
    targetDueDate.setDate(targetDueDate.getDate() + 30);
    detectedDueDateStr = targetDueDate.toISOString().split('T')[0];
  } else if (/net\s*14/i.test(text)) {
    targetDueDate.setDate(targetDueDate.getDate() + 14);
    detectedDueDateStr = targetDueDate.toISOString().split('T')[0];
  } else if (/net\s*7/i.test(text)) {
    targetDueDate.setDate(targetDueDate.getDate() + 7);
    detectedDueDateStr = targetDueDate.toISOString().split('T')[0];
  } else if (/due\s+tomorrow/i.test(text)) {
    targetDueDate.setDate(targetDueDate.getDate() + 1);
    detectedDueDateStr = targetDueDate.toISOString().split('T')[0];
  } else if (/due\s+next\s+friday/i.test(text)) {
    // compute days until next Friday
    const day = targetDueDate.getDay();
    const daysUntilFriday = (5 - day + 7) % 7 || 7;
    targetDueDate.setDate(targetDueDate.getDate() + daysUntilFriday);
    detectedDueDateStr = targetDueDate.toISOString().split('T')[0];
  } else {
    // Default 14 days
    targetDueDate.setDate(targetDueDate.getDate() + 14);
    detectedDueDateStr = targetDueDate.toISOString().split('T')[0];
  }

  // 6. Detect Notes / Terms
  let notes = 'Thank you for your business! Please remit payment by the due date via PayPal.';
  if (/note(?:s)?:\s*([^.\n]+)/i.test(text)) {
    notes = text.match(/note(?:s)?:\s*([^.\n]+)/i)![1].trim();
  } else if (/terms?:\s*([^.\n]+)/i.test(text)) {
    notes = `Terms: ${text.match(/terms?:\s*([^.\n]+)/i)![1].trim()}`;
  }

  const detectedTotal = items.reduce((acc, item) => acc + item.total, 0);

  // Calculate confidence score based on how many signals matched
  let confidence = 0.60;
  if (emailMatch) confidence += 0.15;
  if (items.length > 0 && items[0].total > 0) confidence += 0.15;
  if (isoDateMatch || /due/i.test(text)) confidence += 0.10;

  return {
    recipientName,
    recipientEmail: detectedEmail,
    items,
    currency,
    dueDate: detectedDueDateStr || targetDueDate.toISOString().split('T')[0],
    notes,
    confidenceScore: Math.min(0.99, Math.round(confidence * 100) / 100),
    rawPrompt: prompt,
    entities: {
      detectedEmail: emailMatch ? emailMatch[1] : undefined,
      detectedTotal,
      detectedDueDate: detectedDueDateStr
    }
  };
}
