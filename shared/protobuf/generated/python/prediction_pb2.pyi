from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class PredictRequest(_message.Message):
    __slots__ = ("sender_bank", "receiver_bank", "amount", "currency", "route_history")
    SENDER_BANK_FIELD_NUMBER: _ClassVar[int]
    RECEIVER_BANK_FIELD_NUMBER: _ClassVar[int]
    AMOUNT_FIELD_NUMBER: _ClassVar[int]
    CURRENCY_FIELD_NUMBER: _ClassVar[int]
    ROUTE_HISTORY_FIELD_NUMBER: _ClassVar[int]
    sender_bank: str
    receiver_bank: str
    amount: float
    currency: str
    route_history: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, sender_bank: _Optional[str] = ..., receiver_bank: _Optional[str] = ..., amount: _Optional[float] = ..., currency: _Optional[str] = ..., route_history: _Optional[_Iterable[str]] = ...) -> None: ...

class PredictResponse(_message.Message):
    __slots__ = ("route_key", "success_probability", "risk_level", "recommendation", "route_health_score", "active_incidents", "cached", "generated_at")
    ROUTE_KEY_FIELD_NUMBER: _ClassVar[int]
    SUCCESS_PROBABILITY_FIELD_NUMBER: _ClassVar[int]
    RISK_LEVEL_FIELD_NUMBER: _ClassVar[int]
    RECOMMENDATION_FIELD_NUMBER: _ClassVar[int]
    ROUTE_HEALTH_SCORE_FIELD_NUMBER: _ClassVar[int]
    ACTIVE_INCIDENTS_FIELD_NUMBER: _ClassVar[int]
    CACHED_FIELD_NUMBER: _ClassVar[int]
    GENERATED_AT_FIELD_NUMBER: _ClassVar[int]
    route_key: str
    success_probability: float
    risk_level: str
    recommendation: str
    route_health_score: float
    active_incidents: _containers.RepeatedScalarFieldContainer[str]
    cached: bool
    generated_at: str
    def __init__(self, route_key: _Optional[str] = ..., success_probability: _Optional[float] = ..., risk_level: _Optional[str] = ..., recommendation: _Optional[str] = ..., route_health_score: _Optional[float] = ..., active_incidents: _Optional[_Iterable[str]] = ..., cached: _Optional[bool] = ..., generated_at: _Optional[str] = ...) -> None: ...

class RouteHealthRequest(_message.Message):
    __slots__ = ("route_key",)
    ROUTE_KEY_FIELD_NUMBER: _ClassVar[int]
    route_key: str
    def __init__(self, route_key: _Optional[str] = ...) -> None: ...

class RouteHealthResponse(_message.Message):
    __slots__ = ("route_key", "health_score", "success_rate", "failure_rate", "timeout_rate", "p95_ms", "p99_ms", "total_transactions", "last_updated", "has_active_incident")
    ROUTE_KEY_FIELD_NUMBER: _ClassVar[int]
    HEALTH_SCORE_FIELD_NUMBER: _ClassVar[int]
    SUCCESS_RATE_FIELD_NUMBER: _ClassVar[int]
    FAILURE_RATE_FIELD_NUMBER: _ClassVar[int]
    TIMEOUT_RATE_FIELD_NUMBER: _ClassVar[int]
    P95_MS_FIELD_NUMBER: _ClassVar[int]
    P99_MS_FIELD_NUMBER: _ClassVar[int]
    TOTAL_TRANSACTIONS_FIELD_NUMBER: _ClassVar[int]
    LAST_UPDATED_FIELD_NUMBER: _ClassVar[int]
    HAS_ACTIVE_INCIDENT_FIELD_NUMBER: _ClassVar[int]
    route_key: str
    health_score: float
    success_rate: float
    failure_rate: float
    timeout_rate: float
    p95_ms: float
    p99_ms: float
    total_transactions: int
    last_updated: str
    has_active_incident: bool
    def __init__(self, route_key: _Optional[str] = ..., health_score: _Optional[float] = ..., success_rate: _Optional[float] = ..., failure_rate: _Optional[float] = ..., timeout_rate: _Optional[float] = ..., p95_ms: _Optional[float] = ..., p99_ms: _Optional[float] = ..., total_transactions: _Optional[int] = ..., last_updated: _Optional[str] = ..., has_active_incident: _Optional[bool] = ...) -> None: ...

class EmptyRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class AllRouteHealthResponse(_message.Message):
    __slots__ = ("routes",)
    ROUTES_FIELD_NUMBER: _ClassVar[int]
    routes: _containers.RepeatedCompositeFieldContainer[RouteHealthResponse]
    def __init__(self, routes: _Optional[_Iterable[_Union[RouteHealthResponse, _Mapping]]] = ...) -> None: ...
