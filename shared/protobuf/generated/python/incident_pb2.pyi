from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class GetIncidentsRequest(_message.Message):
    __slots__ = ("route_key",)
    ROUTE_KEY_FIELD_NUMBER: _ClassVar[int]
    route_key: str
    def __init__(self, route_key: _Optional[str] = ...) -> None: ...

class IncidentSummary(_message.Message):
    __slots__ = ("incident_id", "route", "severity", "status", "description", "created_at", "affected_users_count")
    INCIDENT_ID_FIELD_NUMBER: _ClassVar[int]
    ROUTE_FIELD_NUMBER: _ClassVar[int]
    SEVERITY_FIELD_NUMBER: _ClassVar[int]
    STATUS_FIELD_NUMBER: _ClassVar[int]
    DESCRIPTION_FIELD_NUMBER: _ClassVar[int]
    CREATED_AT_FIELD_NUMBER: _ClassVar[int]
    AFFECTED_USERS_COUNT_FIELD_NUMBER: _ClassVar[int]
    incident_id: str
    route: str
    severity: str
    status: str
    description: str
    created_at: str
    affected_users_count: int
    def __init__(self, incident_id: _Optional[str] = ..., route: _Optional[str] = ..., severity: _Optional[str] = ..., status: _Optional[str] = ..., description: _Optional[str] = ..., created_at: _Optional[str] = ..., affected_users_count: _Optional[int] = ...) -> None: ...

class GetIncidentsResponse(_message.Message):
    __slots__ = ("incidents", "total")
    INCIDENTS_FIELD_NUMBER: _ClassVar[int]
    TOTAL_FIELD_NUMBER: _ClassVar[int]
    incidents: _containers.RepeatedCompositeFieldContainer[IncidentSummary]
    total: int
    def __init__(self, incidents: _Optional[_Iterable[_Union[IncidentSummary, _Mapping]]] = ..., total: _Optional[int] = ...) -> None: ...

class IncidentByIdRequest(_message.Message):
    __slots__ = ("incident_id",)
    INCIDENT_ID_FIELD_NUMBER: _ClassVar[int]
    incident_id: str
    def __init__(self, incident_id: _Optional[str] = ...) -> None: ...

class BlastRadius(_message.Message):
    __slots__ = ("affected_routes", "affected_banks", "affected_psps", "affected_merchants", "affected_users_count", "estimated_txn_impact")
    AFFECTED_ROUTES_FIELD_NUMBER: _ClassVar[int]
    AFFECTED_BANKS_FIELD_NUMBER: _ClassVar[int]
    AFFECTED_PSPS_FIELD_NUMBER: _ClassVar[int]
    AFFECTED_MERCHANTS_FIELD_NUMBER: _ClassVar[int]
    AFFECTED_USERS_COUNT_FIELD_NUMBER: _ClassVar[int]
    ESTIMATED_TXN_IMPACT_FIELD_NUMBER: _ClassVar[int]
    affected_routes: _containers.RepeatedScalarFieldContainer[str]
    affected_banks: _containers.RepeatedScalarFieldContainer[str]
    affected_psps: _containers.RepeatedScalarFieldContainer[str]
    affected_merchants: _containers.RepeatedScalarFieldContainer[str]
    affected_users_count: int
    estimated_txn_impact: int
    def __init__(self, affected_routes: _Optional[_Iterable[str]] = ..., affected_banks: _Optional[_Iterable[str]] = ..., affected_psps: _Optional[_Iterable[str]] = ..., affected_merchants: _Optional[_Iterable[str]] = ..., affected_users_count: _Optional[int] = ..., estimated_txn_impact: _Optional[int] = ...) -> None: ...

class IncidentDetail(_message.Message):
    __slots__ = ("incident_id", "route", "severity", "status", "description", "root_cause", "created_at", "resolved_at", "affected_users_count", "affected_merchants_count", "blast_radius")
    INCIDENT_ID_FIELD_NUMBER: _ClassVar[int]
    ROUTE_FIELD_NUMBER: _ClassVar[int]
    SEVERITY_FIELD_NUMBER: _ClassVar[int]
    STATUS_FIELD_NUMBER: _ClassVar[int]
    DESCRIPTION_FIELD_NUMBER: _ClassVar[int]
    ROOT_CAUSE_FIELD_NUMBER: _ClassVar[int]
    CREATED_AT_FIELD_NUMBER: _ClassVar[int]
    RESOLVED_AT_FIELD_NUMBER: _ClassVar[int]
    AFFECTED_USERS_COUNT_FIELD_NUMBER: _ClassVar[int]
    AFFECTED_MERCHANTS_COUNT_FIELD_NUMBER: _ClassVar[int]
    BLAST_RADIUS_FIELD_NUMBER: _ClassVar[int]
    incident_id: str
    route: str
    severity: str
    status: str
    description: str
    root_cause: str
    created_at: str
    resolved_at: str
    affected_users_count: int
    affected_merchants_count: int
    blast_radius: BlastRadius
    def __init__(self, incident_id: _Optional[str] = ..., route: _Optional[str] = ..., severity: _Optional[str] = ..., status: _Optional[str] = ..., description: _Optional[str] = ..., root_cause: _Optional[str] = ..., created_at: _Optional[str] = ..., resolved_at: _Optional[str] = ..., affected_users_count: _Optional[int] = ..., affected_merchants_count: _Optional[int] = ..., blast_radius: _Optional[_Union[BlastRadius, _Mapping]] = ...) -> None: ...

class EmptyRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...
