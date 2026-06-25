import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { type, bank_code, condition } = body;

    if (!type || !condition) {
      return NextResponse.json({ error: 'Missing type or condition' }, { status: 400 });
    }

    const ORCHESTRATOR_URL = 'http://localhost:3010';

    if (type === 'BANK') {
      if (!bank_code) {
        return NextResponse.json({ error: 'Missing bank_code' }, { status: 400 });
      }

      try {
        const res = await fetch(`${ORCHESTRATOR_URL}/debug/bank-condition`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bank_code, condition }),
        });

        if (res.ok) {
          const data = await res.json();
          return NextResponse.json({ success: true, ...data });
        }
      } catch (err) {
        console.warn('Orchestrator bank-condition debug endpoint unreachable. Emulating locally.');
      }

      return NextResponse.json({
        success: true,
        message: `[Mocked] Successfully set bank ${bank_code} condition to ${condition}`,
        local: true
      });
    } else if (type === 'NPCI') {
      try {
        const res = await fetch(`${ORCHESTRATOR_URL}/debug/npci-condition`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ condition }),
        });

        if (res.ok) {
          const data = await res.json();
          return NextResponse.json({ success: true, ...data });
        }
      } catch (err) {
        console.warn('Orchestrator npci-condition debug endpoint unreachable. Emulating locally.');
      }

      return NextResponse.json({
        success: true,
        message: `[Mocked] Successfully set NPCI switch condition to ${condition}`,
        local: true
      });
    }

    return NextResponse.json({ error: 'Invalid simulator type' }, { status: 400 });
  } catch (error) {
    console.error('Failed to trigger simulator condition:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
