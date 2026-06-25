// =============================================================================
// PRISM — Neo4j Topology Seed
// =============================================================================
// Run against a local Neo4j instance:
//   neo4j-shell -file seed.cypher
//   OR paste into Neo4j Browser
//
// Node labels: Bank, PSP, Gateway, NPCI, Merchant, Incident
// Relationships: USES, ROUTES_TO, CONNECTS_TO, IMPACTS
// =============================================================================

// ── CLEAR existing topology (dev only — never run on prod) ───────────────────
MATCH (n) DETACH DELETE n;

// =============================================================================
// 1. NODES — Banks
// =============================================================================

CREATE (:Bank {
  id: 'HDFC',
  name: 'HDFC Bank',
  code: 'HDFC',
  type: 'PRIVATE',
  ifsc_prefix: 'HDFC',
  neft_member: true,
  rtgs_member: true,
  imps_member: true
});

CREATE (:Bank {
  id: 'ICICI',
  name: 'ICICI Bank',
  code: 'ICICI',
  type: 'PRIVATE',
  ifsc_prefix: 'ICIC',
  neft_member: true,
  rtgs_member: true,
  imps_member: true
});

CREATE (:Bank {
  id: 'SBI',
  name: 'State Bank of India',
  code: 'SBI',
  type: 'PUBLIC',
  ifsc_prefix: 'SBIN',
  neft_member: true,
  rtgs_member: true,
  imps_member: true
});

CREATE (:Bank {
  id: 'AXIS',
  name: 'Axis Bank',
  code: 'AXIS',
  type: 'PRIVATE',
  ifsc_prefix: 'UTIB',
  neft_member: true,
  rtgs_member: true,
  imps_member: true
});

CREATE (:Bank {
  id: 'YESBANK',
  name: 'Yes Bank',
  code: 'YESBANK',
  type: 'PRIVATE',
  ifsc_prefix: 'YESB',
  neft_member: true,
  rtgs_member: true,
  imps_member: true
});

// =============================================================================
// 2. NODES — NPCI (Central Payment Switch)
// =============================================================================

CREATE (:NPCI {
  id: 'NPCI_SWITCH',
  name: 'NPCI UPI Switch',
  type: 'PAYMENT_SWITCH',
  protocols: ['UPI', 'IMPS', 'NACH'],
  sla_uptime_target: 99.95
});

// =============================================================================
// 3. NODES — PSPs (Payment Service Providers)
// =============================================================================

CREATE (:PSP {
  id: 'RAZORPAY',
  name: 'Razorpay',
  type: 'PAYMENT_GATEWAY',
  primary_bank: 'ICICI'
});

CREATE (:PSP {
  id: 'PAYU',
  name: 'PayU India',
  type: 'PAYMENT_GATEWAY',
  primary_bank: 'HDFC'
});

CREATE (:PSP {
  id: 'CASHFREE',
  name: 'Cashfree Payments',
  type: 'PAYMENT_GATEWAY',
  primary_bank: 'AXIS'
});

CREATE (:PSP {
  id: 'PHONEPE_PSP',
  name: 'PhonePe PSP',
  type: 'UPI_PSP',
  primary_bank: 'YESBANK'
});

// =============================================================================
// 4. NODES — Merchants
// =============================================================================

CREATE (:Merchant {
  id: 'AMAZON_IN',
  name: 'Amazon India',
  category: 'E-COMMERCE',
  psp: 'RAZORPAY'
});

CREATE (:Merchant {
  id: 'SWIGGY',
  name: 'Swiggy',
  category: 'FOOD_DELIVERY',
  psp: 'RAZORPAY'
});

CREATE (:Merchant {
  id: 'ZOMATO',
  name: 'Zomato',
  category: 'FOOD_DELIVERY',
  psp: 'PAYU'
});

CREATE (:Merchant {
  id: 'FLIPKART',
  name: 'Flipkart',
  category: 'E-COMMERCE',
  psp: 'PAYU'
});

CREATE (:Merchant {
  id: 'UBER_IN',
  name: 'Uber India',
  category: 'TRANSPORT',
  psp: 'CASHFREE'
});

// =============================================================================
// 5. RELATIONSHIPS — Bank → NPCI (all banks route through NPCI)
// =============================================================================

MATCH (b:Bank), (npci:NPCI {id: 'NPCI_SWITCH'})
CREATE (b)-[:ROUTES_TO {
  protocol: 'UPI',
  timeout_ms: 5000,
  sla_uptime: 99.9
}]->(npci);

// =============================================================================
// 6. RELATIONSHIPS — NPCI → Bank (inbound settlement)
// =============================================================================

MATCH (npci:NPCI {id: 'NPCI_SWITCH'}), (b:Bank)
CREATE (npci)-[:ROUTES_TO {
  protocol: 'UPI',
  direction: 'SETTLEMENT'
}]->(b);

// =============================================================================
// 7. RELATIONSHIPS — PSP → Bank (PSP uses bank as sponsor)
// =============================================================================

MATCH (psp:PSP {id: 'RAZORPAY'}), (bank:Bank {id: 'ICICI'})
CREATE (psp)-[:USES {role: 'SPONSOR_BANK', settlement: 'T+1'}]->(bank);

MATCH (psp:PSP {id: 'PAYU'}), (bank:Bank {id: 'HDFC'})
CREATE (psp)-[:USES {role: 'SPONSOR_BANK', settlement: 'T+1'}]->(bank);

MATCH (psp:PSP {id: 'CASHFREE'}), (bank:Bank {id: 'AXIS'})
CREATE (psp)-[:USES {role: 'SPONSOR_BANK', settlement: 'T+1'}]->(bank);

MATCH (psp:PSP {id: 'PHONEPE_PSP'}), (bank:Bank {id: 'YESBANK'})
CREATE (psp)-[:USES {role: 'SPONSOR_BANK', settlement: 'T+1'}]->(bank);

// =============================================================================
// 8. RELATIONSHIPS — Merchant → PSP (merchant uses PSP for collection)
// =============================================================================

MATCH (m:Merchant {id: 'AMAZON_IN'}), (psp:PSP {id: 'RAZORPAY'})
CREATE (m)-[:USES {role: 'PAYMENT_COLLECTION', contract: 'ENTERPRISE'}]->(psp);

MATCH (m:Merchant {id: 'SWIGGY'}), (psp:PSP {id: 'RAZORPAY'})
CREATE (m)-[:USES {role: 'PAYMENT_COLLECTION', contract: 'STANDARD'}]->(psp);

MATCH (m:Merchant {id: 'ZOMATO'}), (psp:PSP {id: 'PAYU'})
CREATE (m)-[:USES {role: 'PAYMENT_COLLECTION', contract: 'STANDARD'}]->(psp);

MATCH (m:Merchant {id: 'FLIPKART'}), (psp:PSP {id: 'PAYU'})
CREATE (m)-[:USES {role: 'PAYMENT_COLLECTION', contract: 'ENTERPRISE'}]->(psp);

MATCH (m:Merchant {id: 'UBER_IN'}), (psp:PSP {id: 'CASHFREE'})
CREATE (m)-[:USES {role: 'PAYMENT_COLLECTION', contract: 'STANDARD'}]->(psp);

// =============================================================================
// 9. VERIFY — Check topology was created correctly
// =============================================================================

MATCH path = (m:Merchant)-[:USES]->(psp:PSP)-[:USES]->(bank:Bank)-[:ROUTES_TO]->(npci:NPCI)-[:ROUTES_TO]->(dest:Bank)
RETURN
  m.name AS merchant,
  psp.name AS psp,
  bank.name AS sender_bank,
  npci.name AS switch,
  dest.name AS receiver_bank
LIMIT 10;

// =============================================================================
// BLAST RADIUS QUERY TEMPLATE
// Used by blast-radius-engine when an incident is created on a route.
//
// Example: Find everything impacted when HDFC has an incident
// =============================================================================

// MATCH (incident_bank:Bank {id: 'HDFC'})
// MATCH (incident_bank)<-[:USES]-(psp:PSP)
// MATCH (psp)<-[:USES]-(merchant:Merchant)
// MATCH (incident_bank)-[:ROUTES_TO]->(npci:NPCI)
// RETURN
//   collect(DISTINCT psp.id) AS affected_psps,
//   collect(DISTINCT merchant.id) AS affected_merchants,
//   count(DISTINCT merchant) AS merchant_count;
