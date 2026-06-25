import sys
import os
import logging
import grpc
import time

# Add generated stubs to Python path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../shared/protobuf/generated/python")))

import agent_pb2
import agent_pb2_grpc

from src.graph import run_agent_workflow
from src.redis_iris import clear_session_history

logger = logging.getLogger("agent-service.service")

PERSONA_MAP = {
    agent_pb2.Persona.CUSTOMER: "CUSTOMER",
    agent_pb2.Persona.BPO_AGENT: "BPO_AGENT",
    agent_pb2.Persona.OPS_ENGINEER: "OPS_ENGINEER",
}

class AgentServiceServicer(agent_pb2_grpc.AgentServiceServicer):
    def RunAgentQuery(self, request, context):
        logger.info(f"gRPC RunAgentQuery called. Session: {request.session_id}, Persona: {request.persona}")
        
        persona_str = PERSONA_MAP.get(request.persona, "CUSTOMER")
        tx_id = request.transaction_id if request.transaction_id else None
        inc_id = request.incident_id if request.incident_id else None
        
        try:
            res = run_agent_workflow(
                session_id=request.session_id,
                persona=persona_str,
                message=request.message,
                transaction_id=tx_id,
                incident_id=inc_id
            )
            
            pb_traces = [
                agent_pb2.AgentTrace(
                    agent_name=t["agent_name"],
                    message=t["message"],
                    timestamp=t["timestamp"]
                ) for t in res["traces"]
            ]
            
            return agent_pb2.AgentQueryResponse(
                response=res["response"],
                traces=pb_traces,
                memory_updated=True,
                responding_agent=res["responding_agent"],
                session_id=request.session_id
            )
        except Exception as e:
            logger.error(f"Error executing agent query: {e}")
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(str(e))
            return agent_pb2.AgentQueryResponse()

    def RunAgentQueryStream(self, request, context):
        logger.info(f"gRPC RunAgentQueryStream called. Session: {request.session_id}, Persona: {request.persona}")
        
        persona_str = PERSONA_MAP.get(request.persona, "CUSTOMER")
        tx_id = request.transaction_id if request.transaction_id else None
        inc_id = request.incident_id if request.incident_id else None

        try:
            res = run_agent_workflow(
                session_id=request.session_id,
                persona=persona_str,
                message=request.message,
                transaction_id=tx_id,
                incident_id=inc_id
            )
            
            # Simulate streaming words
            words = res["response"].split(" ")
            responding_agent = res["responding_agent"]
            
            for i, word in enumerate(words):
                # add space back
                chunk_text = word if i == 0 else " " + word
                is_final = (i == len(words) - 1)
                yield agent_pb2.AgentStreamChunk(
                    chunk_text=chunk_text,
                    is_final=is_final,
                    agent_name=responding_agent
                )
                time.sleep(0.03)
        except Exception as e:
            logger.error(f"Error in agent query stream: {e}")
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(str(e))

    def ClearSession(self, request, context):
        logger.info(f"gRPC ClearSession called for session: {request.session_id}")
        cleared = clear_session_history(request.session_id)
        return agent_pb2.ClearSessionResponse(
            success=cleared,
            message="Session memory cleared successfully" if cleared else "Failed to clear session memory"
        )
