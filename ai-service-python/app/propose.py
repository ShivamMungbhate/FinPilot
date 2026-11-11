
import json
import re
from datetime import date
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path

from pydantic import BaseModel, Field, ValidationError
from app.llm import generate_with_fallback



PROMPT_PATH = Path(__file__).parent / "prompts" / "invoice_extraction.txt"


class ExtractedItem(BaseModel):
    name: str = ""
    description: str = ""
    quantityText: str = ""
    unitPriceText: str = ""


class ExtractedInvoice(BaseModel):
    recipientName: str = ""
    recipientEmail: str = ""
    items: list[ExtractedItem] = Field(default_factory=list)
    dueDate: str = ""
    notes: str = ""
    confidenceScore: float = Field(default=0.0, ge=0, le=1)


def load_prompt(reference_date: date, user_text: str) -> str:
    template = PROMPT_PATH.read_text(encoding="utf-8")

    return (
        template
        .replace("{reference_date}", reference_date.isoformat())
        .replace("{user_text}", user_text)
    )

def detect_currency(text: str) -> str:
    """Preserve an explicitly mentioned currency; otherwise default to USD."""
    found = set()

    patterns = [
        (r"\bINR\b|₹|\bRs\.?\b|\brupees?\b", "INR"),
        (r"\bUSD\b|\$", "USD"),
        (r"\bEUR\b|€", "EUR"),
        (r"\bGBP\b|£", "GBP"),
    ]

    for pattern, currency in patterns:
        if re.search(pattern, text, re.IGNORECASE):
            found.add(currency)

    # Conflicting currency indicators are ambiguous.
    if len(found) > 1:
        raise ValueError("Multiple currencies were mentioned. Please clarify.")

    return next(iter(found), "USD")


def parse_money(raw: str) -> Decimal:
    if not raw or not raw.strip():
        raise ValueError("Price is missing.")

    value = raw.lower().strip()
    value = re.sub(r"\s+(each|apiece)\s*$", "", value)

    
    value = re.sub(
        r"\s+per\s+(hour|hr|minute|min|day|week|month|item|unit|"
        r"piece|session|project)s?\b.*$",
        "",
        value,
    )

    value = value.replace(",", "").replace("₹", "")

    value = re.sub(
        r"\b(inr|usd|eur|gbp|rs\.?|rupees?)\b",
        "",
        value,
    )

    value = value.replace("$", "").replace("€", "").replace("£", "")
    value = value.strip()

    multiplier = Decimal("1")

    if re.search(r"\b(lakh|lac)\b", value):
        multiplier = Decimal("100000")
        value = re.sub(r"\s*(lakh|lac)\b", "", value)
    elif re.search(r"\bcrore\b", value):
        multiplier = Decimal("10000000")
        value = re.sub(r"\s*crore\b", "", value)
    elif re.search(r"\d\s*k\b", value):
        multiplier = Decimal("1000")
        value = re.sub(r"(?<=\d)\s*k\b", "", value)

    try:
        amount = Decimal(value.strip()) * multiplier
    except InvalidOperation:
        raise ValueError(f"Could not understand price: {raw}")

    amount = amount.quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )

    if amount <= 0:
        raise ValueError("Price must be greater than zero.")

    return amount

def parse_quantity(raw: str) -> Decimal:
    if not raw or not raw.strip():
        return Decimal("1")

    # Remove common units after the numeric quantity.
    cleaned = raw.strip().lower()

    cleaned = re.sub(
        r"\s*(hours?|hrs?|ghanta|ghante|ghanton|"
        r"minutes?|mins?|days?|weeks?|months?|"
        r"items?|units?|pieces?|pcs?|sessions?|projects?)\s*$",
        "",
        cleaned,
    )

    try:
        quantity = Decimal(cleaned.strip())
    except InvalidOperation:
        raise ValueError(f"Could not understand quantity: {raw}")

    if quantity <= 0:
        raise ValueError("Quantity must be greater than zero.")

    return quantity

def validate_due_date(raw: str) -> str:
    if not raw:
        return ""

    try:
        return date.fromisoformat(raw).isoformat()
    except ValueError:
        
        return ""



def extract_invoice(text: str, reference_date: date) -> dict:
    if not text or not text.strip():
        raise ValueError("Please describe the invoice you want to create.")

    if len(text) > 5000:
        raise ValueError("Invoice request is too long. Maximum is 5000 characters.")

    prompt = load_prompt(reference_date, text)

    response = generate_with_fallback(
        contents=prompt,
        config={
            "response_mime_type": "application/json",
            "temperature": 0.1,
        },
    )

    if not response.text:
        raise ValueError("Gemini returned an empty response.")

    try:
        extracted = ExtractedInvoice.model_validate_json(response.text)
    except ValidationError as error:
        raise ValueError("Gemini returned invalid invoice information.") from error

    currency = detect_currency(text)

    email_match = re.search(
        r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}",
        text,
    )

    recipient_email = ""
    if email_match:
        candidate = extracted.recipientEmail.strip()
        if candidate.lower() == email_match.group(0).lower():
            recipient_email = candidate

    items = []
    missing_price_items = []

    for item in extracted.items:
        if not item.name.strip():
            continue

        if not item.unitPriceText.strip():
            missing_price_items.append(item.name.strip())
            continue

        quantity = parse_quantity(item.quantityText)
        unit_price = parse_money(item.unitPriceText)

        total = (quantity * unit_price).quantize(
            Decimal("0.01"),
            rounding=ROUND_HALF_UP,
        )

        items.append({
            "name": item.name.strip(),
            "description": item.description.strip(),
            "quantity": float(quantity),
            "unitPrice": float(unit_price),
            "total": float(total),
        })

    notes = extracted.notes.strip()
    confidence_score = extracted.confidenceScore

    if missing_price_items:
        warning = (
            "Price missing for: "
            + ", ".join(missing_price_items)
            + ". Please provide the missing price before creating the invoice."
        )
        notes = f"{notes}\n{warning}".strip()
        confidence_score = min(confidence_score, 0.4)

    return {
        "recipientName": extracted.recipientName.strip(),
        "recipientEmail": recipient_email,
        "items": items,
        "currency": currency,
        "dueDate": validate_due_date(extracted.dueDate),
        "notes": notes,
        "confidenceScore": confidence_score,
        "rawPrompt": text,
        "entities": {
            "detectedEmail": recipient_email or None,
        },
    }
