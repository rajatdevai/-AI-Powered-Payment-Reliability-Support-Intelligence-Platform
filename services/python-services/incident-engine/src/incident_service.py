import sys
import os
import logging
import json
from datetime import datetime
import grpc

# Add generated stubs to Python path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../shared/protobuf/generated/python")))

import incident_pb2
import incident_pb2_grpc

from src.db import get_active_incidents, get_incident_by_id

logger = logging.getLogger("incident-engine.service")

class IncidentServiceServicer(incident_pb2_grpc.IncidentServiceServicer):
    def GetActiveIncidents(self, request, context):
        route = request.route_key
        logger.info(f"gRPC GetActiveIncidents called for route: {route}")
        incidents = get_active_incidents(route)
        
        summaries = []
        for inc in incidents:
            created_at_str = inc["created_at"].isoformat() + "Z" if isinstance(inc["created_at"], datetime) else str(inc["created_at"])
            summaries.append(incident_pb2.IncidentSummary(
                incident_id=inc["id"],
                route=inc["route"],
                severity=inc["severity"],
                status=inc["status"],
                description=inc["description"],
                created_at=created_at_str,
                affected_users_count=inc.get("affected_users_count") or 0
            ))
            
        return incident_pb2.GetIncidentsResponse(incidents=summaries, total=len(summaries))

    def GetAllActiveIncidents(self, request, context):
        logger.info("gRPC GetAllActiveIncidents called")
        incidents = get_active_incidents()
        
        summaries = []
        for inc in incidents:
            created_at_str = inc["created_at"].isoformat() + "Z" if isinstance(inc["created_at"], datetime) else str(inc["created_at"])
            summaries.append(incident_pb2.IncidentSummary(
                incident_id=inc["id"],
                route=inc["route"],
                severity=inc["severity"],
                status=inc["status"],
                description=inc["description"],
                created_at=created_at_str,
                affected_users_count=inc.get("affected_users_count") or 0
            ))
            
        return incident_pb2.GetIncidentsResponse(incidents=summaries, total=len(summaries))

    def GetIncidentById(self, request, context):
        inc_id = request.incident_id
        logger.info(f"gRPC GetIncidentById called for ID: {inc_id}")
        inc = get_incident_by_id(inc_id)
        if not inc:
            context.set_code(grpc.StatusCode.NOT_FOUND)
            context.set_details(f"Incident with ID {inc_id} not found")
            return incident_pb2.IncidentDetail()

        created_str = inc["created_at"].isoformat() + "Z" if isinstance(inc["created_at"], datetime) else str(inc["created_at"])
        resolved_str = inc["resolved_at"].isoformat() + "Z" if isinstance(inc["resolved_at"], datetime) else str(inc["resolved_at"]) if inc.get("resolved_at") else ""
        
        # Parse blast radius
        br = inc.get("blast_radius")
        if isinstance(br, str):
            try:
                br = json.loads(br)
            except Exception:
                br = {}
        elif not br:
            br = {}

        blast_radius_pb = incident_pb2.BlastRadius(
            affected_routes=br.get("affected_routes", []),
            affected_banks=br.get("affected_banks", []),
            affected_psps=br.get("affected_psps", []),
            affected_merchants=br.get("affected_merchants", []),
            affected_users_count=br.get("affected_users_count", 0),
            estimated_txn_impact=br.get("estimated_txn_impact", 0)
        )

        return incident_pb2.IncidentDetail(
            incident_id=inc["id"],
            route=inc["route"],
            severity=inc["severity"],
            status=inc["status"],
            description=inc["description"],
            root_cause=inc.get("root_cause") or "",
            created_at=created_str,
            resolved_at=resolved_str,
            affected_users_count=inc.get("affected_users_count") or 0,
            affected_merchants_count=inc.get("affected_merchants_count") or 0,
            blast_radius=blast_radius_pb
        )
