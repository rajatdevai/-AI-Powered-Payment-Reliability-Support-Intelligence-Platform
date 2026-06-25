"""
Backfill script: Create support cases in Neon DB for all existing FAILED/TIMEOUT
transactions that don't already have a support case.
Run: python backfill_support_cases.py
"""
import psycopg2
import uuid
from datetime import datetime, timezone

DB_URL = "postgresql://neondb_owner:npg_VsLT9Px7nOcX@ep-royal-waterfall-at9ob7h6-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require"

def run():
    conn = psycopg2.connect(DB_URL, connect_timeout=15)
    conn.autocommit = False
    cur = conn.cursor()

    # Find all failed/timeout transactions that have NO support case yet
    cur.execute("""
        SELECT
            t.id::text,
            t.amount,
            t.currency,
            t.sender_bank,
            t.receiver_bank,
            t.status,
            t.error_code,
            t.error_message,
            COALESCE(t.expected_reversal, CASE WHEN t.status = 'TIMEOUT' THEN '15 minutes' ELSE '2 hours' END) AS expected_reversal,
            t.root_cause,
            t.affected_component,
            t.rca_confidence,
            t.created_at
        FROM transactions t
        LEFT JOIN support_cases sc ON sc.transaction_id = t.id
        WHERE t.status IN ('FAILED', 'TIMEOUT')
          AND sc.id IS NULL
        ORDER BY t.created_at DESC
    """)
    rows = cur.fetchall()
    print(f"Found {len(rows)} failed transactions without support cases. Creating cases...")

    created = 0
    for row in rows:
        (tx_id, amount, currency, sender, receiver, status,
         error_code, error_msg, refund_eta, root_cause,
         affected_comp, rca_conf, created_at) = row

        case_id = str(uuid.uuid4())
        amount_fmt = f"₹{float(amount):,.0f}"

        # Build AI summary from real transaction data
        rca_summary = (
            f"Payment {status.lower()} due to {error_msg or 'gateway error'} "
            f"(Error: {error_code or 'UNKNOWN'}). "
            f"Root cause: {root_cause or 'Under investigation'}. "
            f"Affected component: {affected_comp or 'Unknown'}."
        )

        suggested_response = (
            f"Dear Customer, your payment of {amount_fmt} {currency} from {sender} to {receiver} "
            f"has {status.lower()} due to {error_msg or 'a technical error'}. "
            f"Your funds are safe. Reversal SLA has been triggered and your money will be "
            f"refunded within {refund_eta}."
        )

        escalation_rec = (
            f"Verify {sender}→{receiver} route connectivity. "
            f"RCA confidence: {int((rca_conf or 0) * 100)}%. "
            f"{'Escalate to Tier-2 for manual reconciliation.' if (rca_conf or 1) < 0.85 else 'Standard auto-reversal applies.'}"
        )

        # Determine status
        case_status = 'OPEN'
        if rca_conf and rca_conf >= 0.9:
            case_status = 'IN_PROGRESS'

        cur.execute("""
            INSERT INTO support_cases
                (id, transaction_id, customer_id, agent_id, status,
                 ai_rca_summary, ai_suggested_response, ai_escalation_recommendation,
                 refund_eta, notes, created_at, updated_at)
            VALUES (%s, %s::uuid, NULL, NULL, %s, %s, %s, %s, %s, %s, NOW(), NOW())
            ON CONFLICT DO NOTHING
        """, (
            case_id, tx_id, case_status,
            rca_summary, suggested_response, escalation_rec,
            refund_eta,
            'Auto-generated case from backfill script.'
        ))
        created += 1
        if created % 10 == 0:
            print(f"  Created {created}/{len(rows)} cases...")

    conn.commit()
    cur.close()
    conn.close()
    print(f"\n✅ Done! Created {created} support cases in Neon DB.")

if __name__ == "__main__":
    run()
