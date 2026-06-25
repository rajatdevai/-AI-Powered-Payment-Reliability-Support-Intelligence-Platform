"""
PRISM Pydantic Models
Python counterpart to shared/schemas/src/node/index.ts

All models must stay in sync with the Zod schemas.
These are used by all Python services: prediction-engine, rca-engine,
reversal-engine, blast-radius-engine, incident-engine, agent-service.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


# ============================================================
# ENUMS
# ============================================================

class BankCode(str, Enum):
    HDFC = "HDFC"
    ICICI = "ICICI"
    SBI = "SBI"
    AXIS = "AXIS"
    YESBANK = "YESBANK"


class TransactionStatus(str, Enum):
    PENDING = "PENDING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    TIMEOUT = "TIMEOUT"
    REVERSED = "REVERSED"


class IncidentSeverity(str, Enum):
    LOW = "LOW"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class IncidentStatus(str, Enum):
    ACTIVE = "ACTIVE"
    RESOLVED = "RESOLVED"


class CaseStatus(str, Enum):
    OPEN = "OPEN"
    IN_PROGRESS = "IN_PROGRESS"
    RESOLVED = "RESOLVED"
    ESCALATED = "ESCALATED"


class RiskLevel(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


# ============================================================
# TRANSACTION
# ============================================================

class Transaction(BaseModel):
    id: UUID
    amount: float = Field(gt=0)
    currency: str = Field(default="INR", min_length=3, max_length=3)
    sender_bank: BankCode
    receiver_bank: BankCode
    psp_id: Optional[str] = None
    merchant_id: Optional[UUID] = None
    user_id: Optional[UUID] = None
    status: TransactionStatus
    route_path: list[str] = Field(min_length=1)
    latency_ms: Optional[int] = Field(default=None, ge=0)
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    root_cause: Optional[str] = None
    affected_component: Optional[str] = None
    rca_confidence: Optional[float] = Field(default=None, ge=0, le=1)
    expected_reversal: Optional[str] = None
    reversal_confidence: Optional[float] = Field(default=None, ge=0, le=100)
    created_at: datetime
    settled_at: Optional[datetime] = None

    model_config = {"use_enum_values": True}


class CreateTransaction(BaseModel):
    amount: float = Field(gt=0)
    currency: str = Field(default="INR", min_length=3, max_length=3)
    sender_bank: BankCode
    receiver_bank: BankCode
    psp_id: Optional[str] = None
    merchant_id: Optional[UUID] = None
    user_id: Optional[UUID] = None

    model_config = {"use_enum_values": True}


# ============================================================
# INCIDENT
# ============================================================

class BlastRadius(BaseModel):
    affected_routes: list[str]
    affected_banks: list[BankCode]
    affected_psps: list[str]
    affected_merchants: list[str]
    affected_users_count: int = Field(ge=0)
    estimated_txn_impact: int = Field(ge=0)

    model_config = {"use_enum_values": True}


class Incident(BaseModel):
    id: UUID
    route: str
    severity: IncidentSeverity
    status: IncidentStatus
    affected_users_count: int = Field(default=0, ge=0)
    affected_merchants_count: int = Field(default=0, ge=0)
    blast_radius: Optional[BlastRadius] = None
    description: str
    root_cause: Optional[str] = None
    created_at: datetime
    resolved_at: Optional[datetime] = None

    model_config = {"use_enum_values": True}


# ============================================================
# SUPPORT CASE
# ============================================================

class SupportCase(BaseModel):
    id: UUID
    transaction_id: UUID
    customer_id: Optional[UUID] = None
    agent_id: Optional[str] = None
    status: CaseStatus
    ai_rca_summary: Optional[str] = None
    ai_suggested_response: Optional[str] = None
    ai_escalation_recommendation: Optional[str] = None
    refund_eta: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    closed_at: Optional[datetime] = None

    model_config = {"use_enum_values": True}


# ============================================================
# ROUTE HEALTH  (Redis hot cache)
# ============================================================

class RouteHealth(BaseModel):
    route_key: str              # e.g. "HDFC_SBI"
    health_score: float = Field(ge=0, le=100)
    success_rate: float = Field(ge=0, le=100)
    failure_rate: float = Field(ge=0, le=100)
    p95_ms: float = Field(ge=0)
    p99_ms: float = Field(ge=0)
    timeout_rate: float = Field(ge=0, le=100)
    total_transactions: int = Field(ge=0)
    last_updated: datetime


# ============================================================
# BANK HEALTH  (Redis hot cache)
# ============================================================

class BankHealth(BaseModel):
    bank_id: BankCode
    health_score: float = Field(ge=0, le=100)
    sla_compliance: float = Field(ge=0, le=100)
    avg_latency_ms: float = Field(ge=0)
    active_incidents_count: int = Field(ge=0)
    last_updated: datetime

    model_config = {"use_enum_values": True}


# ============================================================
# PREDICTION RESPONSE
# ============================================================

class PredictionResponse(BaseModel):
    route_key: str
    sender_bank: BankCode
    receiver_bank: BankCode
    amount: float = Field(gt=0)
    success_probability: float = Field(ge=0, le=100)
    risk_level: RiskLevel
    recommendation: str
    route_health_score: float = Field(ge=0, le=100)
    active_incidents: list[str]
    cached: bool = False
    generated_at: datetime

    model_config = {"use_enum_values": True}


# ============================================================
# RCA REPORT
# ============================================================

class QdrantMatch(BaseModel):
    document_id: str
    score: float
    summary: str


class RcaEvidence(BaseModel):
    neo4j_path: Optional[list[str]] = None
    qdrant_matches: Optional[list[QdrantMatch]] = None
    error_pattern: Optional[str] = None
    frequency: Optional[int] = None


class RcaReport(BaseModel):
    id: UUID
    transaction_id: UUID
    root_cause: str
    affected_component: str
    confidence: float = Field(ge=0, le=1)
    evidence: RcaEvidence
    llm_summary: Optional[str] = None
    created_at: datetime


# ============================================================
# REVERSAL PREDICTION
# ============================================================

class ReversalPrediction(BaseModel):
    id: UUID
    transaction_id: UUID
    refund_eta: str                # e.g. "14 minutes", "3 hours"
    refund_eta_minutes: int        # numeric, for sorting/filtering
    reversal_confidence: float = Field(ge=0, le=100)
    similar_cases_count: int = Field(ge=0)
    bank_behavior_note: Optional[str] = None
    created_at: datetime
