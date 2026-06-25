'use client';

import React, { useState, useEffect } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Search,
  Filter,
  ArrowRight,
  Send,
  Loader2,
  Copy,
  RotateCcw,
  Sparkles,
  ShieldAlert,
  CornerDownRight,
  TrendingUp,
  User as UserIcon,
  MessageSquare,
  BadgeAlert,
  CheckSquare
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Transaction {
  id: string;
  amount: number | string;
  currency: string;
  sender_bank: string;
  receiver_bank: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'TIMEOUT' | 'REVERSED';
  route_path: string[];
  latency_ms?: number;
  error_code?: string;
  error_message?: string;
  root_cause?: string;
  affected_component?: string;
  rca_confidence?: number;
  expected_reversal?: string;
  reversal_confidence?: number;
  created_at: string;
}

interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
}

interface SupportCase {
  id: string;
  transaction_id: string;
  customer_id?: string | null;
  agent_id?: string | null;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'ESCALATED';
  ai_rca_summary?: string | null;
  ai_suggested_response?: string | null;
  ai_escalation_recommendation?: string | null;
  refund_eta?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  closed_at?: string | null;
  transaction: Transaction;
  customer?: Customer | null;
}

interface AgentTrace {
  agent_name: string;
  message: string;
  timestamp: string;
}

export default function BpoDashboard() {
  const [cases, setCases] = useState<SupportCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Copilot Panel states
  const [copilotQuery, setCopilotQuery] = useState('');
  const [copilotResponses, setCopilotResponses] = useState<Record<string, { reply: string; traces: AgentTrace[]; respondingAgent: string }>>({});
  const [copilotLoading, setCopilotLoading] = useState(false);
  
  // Selected case action states
  const [actionNotes, setActionNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [copiedResponse, setCopiedResponse] = useState(false);

  // Fetch Cases from API
  const fetchCases = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/cases');
      if (res.ok) {
        const data = await res.json();
        
        // Merge with local storage updates if any
        const storedUpdates = localStorage.getItem('prism_bpo_case_updates');
        let merged = data;
        if (storedUpdates) {
          const updates = JSON.parse(storedUpdates);
          merged = data.map((c: any) => {
            if (updates[c.id]) {
              return { ...c, ...updates[c.id] };
            }
            return c;
          });
        }
        setCases(merged);
        localStorage.setItem('prism_bpo_cases', JSON.stringify(merged));
        if (merged.length > 0 && !selectedCaseId) {
          setSelectedCaseId(merged[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load support cases:', err);
      // Offline fallback: load from local storage
      const stored = localStorage.getItem('prism_bpo_cases');
      if (stored) {
        const parsed = JSON.parse(stored);
        setCases(parsed);
        if (parsed.length > 0 && !selectedCaseId) {
          setSelectedCaseId(parsed[0].id);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCases();
  }, []);

  const selectedCase = cases.find(c => c.id === selectedCaseId);

  // Update Case Action Handler
  const handleUpdateStatus = async (status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'ESCALATED') => {
    if (!selectedCaseId) return;
    setActionLoading(true);

    // Save to local storage updates first to guarantee persistence across refresh
    const storedUpdates = localStorage.getItem('prism_bpo_case_updates') || '{}';
    const updates = JSON.parse(storedUpdates);
    updates[selectedCaseId] = {
      status,
      notes: actionNotes || undefined,
      closed_at: status === 'RESOLVED' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    };
    localStorage.setItem('prism_bpo_case_updates', JSON.stringify(updates));

    try {
      const res = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId: selectedCaseId,
          status,
          notes: actionNotes || undefined,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setCases(prev => {
          const next = prev.map(c => c.id === updated.id ? { ...c, ...updated } : c);
          localStorage.setItem('prism_bpo_cases', JSON.stringify(next));
          return next;
        });
        setActionNotes('');
      } else {
        // Update local state even if server fails to write, to guarantee seamless UX
        setCases(prev => {
          const next = prev.map(c => c.id === selectedCaseId ? { ...c, status, notes: actionNotes || c.notes } : c);
          localStorage.setItem('prism_bpo_cases', JSON.stringify(next));
          return next;
        });
        setActionNotes('');
      }
    } catch (err) {
      console.error('Failed to update case:', err);
      // Offline local update fallback
      setCases(prev => {
        const next = prev.map(c => c.id === selectedCaseId ? { ...c, status, notes: actionNotes || c.notes } : c);
        localStorage.setItem('prism_bpo_cases', JSON.stringify(next));
        return next;
      });
      setActionNotes('');
    } finally {
      setActionLoading(false);
    }
  };

  // AI Assistant Custom Prompt Handler
  const handleSendCopilotQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!copilotQuery.trim() || !selectedCaseId || !selectedCase) return;

    const query = copilotQuery;
    setCopilotQuery('');
    setCopilotLoading(true);

    // Initialize response state
    setCopilotResponses(prev => ({
      ...prev,
      [selectedCase.id]: {
        reply: '',
        traces: [],
        respondingAgent: 'BPO Copilot Agent',
      }
    }));

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: `bpo-session-${selectedCaseId}`,
          message: query,
          transaction_id: selectedCase.transaction.id,
        }),
      });

      if (!res.ok) throw new Error('Stream failed');

      setCopilotLoading(false); // Stop typing loader once stream starts

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      if (reader) {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                setCopilotResponses(prev => {
                  const prevVal = prev[selectedCase.id] || { reply: '', traces: [], respondingAgent: 'BPO Copilot Agent' };
                  return {
                    ...prev,
                    [selectedCase.id]: {
                      reply: prevVal.reply + data.text,
                      traces: data.traces || prevVal.traces,
                      respondingAgent: data.agent || prevVal.respondingAgent,
                    }
                  };
                });
              } catch (parseErr) {
                // Ignore parse errors
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('AI Copilot stream failed:', err);
    } finally {
      setCopilotLoading(false);
    }
  };

  // Stats calculation
  const stats = {
    open: cases.filter(c => c.status === 'OPEN').length,
    inProgress: cases.filter(c => c.status === 'IN_PROGRESS').length,
    escalated: cases.filter(c => c.status === 'ESCALATED').length,
    resolved: cases.filter(c => c.status === 'RESOLVED').length,
    total: cases.length,
    slaWarnings: cases.filter(c => c.status === 'OPEN' && c.transaction.status === 'TIMEOUT').length,
  };

  // Filters application
  const filteredCases = cases.filter(c => {
    const matchesStatus = filterStatus === 'ALL' || c.status === filterStatus;
    const matchesSearch = 
      c.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.transaction.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.customer?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.transaction.sender_bank.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const handleCopySuggestedResponse = () => {
    if (!selectedCase?.ai_suggested_response) return;
    navigator.clipboard.writeText(selectedCase.ai_suggested_response);
    setCopiedResponse(true);
    setTimeout(() => setCopiedResponse(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-tr from-cyan-500 to-blue-600 p-2.5 rounded-xl shadow-lg shadow-cyan-500/20">
            <Activity className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">PRISM</h1>
            <p className="text-xs text-slate-400">BPO Operations & Copilot Console</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-xs text-slate-300 font-medium">Agent service active</span>
          </div>
          <button 
            onClick={fetchCases} 
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700 hover:border-slate-600 transition"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Refresh List
          </button>
        </div>
      </header>

      {/* KPI Stats Panel */}
      <section className="bg-slate-900/40 border-b border-slate-800 px-6 py-5 grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <span className="text-xs font-semibold text-slate-400">Open Cases</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-bold text-sky-400">{stats.open}</span>
            <span className="text-xs text-slate-500">Unassigned</span>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <span className="text-xs font-semibold text-slate-400">In Progress</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-bold text-amber-500">{stats.inProgress}</span>
            <span className="text-xs text-slate-500">Active investigation</span>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <span className="text-xs font-semibold text-slate-400">Escalated Tier-2</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-bold text-rose-500">{stats.escalated}</span>
            <span className="text-xs text-slate-500">Requires validation</span>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <span className="text-xs font-semibold text-slate-400">SLA Breach Warning</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-bold text-red-500 animate-pulse">{stats.slaWarnings}</span>
            <span className="text-xs text-rose-400 font-medium">Timeout issues</span>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 col-span-2 md:col-span-1 flex flex-col justify-between bg-gradient-to-br from-indigo-950/20 to-slate-900">
          <span className="text-xs font-semibold text-indigo-300 flex items-center gap-1">
            <Sparkles className="h-3.5 w-3.5 text-indigo-400" /> AI Copilot Rate
          </span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-bold text-indigo-400">78.5%</span>
            <span className="text-xs text-indigo-400 font-medium flex items-center gap-0.5">
              <TrendingUp className="h-3 w-3" /> +2.3%
            </span>
          </div>
        </div>
      </section>

      {/* Main Workspace Layout */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-3 overflow-hidden min-h-0">
        
        {/* Cases Ledger - Left / Center Grid (Col-Span 2) */}
        <section className="lg:col-span-2 border-r border-slate-800 flex flex-col overflow-y-auto">
          {/* Toolbar Filters */}
          <div className="p-4 bg-slate-900/30 border-b border-slate-800 flex flex-col sm:flex-row gap-4 items-center justify-between">
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search transaction, case or user..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-cyan-500 text-slate-200"
              />
            </div>

            <div className="flex gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
              {['ALL', 'OPEN', 'IN_PROGRESS', 'ESCALATED', 'RESOLVED'].map((status) => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition whitespace-nowrap ${
                    filterStatus === status
                      ? 'bg-cyan-600 border-cyan-500 text-white shadow-md'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          {/* Ledger Table/Grid */}
          <div className="flex-1 overflow-x-auto">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
                <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
                <p className="text-sm font-medium">Fetching support cases from ledger...</p>
              </div>
            ) : filteredCases.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
                <Filter className="h-10 w-10 text-slate-600" />
                <p className="text-sm font-medium">No matching support cases found.</p>
              </div>
            ) : (
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/20 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                    <th className="py-3.5 px-4">Case Details</th>
                    <th className="py-3.5 px-4">Transaction / Route</th>
                    <th className="py-3.5 px-4">Amount</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4">Refund ETA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredCases.map((c) => {
                    const isSelected = c.id === selectedCaseId;
                    return (
                      <tr
                        key={c.id}
                        onClick={() => setSelectedCaseId(c.id)}
                        className={`hover:bg-slate-900/40 cursor-pointer transition-colors ${
                          isSelected ? 'bg-cyan-950/20 border-l-4 border-cyan-500' : ''
                        }`}
                      >
                        <td className="py-4 px-4">
                          <div className="flex flex-col">
                            <span className="font-bold text-sm text-slate-200">{c.id}</span>
                            <span className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                              <UserIcon className="h-3 w-3" /> {c.customer?.name || 'Anonymous Customer'}
                            </span>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex flex-col">
                            <span className="text-xs font-mono text-slate-300 select-all">{c.transaction_id}</span>
                            <span className="text-xs text-slate-500 mt-1">
                              {c.transaction.sender_bank} → {c.transaction.receiver_bank} ({c.transaction.route_path.join(' › ')})
                            </span>
                          </div>
                        </td>
                        <td className="py-4 px-4 font-semibold text-sm text-slate-200">
                          ₹{Number(c.transaction.amount).toLocaleString('en-IN')}
                        </td>
                        <td className="py-4 px-4">
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${
                              c.status === 'OPEN'
                                ? 'bg-sky-500/10 border-sky-500/30 text-sky-400'
                                : c.status === 'IN_PROGRESS'
                                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                                : c.status === 'ESCALATED'
                                ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                            }`}
                          >
                            {c.status}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-xs font-medium text-slate-400">
                          <div className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5 text-slate-500" />
                            {c.refund_eta || c.transaction.expected_reversal || 'N/A'}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* AI Diagnostics & Copilot Sidebar (Col-Span 1) */}
        <section className="lg:col-span-1 bg-slate-900/20 flex flex-col overflow-y-auto">
          {selectedCase ? (
            <div className="p-6 flex flex-col gap-6">
              
              {/* Workspace Header */}
              <div className="border-b border-slate-800 pb-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-mono">WORKSPACE FOR {selectedCase.id}</span>
                  <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-md border border-slate-700 font-mono">
                    {selectedCase.transaction.error_code || 'GENERIC_FAILED'}
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-200 mt-2">
                  Verify Transaction {selectedCase.transaction.id}
                </h3>
              </div>

              {/* Status Update Actions */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-400">Case Actions & Status</label>
                  {actionLoading && <Loader2 className="h-3.5 w-3.5 text-cyan-500 animate-spin" />}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleUpdateStatus('IN_PROGRESS')}
                    disabled={actionLoading || selectedCase.status === 'IN_PROGRESS'}
                    className="flex-1 bg-slate-950 border border-slate-800 hover:border-amber-500 text-slate-300 hover:text-amber-400 transition py-2 px-3 rounded-lg text-xs font-medium"
                  >
                    Investigate
                  </button>
                  <button
                    onClick={() => handleUpdateStatus('ESCALATED')}
                    disabled={actionLoading || selectedCase.status === 'ESCALATED'}
                    className="flex-1 bg-slate-950 border border-slate-800 hover:border-rose-500 text-slate-300 hover:text-rose-400 transition py-2 px-3 rounded-lg text-xs font-medium"
                  >
                    Escalate L2
                  </button>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleUpdateStatus('RESOLVED')}
                    disabled={actionLoading || selectedCase.status === 'RESOLVED'}
                    className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white transition py-2.5 px-3 rounded-lg text-xs font-bold shadow-md shadow-emerald-950/20"
                  >
                    Resolve Case
                  </button>
                </div>

                <div className="mt-1">
                  <input
                    type="text"
                    placeholder="Add operational notes or dispute logs..."
                    value={actionNotes}
                    onChange={(e) => setActionNotes(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
                  />
                  {selectedCase.notes && (
                    <div className="mt-2 text-[10px] text-slate-500 bg-slate-950/50 p-2 rounded-md italic">
                      Notes: "{selectedCase.notes}"
                    </div>
                  )}
                </div>
              </div>

              {/* AI Diagnostics Card */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-4 relative overflow-hidden bg-gradient-to-b from-indigo-950/10 to-slate-900">
                <div className="absolute top-0 right-0 p-3 opacity-10">
                  <Sparkles className="h-10 w-10 text-indigo-400" />
                </div>
                
                <h4 className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-indigo-400" /> AI Diagnostic Output
                </h4>

                <div className="space-y-3">
                  {/* RCA Summary */}
                  <div>
                    <span className="text-[10px] font-semibold text-slate-500 block uppercase">Root Cause Analysis (RCA)</span>
                    <p className="text-xs text-slate-300 leading-relaxed mt-1 font-medium bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
                      {selectedCase.ai_rca_summary || 'No RCA summary calculated.'}
                    </p>
                    {selectedCase.transaction.rca_confidence && (
                      <span className="text-[10px] text-slate-500 mt-1 block">
                        Confidence: {(selectedCase.transaction.rca_confidence * 100).toFixed(1)}% | Component: {selectedCase.transaction.affected_component || 'N/A'}
                      </span>
                    )}
                  </div>

                  {/* Reversal Engine SLA */}
                  <div className="grid grid-cols-2 gap-3 bg-slate-950/30 p-2.5 rounded-lg border border-slate-800/80">
                    <div>
                      <span className="text-[10px] font-semibold text-slate-500 block uppercase">Refund Prediction</span>
                      <span className="text-xs font-bold text-emerald-400 mt-0.5 block">
                        {selectedCase.refund_eta || selectedCase.transaction.expected_reversal || 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-semibold text-slate-500 block uppercase">SLA Reversal Conf.</span>
                      <span className="text-xs font-bold text-sky-400 mt-0.5 block">
                        {selectedCase.transaction.reversal_confidence || 100}%
                      </span>
                    </div>
                  </div>

                  {/* Suggested response */}
                  {selectedCase.ai_suggested_response && (
                    <div className="border-t border-slate-800/60 pt-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold text-slate-500 uppercase">Suggested Customer Response</span>
                        <button
                          onClick={handleCopySuggestedResponse}
                          className="text-[10px] text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1"
                        >
                          {copiedResponse ? <CheckSquare className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                          {copiedResponse ? 'Copied!' : 'Copy Response'}
                        </button>
                      </div>
                      <p className="text-xs text-slate-400 italic bg-slate-950/40 p-2.5 rounded-lg border border-slate-800/50 mt-1 leading-relaxed">
                        "{selectedCase.ai_suggested_response}"
                      </p>
                    </div>
                  )}

                  {/* Escalation recommendations */}
                  {selectedCase.ai_escalation_recommendation && (
                    <div className="border-t border-slate-800/60 pt-3 bg-rose-950/10 -mx-4 -mb-4 p-4">
                      <span className="text-[10px] font-bold text-rose-400 uppercase flex items-center gap-1">
                        <ShieldAlert className="h-3.5 w-3.5" /> Escalation Warning
                      </span>
                      <p className="text-xs text-rose-200 mt-1 leading-relaxed">
                        {selectedCase.ai_escalation_recommendation}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* BPO Copilot Agent Chat Workspace */}
              <div className="border-t border-slate-800 pt-6 flex flex-col gap-4">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <MessageSquare className="h-4 w-4 text-cyan-400" /> BPO Copilot Interaction Graph
                </h4>

                {/* Agent Chat responses */}
                <div className="bg-slate-950 border border-slate-850 rounded-xl p-4 flex flex-col gap-3 min-h-[150px]">
                  {copilotResponses[selectedCase.id] ? (
                    <div className="space-y-4">
                      <div className="flex gap-2">
                        <div className="bg-cyan-600/10 border border-cyan-500/20 text-cyan-400 px-2.5 py-1 rounded-lg text-xs font-semibold h-fit">
                          {copilotResponses[selectedCase.id].respondingAgent}
                        </div>
                        <div className="text-xs text-slate-300 leading-relaxed pt-0.5 prose prose-invert prose-sm max-w-none">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {copilotResponses[selectedCase.id].reply}
                          </ReactMarkdown>
                        </div>
                      </div>

                      {/* Trace view */}
                      {copilotResponses[selectedCase.id].traces && copilotResponses[selectedCase.id].traces.length > 0 && (
                        <div className="border-t border-slate-800 pt-3">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                            Reasoning Graph Logs
                          </span>
                          <div className="space-y-2 border-l border-slate-800 ml-1.5 pl-3">
                            {copilotResponses[selectedCase.id].traces.map((trace, idx) => (
                              <div key={idx} className="relative text-[10px]">
                                <span className="absolute -left-[16.5px] top-1.5 h-1.5 w-1.5 rounded-full bg-slate-700 border border-slate-900"></span>
                                <span className="font-bold text-slate-400 block">{trace.agent_name}</span>
                                <span className="text-slate-500 block leading-normal mt-0.5">{trace.message}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                      <Sparkles className="h-6 w-6 text-slate-700 mb-2" />
                      <p className="text-xs text-slate-500">
                        Ask the copilot details about this case, route logs, or recovery SOPs.
                      </p>
                    </div>
                  )}
                </div>

                {/* Chat Form */}
                <form onSubmit={handleSendCopilotQuery} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Ask AI Copilot for route details..."
                    value={copilotQuery}
                    onChange={(e) => setCopilotQuery(e.target.value)}
                    disabled={copilotLoading}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                  <button
                    type="submit"
                    disabled={copilotLoading || !copilotQuery.trim()}
                    className="bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 text-white font-bold p-2.5 rounded-xl transition flex items-center justify-center"
                  >
                    {copilotLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </button>
                </form>
              </div>

            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-slate-500">
              <BadgeAlert className="h-8 w-8 text-slate-700 mb-2" />
              <p className="text-sm font-medium">Select a case to launch AI diagnostics workspace.</p>
            </div>
          )}
        </section>

      </main>
    </div>
  );
}
