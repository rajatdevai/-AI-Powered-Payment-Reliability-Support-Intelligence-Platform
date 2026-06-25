from google.protobuf.internal import containers as _containers
from google.protobuf.internal import enum_type_wrapper as _enum_type_wrapper
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class Persona(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    PERSONA_UNSPECIFIED: _ClassVar[Persona]
    CUSTOMER: _ClassVar[Persona]
    BPO_AGENT: _ClassVar[Persona]
    OPS_ENGINEER: _ClassVar[Persona]
PERSONA_UNSPECIFIED: Persona
CUSTOMER: Persona
BPO_AGENT: Persona
OPS_ENGINEER: Persona

class AgentQueryRequest(_message.Message):
    __slots__ = ("session_id", "persona", "message", "transaction_id", "incident_id")
    SESSION_ID_FIELD_NUMBER: _ClassVar[int]
    PERSONA_FIELD_NUMBER: _ClassVar[int]
    MESSAGE_FIELD_NUMBER: _ClassVar[int]
    TRANSACTION_ID_FIELD_NUMBER: _ClassVar[int]
    INCIDENT_ID_FIELD_NUMBER: _ClassVar[int]
    session_id: str
    persona: Persona
    message: str
    transaction_id: str
    incident_id: str
    def __init__(self, session_id: _Optional[str] = ..., persona: _Optional[_Union[Persona, str]] = ..., message: _Optional[str] = ..., transaction_id: _Optional[str] = ..., incident_id: _Optional[str] = ...) -> None: ...

class AgentTrace(_message.Message):
    __slots__ = ("agent_name", "message", "timestamp")
    AGENT_NAME_FIELD_NUMBER: _ClassVar[int]
    MESSAGE_FIELD_NUMBER: _ClassVar[int]
    TIMESTAMP_FIELD_NUMBER: _ClassVar[int]
    agent_name: str
    message: str
    timestamp: str
    def __init__(self, agent_name: _Optional[str] = ..., message: _Optional[str] = ..., timestamp: _Optional[str] = ...) -> None: ...

class AgentQueryResponse(_message.Message):
    __slots__ = ("response", "traces", "memory_updated", "responding_agent", "session_id")
    RESPONSE_FIELD_NUMBER: _ClassVar[int]
    TRACES_FIELD_NUMBER: _ClassVar[int]
    MEMORY_UPDATED_FIELD_NUMBER: _ClassVar[int]
    RESPONDING_AGENT_FIELD_NUMBER: _ClassVar[int]
    SESSION_ID_FIELD_NUMBER: _ClassVar[int]
    response: str
    traces: _containers.RepeatedCompositeFieldContainer[AgentTrace]
    memory_updated: bool
    responding_agent: str
    session_id: str
    def __init__(self, response: _Optional[str] = ..., traces: _Optional[_Iterable[_Union[AgentTrace, _Mapping]]] = ..., memory_updated: _Optional[bool] = ..., responding_agent: _Optional[str] = ..., session_id: _Optional[str] = ...) -> None: ...

class AgentStreamChunk(_message.Message):
    __slots__ = ("chunk_text", "is_final", "agent_name")
    CHUNK_TEXT_FIELD_NUMBER: _ClassVar[int]
    IS_FINAL_FIELD_NUMBER: _ClassVar[int]
    AGENT_NAME_FIELD_NUMBER: _ClassVar[int]
    chunk_text: str
    is_final: bool
    agent_name: str
    def __init__(self, chunk_text: _Optional[str] = ..., is_final: _Optional[bool] = ..., agent_name: _Optional[str] = ...) -> None: ...

class ClearSessionRequest(_message.Message):
    __slots__ = ("session_id",)
    SESSION_ID_FIELD_NUMBER: _ClassVar[int]
    session_id: str
    def __init__(self, session_id: _Optional[str] = ...) -> None: ...

class ClearSessionResponse(_message.Message):
    __slots__ = ("success", "message")
    SUCCESS_FIELD_NUMBER: _ClassVar[int]
    MESSAGE_FIELD_NUMBER: _ClassVar[int]
    success: bool
    message: str
    def __init__(self, success: _Optional[bool] = ..., message: _Optional[str] = ...) -> None: ...
