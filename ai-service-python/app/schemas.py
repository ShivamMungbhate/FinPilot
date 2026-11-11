
from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ParseInvoiceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=1)
    referenceDate: date | None = None


class InvoiceItem(BaseModel):
    name: str
    description: str
    quantity: float
    unitPrice: float
    total: float


class ParseInvoiceResponse(BaseModel):
    recipientName: str
    recipientEmail: str
    items: list[InvoiceItem]
    currency: str
    dueDate: str
    notes: str
    confidenceScore: float = Field(ge=0, le=1)
    rawPrompt: str
    entities: dict | None = None


class ReminderRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    invoiceId: str = Field(min_length=1)
    invoiceNumber: str | None = None
    recipientName: str = Field(min_length=1)
    recipientEmail: str | None = None
    amount: float = Field(gt=0)
    currency: str = "USD"
    dueDate: date
    daysOverdue: int = Field(default=0, ge=0)
    reminderCount: int = Field(default=1, ge=1)
    tone: Literal["gentle", "firm", "urgent"] = "gentle"


class ReminderResponse(BaseModel):
    subject: str
    message: str
    tone: Literal["gentle", "firm", "urgent"]
    suggestedFollowUpDays: int = Field(ge=0)
    reminderCount: int
    generatedAt: str | None = None
