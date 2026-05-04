'use client'

import { useState } from 'react'
import { type Claim } from '@/lib/supabase'
import { differenceInCalendarDays, parseISO, isValid } from 'date-fns'

const STATUS_CONFIG = {
  active:     { label: 'Active',     classes: 'bg-green-100 text-green-700' },
  pending:    { label: 'Pending',    classes: 'bg-amber-100 text-amber-700' },
  supplement: { label: 'Supplement', classes: 'bg-blue-100 text-blue-700' },
  complete:   { label: 'Complete',   classes: 'bg-gray-100 text-gray-500' },
}

function parseMoney(v: string) {
  const n = parseFloat((v || '0').replace(/[^0-9.]/g, ''))
  return isNaN(n) ? 0 : n
}

function formatMoney(v: string) {
  const n = parseMoney(v)
  return n ? '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'
}

function etaDisplay(dateStr: string) {
  if (!dateStr) return { text: '—', urgent: false }
  try {
    const d = parseISO(dateStr)
    if (!isValid(d)) return { text: '—', urgent: false }
    const diff = differenceInCalendarDays(d, new Date())
    if (diff < 0) return { text: `${Math.abs(diff)}d overdue`, urgent: true }
    if (diff === 0) return { text: 'Due today', urgent: true }
    return { text: `${diff}d remaining`, urgent: diff <= 3 }
  } catch { return { text: '—', urgent: false } }
}

type Props = { claim: Claim; onEdit: () => void; onDelete: () => void; onStatusChange: (s: Claim['status']) => void }

export default function ClaimCard({ claim: c, onEdit, onDelete, onStatusChange }: Props) {
  const [expanded, setExpanded] = useState(false)
  const cfg = STATUS_CONFIG[c.status] || STATUS_CONFIG.active
  const eta = etaDisplay(c.date_eta)
  const owed = Math.max(0, parseMoney(c.est_amount) - parseMoney(c.paid))
  const owedStr = owed > 0 ? '$' + owed.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'
  const prog = Math.min(100, Math.max(0, c.progress || 0))

  return (
    <div className={`card transition-all ${expanded ? 'ring-1 ring-gray-300' : ''}`}>
      <button className="w-full text-left p-4 sm:p-5" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-gray-900">{c.vehicle || 'No vehicle set'}</span>
              <span className={`badge ${cfg.classes}`}>{cfg.label}</span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5 truncate">
              {[c.claim_num ? `#${c.claim_num}` : '', c.insurance, c.tech ? `Tech: ${c.tech}` : ''].filter(Boolean).join('  ·  ')}
            </p>
          </div>
          <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-gray-100">
          <div>
            <p className="text-xs text-gray-400">ETA</p>
            <p className={`text-xs font-medium mt-0.5 ${eta.urgent ? 'text-red-600' : 'text-gray-700'}`}>{eta.text}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Estimate</p>
            <p className="text-xs font-medium text-gray-700 mt-0.5">{formatMoney(c.est_amount)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Owed</p>
            <p className={`text-xs font-medium mt-0.5 ${owed > 0 ? 'text-gray-900' : 'text-gray-400'}`}>{owedStr}</p>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-4 sm:px-5 pb-5 border-t border-gray-100">
          <div className="mt-4 mb-5">
            <div className="flex justify-between text-xs text-gray-400 mb-1.5">
              <span>Repair progress</span><span>{prog}%</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-gray-800 rounded-full transition-all duration-500" style={{ width: `${prog}%` }} />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
            <F label="Claim #" value={c.claim_num} />
            <F label="Vehicle in" value={c.date_in} />
            <F label="Est. completion" value={c.date_eta} extra={eta.text} extraUrgent={eta.urgent} />
            <F label="VIN" value={c.vin} mono />
            <F label="License plate" value={c.plate} />
            <F label="Insurance" value={c.insurance} />
            <F label="Policy #" value={c.policy} />
            <F label="Adjuster" value={c.adjuster} />
            <F label="Adjuster phone" value={c.adj_phone} />
            <F label="Adjuster email" value={c.adj_email} />
            <F label="Customer" value={c.customer} />
            <F label="Technician" value={c.tech} />
            <F label="Estimate total" value={formatMoney(c.est_amount)} />
            <F label="Paid / approved" value={formatMoney(c.paid)} />
            <F label="Balance owed" value={owedStr} highlight={owed > 0} />
          </div>

          {c.notes && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-100 rounded-lg">
              <p className="text-xs font-medium text-amber-700 uppercase tracking-wide mb-1">Notes</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{c.notes}</p>
            </div>
          )}

          {c.file_name && (
            <div className="mt-3">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">Estimate file</p>
              {c.file_url ? (
                <a href={c.file_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                  className="inline-flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg text-xs text-blue-600 transition-colors">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
                  </svg>
                  {c.file_name}
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                  </svg>
                </a>
              ) : (
                <span className="inline-flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-500">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
                  </svg>
                  {c.file_name}
                </span>
              )}
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Status:</span>
              <select className="text-xs border border-gray-200 rounded-md px-2 py-1 bg-white text-gray-700 focus:outline-none"
                value={c.status} onChange={e => onStatusChange(e.target.value as Claim['status'])} onClick={e => e.stopPropagation()}>
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="supplement">Supplement</option>
                <option value="complete">Complete</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-secondary text-xs py-1.5 px-3" onClick={e => { e.stopPropagation(); onEdit() }}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                </svg>
                Edit
              </button>
              <button className="btn btn-danger text-xs py-1.5 px-3" onClick={e => { e.stopPropagation(); onDelete() }}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <polyline strokeLinecap="round" strokeLinejoin="round" points="3 6 5 6 21 6"/>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/>
                </svg>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function F({ label, value, mono, highlight, extra, extraUrgent }: {
  label: string; value?: string; mono?: boolean; highlight?: boolean; extra?: string; extraUrgent?: boolean
}) {
  return (
    <div>
      <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-0.5">{label}</p>
      <p className={`text-sm truncate ${mono ? 'font-mono text-xs' : ''} ${highlight ? 'font-semibold text-gray-900' : 'text-gray-700'} ${!value ? 'text-gray-300' : ''}`}>
        {value || '—'}
      </p>
      {extra && extra !== '—' && <p className={`text-xs mt-0.5 ${extraUrgent ? 'text-red-500' : 'text-gray-400'}`}>{extra}</p>}
    </div>
  )
}
