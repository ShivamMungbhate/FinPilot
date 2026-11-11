
import json
import re
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

from pydantic import BaseModel, Field, ValidationError

from app.llm import generate_with_fallback


PROMPT_PATH = (
    Path(__file__).parent
    / "prompts"
    / "reminder_generation.txt"
)


class ReminderDraft(BaseModel):
    subject: str = Field(min_length=5, max_length=150)
    message: str = Field(min_length=30, max_length=2000)


def format_amount(amount, currency):
    value = Decimal(str(amount)).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP
    )
    formatted = f"{value:,.2f}"
    return f"{currency.upper()} {formatted}"


def format_due_date(due_date):
    return due_date.strftime("%B %d, %Y").replace(" 0", " ")


def build_prompt(request):
    template = PROMPT_PATH.read_text(encoding="utf-8")

    invoice_number = request.invoiceNumber or "Not provided"

    amount = format_amount(
        request.amount,
        request.currency
    )

    return (
        template
        .replace("{recipient_name}", request.recipientName)
        .replace("{invoice_number}", invoice_number)
        .replace("{invoice_id}", request.invoiceId)
        .replace("{amount}", amount)
        .replace("{currency}", request.currency.upper())
        .replace(
            "{due_date}",
            format_due_date(request.dueDate)
        )
        .replace("{days_overdue}", str(request.daysOverdue))
        .replace("{reminder_count}", str(request.reminderCount))
        .replace("{tone}", request.tone)
    )


def validate_reminder(draft, request):
    subject = draft.subject.strip()
    message = draft.message.strip()

    if not subject or not message:
        raise ValueError("Subject or message is empty.")

    amount = format_amount(
        request.amount,
        request.currency
    )

    due_date = format_due_date(request.dueDate)

    required_facts = [
        request.recipientName,
        amount,
        due_date,
    ]

    if request.invoiceNumber:
        required_facts.append(request.invoiceNumber)

    for fact in required_facts:
        if fact.lower() not in message.lower():
            raise ValueError(
                f"Reminder is missing a required invoice fact: {fact}"
            )

    combined = f"{subject} {message}".lower()

    unsafe_phrases = [
        "legal action",
        "lawsuit",
        "collections agency",
        "late fee",
        "penalty",
        "payment has been received",
        "already paid",
        "payment was completed",
    ]

    for phrase in unsafe_phrases:
        if phrase in combined:
            raise ValueError(
                f"Reminder contains unsupported language: {phrase}"
            )

    tone_requirements = {
        "gentle": [
            "kindly",
            "hope",
            "when convenient",
            "appreciate",
        ],
        "firm": [
            "promptly",
            "at your earliest",
            "please arrange",
            "please process",
        ],
        "urgent": [
            "urgent",
            "as soon as possible",
            "promptly",
        ],
    }

    expected_phrases = tone_requirements[request.tone]

    if not any(
        phrase in combined
        for phrase in expected_phrases
    ):
        raise ValueError(
            f"Reminder does not match the requested "
            f"{request.tone} tone."
        )

    return subject, message


def build_fallback(request):
    amount = format_amount(
        request.amount,
        request.currency
    )

    due_date = format_due_date(request.dueDate)

    invoice_reference = (
        f" (Invoice {request.invoiceNumber})"
        if request.invoiceNumber
        else ""
    )

    if request.tone == "gentle":
        subject = f"Friendly payment reminder{invoice_reference}"
        opening = (
            "I hope you are doing well. "
            "This is a friendly reminder regarding "
            "the following invoice."
        )
        request_text = (
            "When convenient, kindly arrange payment. "
            "Please let us know if you need any clarification."
        )

    elif request.tone == "firm":
        subject = f"Payment reminder{invoice_reference}"
        opening = (
            "This is a payment reminder regarding "
            "the following  invoice."
        )
        request_text = (
            "Please arrange payment promptly. "
            "If payment has already been initiated, "
            "please share an update."
        )

    else:
        subject = f"Urgent payment reminder{invoice_reference}"
        opening = (
            "This is an urgent reminder regarding "
            "the following invoice."
        )
        request_text = (
            "Please arrange payment as soon as possible "
            "and share an update."
        )

    message = (
        f"Hello {request.recipientName},\n\n"
        f"{opening}\n\n"
        f"Invoice amount: {amount}\n"
        f"Due date: {due_date}\n\n"
        f"{request_text}\n\n"
        "Thank you."
    )

    return subject, message


def draft_reminder(request):
    prompt = build_prompt(request)

    for attempt in range(2):
        try:
            response = generate_with_fallback(
                contents=prompt,
                config={
                    "response_mime_type": "application/json",
                    "temperature": 0.3,
                },
            )

            if not response.text:
                raise ValueError("Gemini returned an empty response.")

            data = json.loads(response.text)

            draft = ReminderDraft.model_validate(data)

            subject, message = validate_reminder(
                draft,
                request
            )

            return {
                "subject": subject,
                "message": message,
                "tone": request.tone,
                "suggestedFollowUpDays": {
                    "gentle": 5,
                    "firm": 3,
                    "urgent": 1,
                }[request.tone],
                "reminderCount": request.reminderCount,
                "generatedAt": None,
            }

        except (
            Exception
        ) as error:

            print(
                f"Reminder generation attempt "
                f"{attempt + 1} failed: {type(error).__name__}"
            )

            if attempt == 0:
                prompt += (
                    "\n\nIMPORTANT: Your previous response "
                    "failed validation. Correct the issue and "
                    "return valid JSON containing all required "
                    "invoice facts and the requested tone."
                )

    # Both attempts failed. Use a deterministic template.
    subject, message = build_fallback(request)

    return {
        "subject": subject,
        "message": message,
        "tone": request.tone,
        "suggestedFollowUpDays": {
            "gentle": 5,
            "firm": 3,
            "urgent": 1,
        }[request.tone],
        "reminderCount": request.reminderCount,
        "generatedAt": None,
    }
