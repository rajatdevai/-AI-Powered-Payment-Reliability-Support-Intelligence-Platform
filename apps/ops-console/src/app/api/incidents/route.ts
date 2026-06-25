import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

const MOCK_INCIDENTS = [
  {
    id: 'inc-3001',
    route: 'YESBANK_HDFC',
    severity: 'CRITICAL',
    status: 'ACTIVE',
    affected_users_count: 145,
    affected_merchants_count: 12,
    blast_radius: {
      affected_routes: ['YESBANK_HDFC', 'HDFC_YESBANK'],
      affected_psps: ['YES_PSP', 'HDFC_PSP'],
      affected_banks: ['YESBANK', 'HDFC'],
      affected_merchants: ['Swiggy', 'Zomato', 'Amazon'],
      affected_users: 145
    },
    description: 'HDFC issuer gateway experiencing 100% packet loss. All routing attempts timed out.',
    root_cause: 'HDFC switch hardware overload',
    created_at: new Date(Date.now() - 1200000).toISOString(),
    resolved_at: null
  },
  {
    id: 'inc-3002',
    route: 'SBI_ICICI',
    severity: 'HIGH',
    status: 'ACTIVE',
    affected_users_count: 68,
    affected_merchants_count: 4,
    blast_radius: {
      affected_routes: ['SBI_ICICI'],
      affected_psps: ['SBI_PSP'],
      affected_banks: ['SBI', 'ICICI'],
      affected_merchants: ['Flipkart', 'Uber'],
      affected_users: 68
    },
    description: 'Cryptographic signature mismatch during transaction confirmation handshake.',
    root_cause: 'ICICI hardware security module mismatch',
    created_at: new Date(Date.now() - 3600000).toISOString(),
    resolved_at: null
  },
  {
    id: 'inc-3003',
    route: 'AXIS_SBI',
    severity: 'LOW',
    status: 'RESOLVED',
    affected_users_count: 15,
    affected_merchants_count: 2,
    blast_radius: {
      affected_routes: ['AXIS_SBI'],
      affected_psps: ['AXIS_PSP'],
      affected_banks: ['AXIS', 'SBI'],
      affected_merchants: ['Ola'],
      affected_users: 15
    },
    description: 'High network latency of 3200ms detected on NPCI switch switchboard.',
    root_cause: 'NPCI network routing congestion',
    created_at: new Date(Date.now() - 7200000).toISOString(),
    resolved_at: new Date(Date.now() - 5400000).toISOString()
  }
];

export async function GET() {
  try {
    const incidents = await db.incident.findMany({
      orderBy: {
        created_at: 'desc',
      },
    });

    if (incidents.length === 0) {
      return NextResponse.json(MOCK_INCIDENTS);
    }

    return NextResponse.json(incidents);
  } catch (error) {
    console.error('Failed to fetch incidents from database, using mock fallback:', error);
    return NextResponse.json(MOCK_INCIDENTS);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { incidentId, status } = body;

    if (!incidentId || !status) {
      return NextResponse.json({ error: 'Missing incidentId or status' }, { status: 400 });
    }

    try {
      const updatedIncident = await db.incident.update({
        where: { id: incidentId },
        data: {
          status,
          resolved_at: status === 'RESOLVED' ? new Date() : null,
        },
      });
      return NextResponse.json(updatedIncident);
    } catch {
      // Fallback for mocks
      const mockInc = MOCK_INCIDENTS.find(i => i.id === incidentId);
      if (mockInc) {
        const updated = {
          ...mockInc,
          status,
          resolved_at: status === 'RESOLVED' ? new Date().toISOString() : null,
        };
        return NextResponse.json(updated);
      }
      return NextResponse.json({ error: 'Incident not found' }, { status: 404 });
    }
  } catch (error) {
    console.error('Failed to resolve incident:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
