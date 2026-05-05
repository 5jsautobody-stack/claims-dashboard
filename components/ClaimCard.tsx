'use client'

import { useState, useRef } from 'react'
import { supabase, type Claim, type EventLog, type PaymentConfirmation, type EstimateLineItem } from '@/lib/supabase'
import { differenceInCalendarDays, parseISO, isValid, format } from 'date-fns'

const STATUS_CONFIG = {
  active:     { label: 'Active',     classes: 'bg-green-100 text-green-700' },
  pending:    { label: 'Pending',    classes: 'bg-amber-100 text-amber-700' },
  supplement: { label: 'Supplement', classes: 'bg-blue-100 text-blue-700' },
  complete:   { label: 'Complete',   classes: 'bg-gray-100 text-gray-500' },
}

const EVENT_CONFIG: Record<EventLog['type'], { icon: string; color: string }> = {
  arrived:       { icon: '🚗', color: 'text-green-700' },
  departed:      { icon: '✅', color: 'text-blue-700' },
  supplement:    { icon: '📄', color: 'text-orange-700' },
  status_change: { icon: '🔄', color: 'text-gray-600' },
  note:          { icon: '📝', color: 'text-gray-600' },
  payment:       { icon: '💰', color: 'text-green-700' },
}

function parseMoney(v: string) { return parseFloat((v || '0').replace(/[^0-9.]/g, '')) || 0 }
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
function fmtTime(iso: string) {
  try { return format(new Date(iso), 'MMM d, yyyy h:mm a') } catch { return iso }
}

type Props = { claim: Claim; onEdit: () => void; onDelete: () => void; onStatusChange: (s: Claim['status']) => void }

export default function ClaimCard({ claim: c, onEdit, onDelete, onStatusChange }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [activeTab, setActiveTab] = useState<'details' | 'estimates' | 'payments' | 'events'>('details')
  const [addingNote, setAddingNote] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [savingEvent, setSavingEvent] = useState(false)

  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('')
  const [payNote, setPayNote] = useState('')
  const [payFile, setPayFile] = useState<File | null>(null)
  const [payFilePreview, setPayFilePreview] = useState<string>('')
  const [savingPayment, setSavingPayment] = useState(false)
  const payFileRef = useRef<HTMLInputElement>(null)

  const cfg = STATUS_CONFIG[c.status] || STATUS_CONFIG.active
  const eta = etaDisplay(c.date_eta)
  const owed = Math.max(0, parseMoney(c.est_amount) - parseMoney(c.paid))
  const owedStr = owed > 0 ? '$' + owed.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'
  const prog = Math.min(100, Math.max(0, c.progress || 0))
  const events: EventLog[] = (() => { try { return JSON.parse(c.events_log || '[]') } catch { return [] } })()
  const payments: PaymentConfirmation[] = (() => { try { return JSON.parse(c.payments || '[]') } catch { return [] } })()
  const estimateLines: EstimateLineItem[] = (() => { try { return JSON.parse(c.estimate_lines || '[]') } catch { return [] } })()
  const hasDeparted = events.some(e => e.type === 'departed')
  const totalPaid = payments.reduce((s, p) => s + parseMoney(p.amount), 0)

  const addEvent = async (type: EventLog['type'], label: string, detail?: string) => {
    const newEvent: EventLog = { id: Date.now().toString(), type, label, detail, timestamp: new Date().toISOString() }
    const updates: Partial<Claim> = { events_log: JSON.stringify([...events, newEvent]) }
    if (type === 'departed') updates.status = 'complete'
    await supabase.from('claims').update(updates).eq('id', c.id)
    onStatusChange(type === 'departed' ? 'complete' : c.status)
  }

  const handleDepart = async () => {
    if (!confirm('Mark this vehicle as departed? Status will be set to Complete.')) return
    setSavingEvent(true)
    await addEvent('departed', 'Vehicle departed shop', 'Customer picked up vehicle')
    setSavingEvent(false)
  }

  const handleAddNote = async () => {
    if (!noteText.trim()) return
    setSavingEvent(true)
    await addEvent('note', 'Note added', noteText.trim())
    setNoteText(''); setAddingNote(false); setSavingEvent(false)
  }

  const handlePayFileSelect = (f: File) => {
    setPayFile(f)
    if (f.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = e => setPayFilePreview(e.target?.result as string)
      reader.readAsDataURL(f)
    } else setPayFilePreview('')
  }

  const handleAddPayment = async () => {
    if (!payAmount && !payFile) return
    setSavingPayment(true)
    let fileUrl = '', fileName = ''
    if (payFile) {
      const ext = payFile.name.split('.').pop()
      const path = `payments/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error: upErr } = await supabase.storage.from('estimates').upload(path, payFile)
      if (!upErr) {
        const { data } = supabase.storage.from('estimates').getPublicUrl(path)
        fileUrl = data.publicUrl; fileName = payFile.name
      }
    }
    const newPayment: PaymentConfirmation = {
      id: Date.now().toString(), amount: payAmount, method: payMethod,
      note: payNote, file_name: fileName, file_url: fileUrl, timestamp: new Date().toISOString(),
    }
    const prevPaid = parseMoney(c.paid)
    const addedAmt = parseMoney(payAmount)
    const newPaid = prevPaid + addedAmt
    const newPaidStr = newPaid > 0 ? '$' + newPaid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : c.paid
    const eventDetail = [payAmount ? `Amount: ${payAmount}` : '', payMethod ? `Via: ${payMethod}` : '', payNote || '', fileName ? `Confirmation: ${fileName}` : ''].filter(Boolean).join(' · ')
    const newEvent: EventLog = { id: (Date.now()+1).toString(), type: 'payment', label: 'Payment confirmation received', detail: eventDetail, timestamp: new Date().toISOString() }
    await supabase.from('claims').update({
      payments: JSON.stringify([...payments, newPayment]),
      paid: newPaidStr,
      events_log: JSON.stringify([...events, newEvent]),
    }).eq('id', c.id)
    setPayAmount(''); setPayMethod(''); setPayNote(''); setPayFile(null); setPayFilePreview('')
    setShowPaymentForm(false); setSavingPayment(false)
    onStatusChange(c.status)
  }

  const towSummary = () => {
    if (!c.tow_type || c.tow_type === 'none') return null
    if (c.tow_type === 'us') return { text: `Towed by us${c.tow_amount ? ` · $${c.tow_amount}` : ''}`, color: 'bg-blue-50 text-blue-700 border-blue-200' }
    if (c.tow_coverage === 'insurance') return { text: `Outside tow (${c.tow_company || 'unknown'}) · Covered by insurance`, color: 'bg-green-50 text-green-700 border-green-200' }
    if (c.tow_coverage === 'outlaid') return { text: `Outside tow (${c.tow_company || 'unknown'}) · We laid out ${c.tow_amount ? `$${c.tow_amount}` : 'money'}`, color: 'bg-red-50 text-red-700 border-red-200' }
    return { text: `Outside tow (${c.tow_company || 'unknown'}) · Coverage TBD`, color: 'bg-amber-50 text-amber-700 border-amber-200' }
  }
  const tow = towSummary()

  return (
    <div className={`card transition-all ${expanded ? 'ring-1 ring-gray-300' : ''}`}>
      <button className="w-full text-left p-4 sm:p-5" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-gray-900">{c.vehicle || 'No vehicle set'}</span>
              <span className={`badge ${cfg.classes}`}>{cfg.label}</span>
              {hasDeparted && <span className="badge bg-gray-100 text-gray-400">Departed</span>}
              {payments.length > 0 && <span className="badge bg-green-100 text-green-700">{payments.length} payment{payments.length > 1 ? 's' : ''}</span>}
              {estimateLines.length > 1 && <span className="badge bg-purple-100 text-purple-700">{estimateLines.length} estimate lines</span>}
            </div>
            <p className="text-xs text-gray-400 mt-0.5 truncate">
              {[c.claim_num ? `#${c.claim_num}` : '', c.insurance, c.tech ? `Tech: ${c.tech}` : ''].filter(Boolean).join('  ·  ')}
            </p>
          </div>
          <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
          </svg>
        </div>
        <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t border-gray-100">
          <div><p className="text-xs text-gray-400">ETA</p><p className={`text-xs font-medium mt-0.5 ${eta.urgent ? 'text-red-600' : 'text-gray-700'}`}>{eta.text}</p></div>
          <div><p className="text-xs text-gray-400">Total est.</p><p className="text-xs font-medium text-gray-700 mt-0.5">{formatMoney(c.est_amount)}</p></div>
          <div><p className="text-xs text-gray-400">Deductible</p><p className={`text-xs font-medium mt-0.5 ${c.deductible ? 'text-amber-700' : 'text-gray-400'}`}>{formatMoney(c.deductible)}</p></div>
          <div><p className="text-xs text-gray-400">Owed</p><p className={`text-xs font-medium mt-0.5 ${owed > 0 ? 'text-gray-900' : 'text-gray-400'}`}>{owedStr}</p></div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100">
          {tow && <div className={`mx-4 sm:mx-5 mt-4 px-3 py-2 rounded-lg border text-xs font-medium flex items-center gap-2 ${tow.color}`}>
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/></svg>
            {tow.text}
          </div>}

          {/* Tabs */}
          <div className="flex border-b border-gray-100 mx-4 sm:mx-5 mt-4 overflow-x-auto">
            {(['details', 'estimates', 'payments', 'events'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === tab ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                {tab === 'estimates' ? `Estimates (${estimateLines.length || 1})` : tab === 'payments' ? `Payments (${payments.length})` : tab === 'events' ? `Events (${events.length})` : 'Details'}
              </button>
            ))}
          </div>

          {/* Details tab */}
          {activeTab === 'details' && (
            <div className="px-4 sm:px-5 pb-5 pt-4">
              <div className="mb-5">
                <div className="flex justify-between text-xs text-gray-400 mb-1.5"><span>Repair progress</span><span>{prog}%</span></div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-gray-800 rounded-full transition-all duration-500" style={{ width: `${prog}%` }}/></div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5 p-3 bg-gray-50 rounded-xl border border-gray-200">
                <div><p className="text-xs text-gray-400 mb-0.5">Estimate</p><p className="text-sm font-semibold text-gray-900">{formatMoney(c.est_amount)}</p></div>
                <div><p className="text-xs text-gray-400 mb-0.5">Deductible</p><p className={`text-sm font-semibold ${c.deductible ? 'text-amber-700' : 'text-gray-300'}`}>{formatMoney(c.deductible)}</p></div>
                <div><p className="text-xs text-gray-400 mb-0.5">Ins. paid</p><p className="text-sm font-semibold text-green-700">{formatMoney(c.paid)}</p></div>
                <div><p className="text-xs text-gray-400 mb-0.5">Balance</p><p className={`text-sm font-semibold ${owed > 0 ? 'text-red-600' : 'text-gray-300'}`}>{owedStr}</p></div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
                <F label="Claim #" value={c.claim_num}/>
                <F label="Vehicle in" value={c.date_in}/>
                <F label="Est. completion" value={c.date_eta} extra={eta.text} extraUrgent={eta.urgent}/>
                <F label="VIN" value={c.vin} mono/>
                <F label="License plate" value={c.plate}/>
                <F label="Insurance" value={c.insurance}/>
                <F label="Policy #" value={c.policy}/>
                <F label="Adjuster" value={c.adjuster}/>
                <F label="Adjuster phone" value={c.adj_phone}/>
                <F label="Adjuster email" value={c.adj_email}/>
                <F label="Customer" value={c.customer}/>
                <F label="Technician" value={c.tech}/>
              </div>
              {c.notes && <div className="mt-4 p-3 bg-amber-50 border border-amber-100 rounded-lg"><p className="text-xs font-medium text-amber-700 uppercase tracking-wide mb-1">Notes</p><p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{c.notes}</p></div>}
              {c.file_name && (
                <div className="mt-3">
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">Estimate file</p>
                  {c.file_url
                    ? <a href={c.file_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="inline-flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg text-xs text-blue-600 transition-colors"><svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>{c.file_name}<svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg></a>
                    : <span className="inline-flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-500"><svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>{c.file_name}</span>}
                </div>
              )}
            </div>
          )}

          {/* Estimates breakdown tab */}
          {activeTab === 'estimates' && (
            <div className="px-4 sm:px-5 pb-5 pt-4">
              <p className="text-xs text-gray-400 mb-3">Full breakdown of all estimates and supplements on this claim.</p>
              {estimateLines.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-xs text-gray-400">No detailed breakdown available.</p>
                  <p className="text-xs text-gray-300 mt-1">Total estimate: <span className="font-medium text-gray-600">{formatMoney(c.est_amount)}</span></p>
                </div>
              ) : (
                <div className="space-y-2 mb-4">
                  {estimateLines.map((line, i) => (
                    <div key={line.id || i} className={`flex items-center justify-between p-3 rounded-lg border ${i === 0 ? 'bg-gray-50 border-gray-200' : 'bg-blue-50 border-blue-200'}`}>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold ${i === 0 ? 'text-gray-800' : 'text-blue-800'}`}>{line.label}</p>
                        {line.date && <p className="text-xs text-gray-400 mt-0.5">Date: {line.date}</p>}
                        {line.file_name && <p className="text-xs text-gray-400 mt-0.5 truncate">File: {line.file_name}</p>}
                      </div>
                      <div className="text-right ml-4 flex-shrink-0">
                        <p className={`text-sm font-bold ${i === 0 ? 'text-gray-900' : 'text-blue-900'}`}>{formatMoney(line.amount)}</p>
                        {line.file_url && (
                          <a href={line.file_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-xs text-blue-500 hover:text-blue-700">View file →</a>
                        )}
                      </div>
                    </div>
                  ))}
                  {/* Total row */}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-gray-900 text-white">
                    <p className="text-sm font-semibold">Total estimate</p>
                    <p className="text-sm font-bold">{formatMoney(c.est_amount)}</p>
                  </div>
                  {c.deductible && (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-amber-50 border border-amber-200">
                      <p className="text-sm text-amber-800 font-medium">💰 Deductible (from customer)</p>
                      <p className="text-sm font-bold text-amber-900">{formatMoney(c.deductible)}</p>
                    </div>
                  )}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-green-50 border border-green-200">
                    <p className="text-sm text-green-800 font-medium">Insurance paid</p>
                    <p className="text-sm font-bold text-green-900">{formatMoney(c.paid)}</p>
                  </div>
                  {owed > 0 && (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-red-50 border border-red-200">
                      <p className="text-sm text-red-800 font-medium">Balance owed</p>
                      <p className="text-sm font-bold text-red-900">{owedStr}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Payments tab */}
          {activeTab === 'payments' && (
            <div className="px-4 sm:px-5 pb-5 pt-4 space-y-4">
              {payments.length > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-green-700 font-medium">Total payments received</p>
                    <p className="text-lg font-bold text-green-800">${totalPaid.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400">{payments.length} confirmation{payments.length > 1 ? 's' : ''}</p>
                    {c.deductible && <p className="text-xs text-amber-600 mt-0.5">Deductible: {formatMoney(c.deductible)}</p>}
                  </div>
                </div>
              )}
              {payments.length === 0
                ? <p className="text-xs text-gray-400 py-4 text-center">No payment confirmations yet.</p>
                : (
                  <div className="space-y-3">
                    {payments.map((p, i) => (
                      <div key={p.id || i} className="border border-gray-200 rounded-xl overflow-hidden">
                        <div className="p-3 bg-gray-50 flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-green-700">{p.amount ? formatMoney(p.amount) : 'Amount not specified'}</span>
                              {p.method && <span className="badge bg-gray-100 text-gray-600">{p.method}</span>}
                            </div>
                            {p.note && <p className="text-xs text-gray-500 mt-0.5">{p.note}</p>}
                            <p className="text-xs text-gray-300 mt-1">{fmtTime(p.timestamp)}</p>
                          </div>
                          {p.file_url && <a href={p.file_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1 flex-shrink-0"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>View</a>}
                        </div>
                        {p.file_url && p.file_name && /\.(jpg|jpeg|png|gif|webp)$/i.test(p.file_name) && (
                          <a href={p.file_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={p.file_url} alt="Payment confirmation" className="w-full max-h-48 object-contain bg-white border-t border-gray-200 cursor-zoom-in hover:opacity-90 transition-opacity"/>
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )
              }
              {showPaymentForm ? (
                <div className="border border-gray-200 rounded-xl p-4 space-y-3 bg-gray-50">
                  <p className="text-sm font-semibold text-gray-800">Add payment confirmation</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="form-label">Amount received</label><input className="form-input" placeholder="$0.00" value={payAmount} onChange={e => setPayAmount(e.target.value)}/></div>
                    <div><label className="form-label">Payment method</label>
                      <select className="form-input" value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                        <option value="">— Select —</option>
                        <option value="Insurance check">Insurance check</option>
                        <option value="EFT / Direct deposit">EFT / Direct deposit</option>
                        <option value="Credit card">Credit card</option>
                        <option value="Cash">Cash</option>
                        <option value="Deductible">Deductible</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>
                  <div><label className="form-label">Note (optional)</label><input className="form-input" placeholder="e.g. Final payment, partial, deductible collected..." value={payNote} onChange={e => setPayNote(e.target.value)}/></div>
                  <div>
                    <label className="form-label">Upload confirmation screenshot or PDF</label>
                    <div className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${payFile ? 'border-green-300 bg-green-50' : 'border-gray-200 hover:border-gray-300 bg-white'}`}
                      onClick={() => payFileRef.current?.click()}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handlePayFileSelect(f) }}>
                      {payFilePreview
                        ? <div className="space-y-2">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={payFilePreview} alt="Preview" className="max-h-32 mx-auto rounded-lg object-contain"/>
                            <p className="text-xs text-green-700 font-medium">{payFile?.name} <button className="ml-1 text-gray-400 hover:text-gray-600" onClick={e => { e.stopPropagation(); setPayFile(null); setPayFilePreview('') }}>✕</button></p>
                          </div>
                        : payFile
                          ? <p className="text-sm text-green-700 font-medium">{payFile.name} <button className="ml-1 text-gray-400" onClick={e => { e.stopPropagation(); setPayFile(null) }}>✕</button></p>
                          : <>
                              <svg className="w-7 h-7 text-gray-300 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/></svg>
                              <p className="text-xs text-gray-500">Drop screenshot or click to upload</p>
                              <p className="text-xs text-gray-300 mt-0.5">JPG, PNG, PDF</p>
                            </>
                      }
                    </div>
                    <input ref={payFileRef} type="file" accept=".jpg,.jpeg,.png,.pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handlePayFileSelect(f) }}/>
                  </div>
                  <div className="flex gap-2">
                    <button className="btn btn-primary text-xs py-1.5 px-4" onClick={handleAddPayment} disabled={savingPayment || (!payAmount && !payFile)}>
                      {savingPayment ? <span className="flex items-center gap-1"><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Saving...</span> : 'Save confirmation'}
                    </button>
                    <button className="btn btn-secondary text-xs py-1.5 px-3" onClick={() => { setShowPaymentForm(false); setPayAmount(''); setPayMethod(''); setPayNote(''); setPayFile(null); setPayFilePreview('') }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button className="btn btn-secondary text-xs py-1.5 px-3 w-full justify-center" onClick={() => setShowPaymentForm(true)}>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
                  Add payment confirmation
                </button>
              )}
            </div>
          )}

          {/* Events tab */}
          {activeTab === 'events' && (
            <div className="px-4 sm:px-5 pb-5 pt-4">
              {events.length === 0
                ? <p className="text-xs text-gray-400 py-4 text-center">No events logged yet.</p>
                : (
                  <div className="space-y-2 mb-4">
                    {events.map((ev, i) => {
                      const ecfg = EVENT_CONFIG[ev.type] || EVENT_CONFIG.note
                      return (
                        <div key={ev.id || i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                          <span className="text-base leading-none mt-0.5">{ecfg.icon}</span>
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-semibold ${ecfg.color}`}>{ev.label}</p>
                            {ev.detail && <p className="text-xs text-gray-500 mt-0.5">{ev.detail}</p>}
                            <p className="text-xs text-gray-300 mt-1">{fmtTime(ev.timestamp)}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              }
              {addingNote ? (
                <div className="space-y-2">
                  <textarea className="form-input min-h-16 text-xs" placeholder="Enter note..." value={noteText} onChange={e => setNoteText(e.target.value)} autoFocus/>
                  <div className="flex gap-2">
                    <button className="btn btn-primary text-xs py-1.5 px-3" onClick={handleAddNote} disabled={savingEvent || !noteText.trim()}>Save note</button>
                    <button className="btn btn-secondary text-xs py-1.5 px-3" onClick={() => { setAddingNote(false); setNoteText('') }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button className="btn btn-secondary text-xs py-1.5 px-3 w-full justify-center" onClick={() => setAddingNote(true)}>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
                  Add note to log
                </button>
              )}
            </div>
          )}

          {/* Card actions */}
          <div className="px-4 sm:px-5 pb-4 pt-1 flex items-center justify-between gap-3 flex-wrap border-t border-gray-100">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Status:</span>
              <select className="text-xs border border-gray-200 rounded-md px-2 py-1 bg-white text-gray-700 focus:outline-none"
                value={c.status} onChange={e => onStatusChange(e.target.value as Claim['status'])} onClick={e => e.stopPropagation()}>
                <option value="active">Active</option><option value="pending">Pending</option>
                <option value="supplement">Supplement</option><option value="complete">Complete</option>
              </select>
            </div>
            <div className="flex gap-2 flex-wrap">
              {!hasDeparted && c.status !== 'complete' && (
                <button className="btn text-xs py-1.5 px-3 bg-green-600 text-white border-green-600 hover:bg-green-700" onClick={e => { e.stopPropagation(); handleDepart() }} disabled={savingEvent}>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  Vehicle departed
                </button>
              )}
              <button className="btn btn-secondary text-xs py-1.5 px-3" onClick={e => { e.stopPropagation(); onEdit() }}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                Edit
              </button>
              <button className="btn btn-danger text-xs py-1.5 px-3" onClick={e => { e.stopPropagation(); onDelete() }}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><polyline strokeLinecap="round" strokeLinejoin="round" points="3 6 5 6 21 6"/><path strokeLinecap="round" strokeLinejoin="round" d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/></svg>
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
      <p className={`text-sm truncate ${mono ? 'font-mono text-xs' : ''} ${highlight ? 'font-semibold text-gray-900' : 'text-gray-700'} ${!value ? 'text-gray-300' : ''}`}>{value || '—'}</p>
      {extra && extra !== '—' && <p className={`text-xs mt-0.5 ${extraUrgent ? 'text-red-500' : 'text-gray-400'}`}>{extra}</p>}
    </div>
  )
}
