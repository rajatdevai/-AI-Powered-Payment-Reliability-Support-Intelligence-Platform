import sys
import os
import logging
from datetime import datetime
import grpc
from concurrent import futures

# Add the generated stubs directory to the Python path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../shared/protobuf/generated/python")))

import prediction_pb2
import prediction_pb2_grpc

from src.db import get_active_incidents
from src.redis_client import (
    get_route_health,
    get_bank_health,
    get_cached_prediction,
    set_cached_prediction
)

logger = logging.getLogger("prediction-engine.service")

DEFAULT_ROUTE_SCORES = {
    "HDFC_ICICI": 98, "HDFC_SBI": 95, "HDFC_AXIS": 97, "HDFC_YESBANK": 91,
    "ICICI_HDFC": 97, "ICICI_SBI": 94, "ICICI_AXIS": 96, "ICICI_YESBANK": 90,
    "SBI_HDFC": 93, "SBI_ICICI": 93, "SBI_AXIS": 92, "SBI_YESBANK": 88,
    "AXIS_HDFC": 96, "AXIS_ICICI": 95, "AXIS_SBI": 93, "AXIS_YESBANK": 90,
    "YESBANK_HDFC": 90, "YESBANK_ICICI": 89, "YESBANK_SBI": 87, "YESBANK_AXIS": 89,
}

class PredictionServiceServicer(prediction_pb2_grpc.PredictionServiceServicer):
    def PredictPaymentSuccess(self, request, context):
        sender = request.sender_bank
        receiver = request.receiver_bank
        amount = request.amount
        route_key = f"{sender}_{receiver}"

        # 1. Check Redis Cache
        cached_res = get_cached_prediction(sender, receiver, amount)
        if cached_res:
            return prediction_pb2.PredictResponse(
                route_key=cached_res["route_key"],
                success_probability=cached_res["success_probability"],
                risk_level=cached_res["risk_level"],
                recommendation=cached_res["recommendation"],
                route_health_score=cached_res["route_health_score"],
                active_incidents=cached_res["active_incidents"],
                cached=True,
                generated_at=cached_res["generated_at"]
            )

        # 2. Get base route health
        route_health = get_route_health(route_key)
        base_score = route_health["health_score"] if route_health else DEFAULT_ROUTE_SCORES.get(route_key, 90.0)

        # 3. Apply bank health penalties
        sender_health = get_bank_health(sender)
        receiver_health = get_bank_health(receiver)

        if sender_health and sender_health["health_score"] < 90:
            base_score *= (sender_health["health_score"] / 100.0)
        if receiver_health and receiver_health["health_score"] < 90:
            base_score *= (receiver_health["health_score"] / 100.0)

        # 4. Fetch active incidents from Postgres
        incidents = get_active_incidents(route_key)
        active_incident_ids = []
        for inc in incidents:
            active_incident_ids.append(inc["id"])
            severity = inc.get("severity", "LOW").upper()
            if severity == "CRITICAL":
                base_score *= 0.50
            elif severity == "HIGH":
                base_score *= 0.70
            else:
                base_score *= 0.90

        # 5. Amount penalties
        if amount >= 50000:
            base_score *= 0.96
        elif amount >= 10000 and base_score < 90:
            base_score *= 0.97

        # 6. Clamp
        success_prob = max(5.0, min(99.0, base_score))
        success_prob = round(success_prob, 1)

        # 7. Risk Level and Recommendation
        if success_prob > 85:
            risk_level = "LOW"
            recommendation = "Safe to proceed."
        elif success_prob > 65:
            risk_level = "MEDIUM"
            recommendation = "Moderate risk. Consider retrying if this fails."
        elif success_prob > 35:
            risk_level = "HIGH"
            recommendation = "Elevated failure risk. Consider switching sender account."
        else:
            risk_level = "CRITICAL"
            recommendation = "Route critically degraded. Do not proceed. Use alternate method."

        gen_at = datetime.utcnow().isoformat() + "Z"

        response_dict = {
            "route_key": route_key,
            "success_probability": success_prob,
            "risk_level": risk_level,
            "recommendation": recommendation,
            "route_health_score": float(route_health["health_score"]) if route_health else DEFAULT_ROUTE_SCORES.get(route_key, 90.0),
            "active_incidents": active_incident_ids,
            "generated_at": gen_at
        }

        # 8. Cache result in Redis
        set_cached_prediction(sender, receiver, amount, response_dict)

        return prediction_pb2.PredictResponse(
            route_key=response_dict["route_key"],
            success_probability=response_dict["success_probability"],
            risk_level=response_dict["risk_level"],
            recommendation=response_dict["recommendation"],
            route_health_score=response_dict["route_health_score"],
            active_incidents=response_dict["active_incidents"],
            cached=False,
            generated_at=response_dict["generated_at"]
        )

    def GetRouteHealth(self, request, context):
        route_key = request.route_key
        health = get_route_health(route_key)
        if not health:
            # Return realistic default health metrics
            default_score = DEFAULT_ROUTE_SCORES.get(route_key, 90.0)
            return prediction_pb2.RouteHealthResponse(
                route_key=route_key,
                health_score=default_score,
                success_rate=default_score,
                failure_rate=100.0 - default_score,
                timeout_rate=1.0,
                p95_ms=350.0,
                p99_ms=1100.0,
                total_transactions=100,
                last_updated=datetime.utcnow().isoformat() + "Z",
                has_active_incident=False
            )

        incidents = get_active_incidents(route_key)
        has_active_incident = len(incidents) > 0

        return prediction_pb2.RouteHealthResponse(
            route_key=health["route_key"],
            health_score=health["health_score"],
            success_rate=health["success_rate"],
            failure_rate=health["failure_rate"],
            timeout_rate=health["timeout_rate"],
            p95_ms=health["p95_ms"],
            p99_ms=health["p99_ms"],
            total_transactions=health["total_transactions"],
            last_updated=health["last_updated"],
            has_active_incident=has_active_incident
        )

    def GetAllRouteHealth(self, request, context):
        routes_list = []
        # Query health for all defined default routes
        for r_key in DEFAULT_ROUTE_SCORES.keys():
            health = get_route_health(r_key)
            if health:
                incidents = get_active_incidents(r_key)
                has_active_incident = len(incidents) > 0
                routes_list.append(prediction_pb2.RouteHealthResponse(
                    route_key=health["route_key"],
                    health_score=health["health_score"],
                    success_rate=health["success_rate"],
                    failure_rate=health["failure_rate"],
                    timeout_rate=health["timeout_rate"],
                    p95_ms=health["p95_ms"],
                    p99_ms=health["p99_ms"],
                    total_transactions=health["total_transactions"],
                    last_updated=health["last_updated"],
                    has_active_incident=has_active_incident
                ))
            else:
                default_score = DEFAULT_ROUTE_SCORES[r_key]
                routes_list.append(prediction_pb2.RouteHealthResponse(
                    route_key=r_key,
                    health_score=default_score,
                    success_rate=default_score,
                    failure_rate=100.0 - default_score,
                    timeout_rate=1.0,
                    p95_ms=350.0,
                    p99_ms=1100.0,
                    total_transactions=100,
                    last_updated=datetime.utcnow().isoformat() + "Z",
                    has_active_incident=False
                ))

        return prediction_pb2.AllRouteHealthResponse(routes=routes_list)
