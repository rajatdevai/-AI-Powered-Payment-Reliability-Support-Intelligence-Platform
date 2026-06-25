import logging
import uuid
import requests
from datetime import datetime
from typing import TypedDict, Optional, List, Dict, Any
from langgraph.graph import StateGraph, END
from openai import OpenAI

from src.config import settings
from src.db import (
    get_transaction_context,
    get_incident_context,
    get_latest_failed_transaction,
    get_recent_transactions,
)
from src.qdrant_service import search_knowledge_base
from src.redis_iris import get_session_history, save_session_history

logger = logging.getLogger("agent-service.graph")

class AgentState(TypedDict):
    session_id: str
    persona: str
    message: str
    history: List[Dict[str, str]]
    rewritten_query: str
    intent: str
    transaction_id: Optional[str]
    incident_id: Optional[str]
    current_agent: str
    response: str
    traces: List[Dict[str, str]]

def add_trace(state: AgentState, agent_name: str, message: str) -> None:
    state["traces"].append({
        "agent_name": agent_name,
        "message": message,
        "timestamp": datetime.utcnow().isoformat() + "Z"
    })

def call_openai_llm(messages: List[Dict[str, str]]) -> str:
    if not settings.OPENAI_API_KEY:
        logger.warning("OPENAI_API_KEY is not configured. Bypassing LLM call.")
        return ""
    try:
        client = OpenAI(api_key=settings.OPENAI_API_KEY)
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            temperature=0.1,
            max_tokens=500
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        logger.error(f"Error calling OpenAI API: {e}")
        return ""

# -----------------------------------------------------------
# AGENT NODES
# -----------------------------------------------------------

def query_rewriter_node(state: AgentState) -> Dict[str, Any]:
    add_trace(state, "QueryRewriter", "Rewriting query for context.")
    history_text = "\n".join([f"{msg['role']}: {msg['content']}" for msg in state.get("history", [])[-4:]])
    prompt = (
        "You are an expert query rewriter. Rewrite the latest user query to be fully standalone, "
        "resolving any pronouns or references based on the conversation history.\n"
        "If the query is already standalone, return it exactly as is.\n"
        f"History:\n{history_text}\n"
        f"Latest Query: {state['message']}\n"
        "Rewritten Query:"
    )
    rewritten = call_openai_llm([{"role": "user", "content": prompt}])
    if not rewritten:
        rewritten = state["message"]
    
    add_trace(state, "QueryRewriter", f"Rewritten query: {rewritten}")
    return {"rewritten_query": rewritten, "traces": state["traces"]}

def intent_router_node(state: AgentState) -> Dict[str, Any]:
    add_trace(state, "IntentRouter", "Classifying query intent deterministically.")
    prompt = (
        "Classify the following user query into exactly ONE of these intents:\n"
        "1. TRANSACTION_INQUIRY: Questions about a specific payment, why it failed, refund status, or transaction details.\n"
        "2. ROUTE_HEALTH: Questions about the safety, status, or health of a specific bank route (e.g., 'Is HDFC to YESBANK safe?', 'When will it be healthy?').\n"
        "3. POLICY_FAQ: Questions about platform rules, SOPs, refund policies, or SLAs.\n"
        "4. GENERAL_BANKING: General knowledge questions about banking terms (e.g., BR, SGL, GST) or simple greetings.\n"
        f"Query: {state['rewritten_query']}\n"
        "Respond with ONLY the exact intent name from the list above (e.g. TRANSACTION_INQUIRY)."
    )
    intent = call_openai_llm([{"role": "user", "content": prompt}]).strip().upper()
    
    # Fallback/validation
    valid_intents = ["TRANSACTION_INQUIRY", "ROUTE_HEALTH", "POLICY_FAQ", "GENERAL_BANKING"]
    found_intent = "GENERAL_BANKING"
    for v in valid_intents:
        if v in intent:
            found_intent = v
            break
            
    # Map intent to next node
    node_map = {
        "TRANSACTION_INQUIRY": "TransactionAgent",
        "ROUTE_HEALTH": "NetworkHealthAgent",
        "POLICY_FAQ": "PolicyAgent",
        "GENERAL_BANKING": "GeneralAgent"
    }
    
    next_node = node_map[found_intent]
    add_trace(state, "IntentRouter", f"Intent classified as {found_intent}. Routing to {next_node}.")
    return {"intent": found_intent, "current_agent": next_node, "traces": state["traces"]}

def transaction_agent_node(state: AgentState) -> Dict[str, Any]:
    add_trace(state, "TransactionAgent", "Fetching transaction context (recent + specific/failed).")
    tx_id = state.get("transaction_id")
    
    # 1. Fetch specific or latest failed for deep context
    failed_tx = None
    if tx_id:
        failed_tx = get_transaction_context(tx_id)
    if not failed_tx:
        failed_tx = get_latest_failed_transaction()
        
    # 2. Fetch recent transactions for broader queries
    recent_txs = get_recent_transactions(10)
        
    sops = []
    if failed_tx:
        query_text = f"{failed_tx.get('error_code', '')} {failed_tx.get('error_message', '')} {failed_tx.get('root_cause', '')}"
        sops = search_knowledge_base(query_text.strip() or "payment failure")
    
    context_parts = []
    
    if recent_txs:
        context_parts.append("=== RECENT TRANSACTIONS ===")
        for rt in recent_txs:
            status = rt.get("status")
            amt = rt.get("amount")
            cur = rt.get("currency")
            context_parts.append(f"ID: {rt.get('id')} | Status: {status} | Amount: {amt} {cur} | {rt.get('sender_bank')}->{rt.get('receiver_bank')}")
            
    if failed_tx:
        context_parts.append(f"\n=== LATEST/SPECIFIC TRANSACTION DETAILS ({failed_tx.get('id')}) ===")
        context_parts.append(f"Status         : {failed_tx.get('status')}")
        context_parts.append(f"Amount         : {failed_tx.get('amount')} {failed_tx.get('currency')}")
        context_parts.append(f"Sender Bank    : {failed_tx.get('sender_bank')}")
        context_parts.append(f"Receiver Bank  : {failed_tx.get('receiver_bank')}")
        context_parts.append(f"Error Code     : {failed_tx.get('error_code') or 'N/A'}")
        context_parts.append(f"Error Message  : {failed_tx.get('error_message') or 'N/A'}")
        context_parts.append(f"Root Cause     : {failed_tx.get('root_cause') or 'Pending'}")
        context_parts.append(f"Refund ETA     : {failed_tx.get('refund_eta') or '24 hours'}")
        if "BPO" in state["persona"].upper():
            rca_conf = failed_tx.get("rca_confidence")
            conf_str = f"{int(rca_conf * 100)}%" if rca_conf else "N/A"
            context_parts.append(f"RCA Confidence : {conf_str}\n")
            
    if not recent_txs and not failed_tx:
        context_parts.append("No transaction data found in database.")

    context_text = "\n".join(context_parts)
    
    if "BPO" in state["persona"].upper():
        prompt = (
            "You are the PRISM BPO Support Copilot. Answer the BPO agent's query using ONLY the transaction context below. "
            "IMPORTANT INSTRUCTIONS:\n"
            "- If the user asks a SPECIFIC question (like 'what is the reversal time', 'what is the error code'), answer ONLY that question directly and concisely.\n"
            "- If the user asks for a general summary, analysis, or 'tell me about this failure', format exactly as:\n"
            "  1. Case Summary\n  2. Suggested Customer Response\n  3. Escalation Recommendation (escalate if RCA confidence < 80%).\n"
            "- If the query is about general transactions (e.g. 'show successes'), summarize the RECENT TRANSACTIONS block.\n\n"
            f"Context:\n{context_text}\n\nQuery: {state['rewritten_query']}"
        )
    else:
        prompt = (
            "You are the PRISM Customer Support Chatbot. Answer the customer's query using ONLY the transaction context below. "
            "Keep it concise, friendly, and professional. "
            "If they ask about a failed payment, state what happened, why, and refund ETA based on the SPECIFIC DETAILS block. "
            "If they ask about other transactions (e.g. 'tell me about successful ones'), summarize the RECENT TRANSACTIONS block.\n\n"
            f"Context:\n{context_text}\n\nQuery: {state['rewritten_query']}"
        )

    response = call_openai_llm([{"role": "user", "content": prompt}])
    if not response:
        response = "I encountered an error analyzing the transactions. Please contact human support."

    add_trace(state, "TransactionAgent", "Generated transaction response.")
    return {"response": response, "traces": state["traces"]}

def network_health_agent_node(state: AgentState) -> Dict[str, Any]:
    add_trace(state, "NetworkHealthAgent", "Fetching live simulator status from Orchestrator API.")
    try:
        res = requests.get("http://localhost:3010/debug/simulator-status", timeout=2)
        if res.status_code == 200:
            data = res.json()
            bank_status = data.get("bank_conditions", {})
            force_fails = data.get("force_fail_routes", {})
            
            context = "=== LIVE NETWORK STATUS ===\n"
            for bank, status in bank_status.items():
                context += f"{bank}: {status}\n"
            
            if force_fails:
                context += "\n=== ACTIVE ROUTE BLOCKAGES ===\n"
                for route, details in force_fails.items():
                    context += f"Route: {route}\nError: {details.get('error_code')} - {details.get('error_message')}\n"
            else:
                context += "\nNo active route blockages. All routes operating normally.\n"
        else:
            context = "Network status API returned an error."
    except Exception as e:
        context = f"Could not reach network status API: {e}"
        
    prompt = (
        "You are a network reliability assistant. Answer the user's question about network/route health using ONLY the Live Network Status below. "
        "If they ask about a specific route, check if it's in the blockages list. If they ask when it will be healthy, "
        "and it's currently blocked, inform them that emergency maintenance is ongoing and they should check back later. "
        "If it is healthy, state that it is safe to use.\n\n"
        f"Context:\n{context}\n\n"
        f"User Query: {state['rewritten_query']}"
    )
    
    response = call_openai_llm([{"role": "user", "content": prompt}])
    if not response:
        response = "I am currently unable to fetch live network telemetry. Please try again later."
        
    add_trace(state, "NetworkHealthAgent", "Generated network health response.")
    return {"response": response, "traces": state["traces"]}

def policy_agent_node(state: AgentState) -> Dict[str, Any]:
    add_trace(state, "PolicyAgent", "Searching knowledge base for policies.")
    sops = search_knowledge_base(state["rewritten_query"])
    context = "=== STANDARD OPERATING PROCEDURES ===\n"
    if not sops:
        context += "No specific policies found.\n"
    for s in sops[:3]:
        context += f"[{s['title']}]: {s['content']}\n"
        
    prompt = (
        "You are a helpful policy assistant. Answer the user's question using ONLY the provided SOPs below. "
        "If the answer is not in the SOPs, say you do not have that policy information.\n\n"
        f"Context:\n{context}\n\n"
        f"User Query: {state['rewritten_query']}"
    )
    response = call_openai_llm([{"role": "user", "content": prompt}])
    if not response:
        response = "I could not locate the requested policy information."
        
    add_trace(state, "PolicyAgent", "Generated policy response.")
    return {"response": response, "traces": state["traces"]}

def general_agent_node(state: AgentState) -> Dict[str, Any]:
    add_trace(state, "GeneralAgent", "Answering general banking/greeting query.")
    prompt = (
        "You are PRISM's helpful banking assistant. Answer the user's general banking question "
        "(e.g., what is BR, SGL, GST, etc.) or respond to their greeting. Do not hallucinate transaction statuses.\n"
        f"User Query: {state['rewritten_query']}"
    )
    response = call_openai_llm([{"role": "user", "content": prompt}])
    if not response:
        response = "Hello! How can I help you today?"
        
    add_trace(state, "GeneralAgent", "Generated general response.")
    return {"response": response, "traces": state["traces"]}

# -----------------------------------------------------------
# LANGGRAPH STATE GRAPH COMPILATION
# -----------------------------------------------------------

workflow = StateGraph(AgentState)

workflow.add_node("QueryRewriter", query_rewriter_node)
workflow.add_node("IntentRouter", intent_router_node)
workflow.add_node("TransactionAgent", transaction_agent_node)
workflow.add_node("NetworkHealthAgent", network_health_agent_node)
workflow.add_node("PolicyAgent", policy_agent_node)
workflow.add_node("GeneralAgent", general_agent_node)

workflow.set_entry_point("QueryRewriter")
workflow.add_edge("QueryRewriter", "IntentRouter")

def route_next(state: AgentState) -> str:
    return state["current_agent"]

workflow.add_conditional_edges(
    "IntentRouter",
    route_next,
    {
        "TransactionAgent": "TransactionAgent",
        "NetworkHealthAgent": "NetworkHealthAgent",
        "PolicyAgent": "PolicyAgent",
        "GeneralAgent": "GeneralAgent"
    }
)

workflow.add_edge("TransactionAgent", END)
workflow.add_edge("NetworkHealthAgent", END)
workflow.add_edge("PolicyAgent", END)
workflow.add_edge("GeneralAgent", END)

graph = workflow.compile()

def run_agent_workflow(
    session_id: str,
    persona: str,
    message: str,
    transaction_id: Optional[str] = None,
    incident_id: Optional[str] = None
) -> Dict[str, Any]:
    history = get_session_history(session_id)

    state = {
        "session_id": session_id,
        "persona": persona,
        "message": message,
        "history": history,
        "rewritten_query": "",
        "intent": "",
        "transaction_id": transaction_id,
        "incident_id": incident_id,
        "current_agent": "",
        "response": "",
        "traces": [],
    }

    output = graph.invoke(state)

    new_history = history + [
        {"role": "user", "content": message},
        {"role": "assistant", "content": output["response"]}
    ]
    save_session_history(session_id, new_history)

    return {
        "response": output["response"],
        "traces": output["traces"],
        "responding_agent": output["current_agent"],
        "intent": output.get("intent", "UNKNOWN"),
        "rewritten_query": output.get("rewritten_query", ""),
    }
