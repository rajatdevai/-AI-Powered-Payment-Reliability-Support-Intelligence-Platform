'use client';

import React, { useState, useEffect } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  ShieldAlert,
  Server,
  Zap,
  CheckSquare,
  Loader2,
  RefreshCcw,
  Network,
  Users,
  Building,
  ArrowRight,
  HelpCircle,
  Radio,
  Play
} from 'lucide-react';

interface Incident {
  id: string;
  route: string;
  severity: 'LOW' | 'HIGH' | 'CRITICAL';
  status: 'ACTIVE' | 'RESOLVED';
  affected_users_count: number;
  affected_merchants_count: number;
  blast_radius: {
    affected_routes: string[];
    affected_psps: string[];
    affected_banks: string[];
    affected_merchants: string[];
    affected_users: number;
  } | null | any;
  description: string;
  root_cause: string | null;
  created_at: string;
  resolved_at: string | null;
}

const BANKS = ['HDFC', 'ICICI', 'SBI', 'AXIS', 'YESBANK'];

export default function OpsDashboard() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Simulator State
  const [bankConditions, setBankConditions] = useState<Record<string, 'HEALTHY' | 'LATENCY_SPIKE' | 'TIMEOUT_FLURRY' | 'OUTAGE'>>({
    HDFC: 'HEALTHY',
    ICICI: 'HEALTHY',
    SBI: 'HEALTHY',
    AXIS: 'HEALTHY',
    YESBANK: 'HEALTHY'
  });
  const [npciCondition, setNpciCondition] = useState<'HEALTHY' | 'LATENCY_SPIKE' | 'TIMEOUT' | 'OUTAGE'>('HEALTHY');
  
  // Selected route state for topology inspection
  const [selectedRoute, setSelectedRoute] = useState<string>('HDFC_SBI');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Fetch Incidents
  const fetchIncidents = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/incidents');
      if (res.ok) {
        const data = await res.json();
        setIncidents(data);
      }
    } catch (err) {
      console.error('Failed to load incidents:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIncidents();
  }, []);

  // Update simulator condition
  const handleSetCondition = async (nodeType: 'BANK' | 'NPCI', nodeCode: string, condition: string) => {
    const key = nodeType === 'BANK' ? nodeCode : 'NPCI';
    setActionLoading(key);
    try {
      const res = await fetch('/api/simulator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: nodeType,
          bank_code: nodeType === 'BANK' ? nodeCode : undefined,
          condition
        }),
      });

      if (res.ok) {
        if (nodeType === 'BANK') {
          setBankConditions(prev => ({
            ...prev,
            [nodeCode]: condition as any
          }));
        } else {
          setNpciCondition(condition as any);
        }
        
        // Auto refresh incidents to see if a mock incident is generated
        fetchIncidents();
      }
    } catch (err) {
      console.error('Failed to set condition:', err);
    } finally {
      setActionLoading(null);
    }
  };

  // Resolve incident
  const handleResolveIncident = async (incidentId: string) => {
    setActionLoading(`resolve-${incidentId}`);
    try {
      const res = await fetch('/api/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          incidentId,
          status: 'RESOLVED'
        }),
      });

      if (res.ok) {
        const updated = await res.json();
        setIncidents(prev => prev.map(i => i.id === updated.id ? updated : i));
      }
    } catch (err) {
      console.error('Failed to resolve incident:', err);
    } finally {
      setActionLoading(null);
    }
  };

  // Stats calculation
  const activeIncidents = incidents.filter(i => i.status === 'ACTIVE');
  const criticalOutagesCount = activeIncidents.filter(i => i.severity === 'CRITICAL').length;
  
  // Calculate average latency dynamically based on simulated conditions
  let simulatedLatency = 180;
  BANKS.forEach(b => {
    if (bankConditions[b] === 'LATENCY_SPIKE') simulatedLatency += 1200;
    if (bankConditions[b] === 'TIMEOUT_FLURRY') simulatedLatency += 4500;
    if (bankConditions[b] === 'OUTAGE') simulatedLatency += 500;
  });
  if (npciCondition === 'LATENCY_SPIKE') simulatedLatency += 1800;

  // Calculate success probability based on simulated conditions
  let successRate = 99.8;
  BANKS.forEach(b => {
    if (bankConditions[b] === 'LATENCY_SPIKE') successRate -= 8.5;
    if (bankConditions[b] === 'TIMEOUT_FLURRY') successRate -= 24.0;
    if (bankConditions[b] === 'OUTAGE') successRate -= 45.0;
  });
  if (npciCondition === 'TIMEOUT') successRate -= 35.0;
  if (npciCondition === 'OUTAGE') successRate -= 95.0;
  successRate = Math.max(1.2, successRate);

  // Dynamic status color resolvers
  const getConditionColor = (cond: string) => {
    switch (cond) {
      case 'HEALTHY': return 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10';
      case 'LATENCY_SPIKE': return 'text-yellow-400 border-yellow-500/20 bg-yellow-500/10';
      case 'TIMEOUT_FLURRY':
      case 'TIMEOUT': return 'text-orange-400 border-orange-500/20 bg-orange-500/10';
      case 'OUTAGE': return 'text-rose-400 border-rose-500/20 bg-rose-500/10';
      default: return 'text-slate-400 border-slate-500/20 bg-slate-500/10';
    }
  };

  // Get active blast radius based on selected route
  const getSelectedRouteBlastRadius = () => {
    const [sender, receiver] = selectedRoute.split('_');
    const senderCondition = bankConditions[sender];
    const receiverCondition = bankConditions[receiver];
    
    const isDegraded = senderCondition !== 'HEALTHY' || receiverCondition !== 'HEALTHY' || npciCondition !== 'HEALTHY';
    
    if (!isDegraded) {
      return {
        severity: 'LOW',
        affected_routes: ['None'],
        affected_psps: ['None'],
        affected_merchants: ['None'],
        affected_users: 0,
        summary: 'All nodes healthy. Route operates inside normal SLA parameters.'
      };
    }

    let affectedUsers = 0;
    let severity = 'LOW';
    if (senderCondition === 'LATENCY_SPIKE' || receiverCondition === 'LATENCY_SPIKE') {
      affectedUsers = 42;
      severity = 'LOW';
    }
    if (senderCondition === 'TIMEOUT_FLURRY' || receiverCondition === 'TIMEOUT_FLURRY') {
      affectedUsers = 124;
      severity = 'HIGH';
    }
    if (senderCondition === 'OUTAGE' || receiverCondition === 'OUTAGE') {
      affectedUsers = 285;
      severity = 'CRITICAL';
    }
    if (npciCondition !== 'HEALTHY') {
      affectedUsers += 500;
      severity = 'CRITICAL';
    }

    return {
      severity,
      affected_routes: [`${sender}_${receiver}`, `${receiver}_${sender}`],
      affected_psps: [`${sender}_PSP`, 'NPCI_SWITCH'],
      affected_merchants: ['Swiggy', 'Zomato', 'Amazon India', 'Flipkart'],
      affected_users: affectedUsers,
      summary: `Active degradations on ${sender} (${senderCondition}) or ${receiver} (${receiverCondition}) causing transaction routing packet timeouts.`
    };
  };

  const selectedBlast = getSelectedRouteBlastRadius();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-tr from-amber-500 to-rose-600 p-2.5 rounded-xl shadow-lg shadow-rose-500/20">
            <Network className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">PRISM</h1>
            <p className="text-xs text-slate-400">Engineering Operations & Reliability Console</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500 animate-pulse"></span>
            <span className="text-xs text-slate-300 font-medium">Outage simulator online</span>
          </div>
          <button 
            onClick={fetchIncidents} 
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700 hover:border-slate-600 transition"
          >
            <RefreshCcw className="h-3.5 w-3.5" /> Reload Incidents
          </button>
        </div>
      </header>

      {/* Real-time KPI Stats Banner */}
      <section className="bg-slate-900/40 border-b border-slate-800 px-6 py-5 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <span className="text-xs font-semibold text-slate-400">Global Success Rate</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className={`text-2xl font-bold ${successRate > 90 ? 'text-emerald-400' : successRate > 75 ? 'text-yellow-400' : 'text-rose-500'}`}>
              {successRate.toFixed(1)}%
            </span>
            <span className="text-xs text-slate-500">NPCI routing switch</span>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <span className="text-xs font-semibold text-slate-400">Average Route Latency</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className={`text-2xl font-bold ${simulatedLatency < 400 ? 'text-emerald-400' : simulatedLatency < 2000 ? 'text-yellow-400' : 'text-rose-500'}`}>
              {simulatedLatency} ms
            </span>
            <span className="text-xs text-slate-500">Aggregated hops</span>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <span className="text-xs font-semibold text-slate-400">Active Incidents</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className={`text-2xl font-bold ${activeIncidents.length === 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
              {activeIncidents.length}
            </span>
            <span className="text-xs text-slate-500">Unresolved anomalies</span>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <span className="text-xs font-semibold text-slate-400">Critical Route Outages</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className={`text-2xl font-bold ${criticalOutagesCount === 0 ? 'text-emerald-400' : 'text-rose-500 animate-pulse'}`}>
              {criticalOutagesCount}
            </span>
            <span className="text-xs text-slate-500">Action required</span>
          </div>
        </div>
      </section>

      {/* Main Grid Content */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-3 overflow-hidden min-h-0">
        
        {/* LEFT COLUMN: Bank Simulator Controllers */}
        <section className="lg:col-span-1 border-r border-slate-800 p-6 flex flex-col gap-6 overflow-y-auto">
          <div>
            <h2 className="text-base font-bold text-slate-200 flex items-center gap-2">
              <Server className="text-rose-500 h-5 w-5" /> Bank Rail Simulator
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Select bank switches and inject conditions to simulate transaction degradation.
            </p>
          </div>

          <div className="space-y-4">
            {/* NPCI switch controller */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-amber-400 flex items-center gap-1.5">
                  <Activity className="h-4 w-4" /> NPCI Core Switch
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${getConditionColor(npciCondition)}`}>
                  {npciCondition}
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-2 mt-1">
                {(['HEALTHY', 'LATENCY_SPIKE', 'TIMEOUT', 'OUTAGE'] as const).map((cond) => (
                  <button
                    key={cond}
                    onClick={() => handleSetCondition('NPCI', 'NPCI', cond)}
                    disabled={actionLoading === 'NPCI'}
                    className={`text-[10px] font-bold py-1.5 px-2 rounded-lg border transition ${
                      npciCondition === cond
                        ? 'bg-amber-600 border-amber-500 text-white shadow-md'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                    }`}
                  >
                    {cond === 'TIMEOUT' ? 'TIMEOUT' : cond.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            {/* Individual banks */}
            {BANKS.map((bank) => {
              const currentCond = bankConditions[bank];
              return (
                <div key={bank} className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-slate-200 flex items-center gap-1.5">
                      <Building className="h-4 w-4 text-slate-400" /> {bank} Bank Gateway
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${getConditionColor(currentCond)}`}>
                      {currentCond}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-1">
                    {(['HEALTHY', 'LATENCY_SPIKE', 'TIMEOUT_FLURRY', 'OUTAGE'] as const).map((cond) => (
                      <button
                        key={cond}
                        onClick={() => handleSetCondition('BANK', bank, cond)}
                        disabled={actionLoading === bank}
                        className={`text-[10px] font-bold py-1.5 px-2 rounded-lg border transition ${
                          currentCond === cond
                            ? 'bg-rose-600 border-rose-500 text-white shadow-md'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                        }`}
                      >
                        {cond.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* RIGHT COLUMNS: Active Incidents & Topology (Col-Span 2) */}
        <section className="lg:col-span-2 flex flex-col overflow-y-auto">
          
          {/* Active Incidents List */}
          <div className="p-6 border-b border-slate-800 flex flex-col gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-200 flex items-center gap-2">
                <AlertTriangle className="text-amber-500 h-5 w-5" /> Active Outages & Incidents
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Real-time anomalies detected by incident engine through consumer flow timeouts.
              </p>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-10 gap-3 text-slate-400">
                <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
                <p className="text-xs font-semibold">Querying incidents...</p>
              </div>
            ) : incidents.length === 0 ? (
              <div className="bg-slate-900/30 border border-slate-850 p-6 rounded-2xl flex flex-col items-center justify-center text-slate-500 text-center">
                <CheckCircle className="h-8 w-8 text-emerald-500 mb-2" />
                <p className="text-xs font-bold text-slate-300">All Routes Clear</p>
                <p className="text-[10px] text-slate-500 mt-0.5">No active incidents found in Postgres registry.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {incidents.map((incident) => {
                  const isResolved = incident.status === 'RESOLVED';
                  return (
                    <div 
                      key={incident.id} 
                      className={`bg-slate-900 border rounded-xl p-4 flex flex-col justify-between gap-4 transition ${
                        isResolved ? 'border-slate-850 opacity-60' : 'border-rose-900/30 bg-rose-950/5 shadow-md shadow-rose-950/5'
                      }`}
                    >
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-slate-200">{incident.route}</span>
                          <div className="flex gap-1">
                            <span className={`text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded ${
                              incident.severity === 'CRITICAL' ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-400'
                            }`}>
                              {incident.severity}
                            </span>
                            <span className={`text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded ${
                              isResolved ? 'bg-slate-800 text-slate-400' : 'bg-rose-500/10 text-rose-500 animate-pulse'
                            }`}>
                              {incident.status}
                            </span>
                          </div>
                        </div>

                        <p className="text-[11px] text-slate-400 leading-normal">
                          {incident.description}
                        </p>
                      </div>

                      <div className="border-t border-slate-800/60 pt-3 flex items-center justify-between">
                        <span className="text-[9px] text-slate-500 font-mono">
                          {new Date(incident.created_at).toLocaleTimeString()}
                        </span>

                        {!isResolved && (
                          <button
                            onClick={() => handleResolveIncident(incident.id)}
                            disabled={actionLoading === `resolve-${incident.id}`}
                            className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white font-bold text-[10px] py-1 px-3 rounded-md transition"
                          >
                            {actionLoading === `resolve-${incident.id}` ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              'Resolve'
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Route Topology & Blast Radius */}
          <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Topology Graph Visualizer */}
            <div className="md:col-span-2 flex flex-col gap-4">
              <div>
                <h3 className="text-sm font-bold text-slate-200 flex items-center gap-1.5">
                  <Network className="h-4.5 w-4.5 text-cyan-400" /> Routing Topology Inspector
                </h3>
                <p className="text-[10px] text-slate-500">
                  Select a sender-receiver bank route to inspect current path degradation.
                </p>
              </div>

              {/* Simple Topology Visual Graph */}
              <div className="bg-slate-900/60 border border-slate-850 rounded-2xl p-6 min-h-[220px] flex flex-col justify-between">
                
                {/* Node switches */}
                <div className="flex justify-between items-center px-4">
                  {/* Sender Nodes */}
                  <div className="flex flex-col gap-2">
                    <span className="text-[9px] font-bold text-slate-500 uppercase">Senders</span>
                    {BANKS.slice(0, 3).map(b => (
                      <button
                        key={b}
                        onClick={() => setSelectedRoute(`${b}_SBI`)}
                        className={`text-[10px] font-bold px-3 py-1.5 rounded-lg border text-left flex items-center justify-between w-24 transition ${
                          selectedRoute.startsWith(b) 
                            ? 'bg-cyan-600 border-cyan-500 text-white shadow-md' 
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        {b}
                        <span className={`h-1.5 w-1.5 rounded-full ${bankConditions[b] === 'HEALTHY' ? 'bg-emerald-400' : 'bg-rose-500 animate-pulse'}`}></span>
                      </button>
                    ))}
                  </div>

                  {/* NPCI Node */}
                  <div className="flex flex-col items-center gap-1.5">
                    <div className={`p-4 rounded-full border flex items-center justify-center transition-all ${
                      npciCondition === 'HEALTHY' ? 'bg-amber-600/10 border-amber-500/40 text-amber-400' : 'bg-rose-950/20 border-rose-500/40 text-rose-400 animate-pulse'
                    }`}>
                      <Zap className="h-6 w-6" />
                    </div>
                    <span className="text-[9px] font-mono font-bold text-slate-400 uppercase">NPCI Switch</span>
                  </div>

                  {/* Receiver Nodes */}
                  <div className="flex flex-col gap-2">
                    <span className="text-[9px] font-bold text-slate-500 uppercase text-right">Acquirers</span>
                    {BANKS.slice(3).map(b => (
                      <button
                        key={b}
                        onClick={() => setSelectedRoute(`HDFC_${b}`)}
                        className={`text-[10px] font-bold px-3 py-1.5 rounded-lg border text-right flex items-center justify-between w-24 transition ${
                          selectedRoute.endsWith(b) 
                            ? 'bg-cyan-600 border-cyan-500 text-white shadow-md' 
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${bankConditions[b] === 'HEALTHY' ? 'bg-emerald-400' : 'bg-rose-500 animate-pulse'}`}></span>
                        {b}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Selected Info Footer */}
                <div className="border-t border-slate-800/80 pt-3 mt-4 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                  <span>SELECTED ROUTE:</span>
                  <span className="font-bold text-cyan-400">{selectedRoute.replace('_', ' ➔ ')}</span>
                </div>
              </div>
            </div>

            {/* AI Blast Radius calculations */}
            <div className="md:col-span-1 flex flex-col gap-4">
              <div>
                <h3 className="text-sm font-bold text-slate-200 flex items-center gap-1.5">
                  <ShieldAlert className="h-4.5 w-4.5 text-rose-400" /> AI Blast Radius Analysis
                </h3>
                <p className="text-[10px] text-slate-500">
                  Real-time calculated impact.
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col gap-4 relative overflow-hidden bg-gradient-to-b from-rose-950/10 to-slate-900">
                <div className="absolute top-0 right-0 p-3 opacity-5">
                  <ShieldAlert className="h-10 w-10 text-rose-500" />
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-mono text-slate-500 uppercase">Impact Assessment</span>
                  <span className={`text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded ${
                    selectedBlast.severity === 'CRITICAL' ? 'bg-rose-500/20 text-rose-400 animate-pulse' : 'bg-emerald-500/20 text-emerald-400'
                  }`}>
                    {selectedBlast.severity} IMPACT
                  </span>
                </div>

                <div className="space-y-3">
                  <div>
                    <span className="text-[8px] font-extrabold text-slate-500 uppercase block">Affected Users</span>
                    <span className="text-lg font-bold text-slate-200 mt-0.5 block flex items-center gap-1">
                      <Users className="h-4 w-4 text-rose-400" /> {selectedBlast.affected_users}
                    </span>
                  </div>

                  <div>
                    <span className="text-[8px] font-extrabold text-slate-500 uppercase block">Affected Routes</span>
                    <span className="text-xs font-semibold text-slate-300 mt-0.5 block">
                      {selectedBlast.affected_routes.join(', ')}
                    </span>
                  </div>

                  <div>
                    <span className="text-[8px] font-extrabold text-slate-500 uppercase block">Affected PSPs</span>
                    <span className="text-xs font-semibold text-slate-300 mt-0.5 block">
                      {selectedBlast.affected_psps.join(', ')}
                    </span>
                  </div>

                  <div>
                    <span className="text-[8px] font-extrabold text-slate-500 uppercase block">Affected Merchants</span>
                    <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">
                      {selectedBlast.affected_merchants.join(', ')}
                    </p>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </section>

      </main>
    </div>
  );
}
