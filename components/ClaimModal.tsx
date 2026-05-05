'use client'

import { useState, useRef, useEffect } from 'react'
import { supabase, type Claim, type TowType, type TowCoverage, type EventLog } from '@/lib/supabase'

type FormData = Omit<Claim, 'id' | 'created_at' | 'updated_at'>

const empty: FormData = {
  claim_num: '', status: 'active', vehicle: '', vin: '', plate: '',
  insurance: '', policy: '', adjuster: '', adj_phone: '', adj_email: '',
  customer: '', est_amount: '', deductible: '', paid: '', date_in: '', date_eta: '',
  progress: 0, tech: '', notes: '', file_name: '', file_url: '',
  tow_type: 'none', tow_coverage: '', tow_amount: '', tow_company: '',
  events_log: '[]', payments: '[]',
}

function makeEvent(type: EventLog['type'], label: string, detail?: string): EventLog {
  return { id: Date.now().toString(), type, label, detail, timestamp: new Date().toISOString() }
}

export default function ClaimModal({ claim, onClose, onSaved, existingClaims }: {
  claim: Claim | null; onClose: () => void; onSaved: () => void; existingClaims: Claim[]
}) {
  const [form, setForm] = useState<FormData>(claim ? { ...claim } : { ...empty })
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [aiFilled, setAiFilled] = useState(false)
  const [aiError, setAiError] = useState('')
  const [error, setError] = useState('')
  const [isSupplementDetected, setIsSupplementDetected] = useState(false)
  const [supplementNumber, setSupplementNumber] = useState('')
  const [supplementAmount, setSupplementAmount] = useState('')
  const [matchedClaims, setMatchedClaims] = useState<Claim[]>([])
  const [selectedClaimId, setSelectedClaimId] = useState('')
  const [supplementMode, setSupplementMode] = useState<'link' | 'new' | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  const set = (k: keyof FormData, v: string | number) => setForm(f => ({ ...f, [k]: v }))

  const findMatchingClaims = (fields: Record<string, string>) =>
    existingClaims.filter(c =>
      (fields.vin && c.vin && fields.vin.toLowerCase() === c.vin.toLowerCase()) ||
      (fields.claim_num && c.claim_num && fields.claim_num.toLowerCase() === c.claim_num.toLowerCase()) ||
      (fields.vehicle && c.vehicle && c.vehicle.toLowerCase().includes(fields.vehicle.toLowerCase().slice(0, 8)))
    )

  const handleFile = async (f: File) => {
    if (f.size > 20 * 1024 * 1024) { setError('File must be under 20MB'); return }
    setFile(f); set('file_name', f.name)
    setAiFilled(false); setAiError(''); setIsSupplementDetected(false); setSupplementMode(null); setMatchedClaims([]); setSelectedClaimId('')
    if (!f.type.startsWith('image/') && f.type !== 'application/pdf') return
    setParsing(true)
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = e => resolve((e.target?.result as string).split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(f)
      })
      const res = await fetch('/api/parse-estimate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, mimeType: f.type }),
      })
      const data = await res.json()
      if (!res.ok || data.error) { setAiError(data.error || 'Could not read estimate.'); setParsing(false); return }
      const fields = data.fields
      if (fields.is_supplement === true) {
        setIsSupplementDetected(true)
        setSupplementNumber(fields.supplement_number || '')
        setSupplementAmount(fields.est_amount || '')
        const matches = findMatchingClaims(fields)
        setMatchedClaims(matches)
        if (matches.length === 1) setSelectedClaimId(matches[0].id)
        setForm(prev => ({
          ...prev,
          claim_num: fields.claim_num || prev.claim_num, vehicle: fields.vehicle || prev.vehicle,
          vin: fields.vin || prev.vin, plate: fields.plate || prev.plate,
          insurance: fields.insurance || prev.insurance, policy: fields.policy || prev.policy,
          adjuster: fields.adjuster || prev.adjuster, adj_phone: fields.adj_phone || prev.adj_phone,
          adj_email: fields.adj_email || prev.adj_email, customer: fields.customer || prev.customer,
        }))
      } else {
        setForm(prev => ({
          ...prev,
          claim_num: fields.claim_num || prev.claim_num, vehicle: fields.vehicle || prev.vehicle,
          vin: fields.vin || prev.vin, plate: fields.plate || prev.plate,
          insurance: fields.insurance || prev.insurance, policy: fields.policy || prev.policy,
          adjuster: fields.adjuster || prev.adjuster, adj_phone: fields.adj_phone || prev.adj_phone,
          adj_email: fields.adj_email || prev.adj_email, customer: fields.customer || prev.customer,
          est_amount: fields.est_amount || prev.est_amount,
          date_in: fields.date_in || prev.date_in, notes: fields.notes || prev.notes,
        }))
        setAiFilled(true)
      }
    } catch { setAiError('Could not read estimate. Fill in fields manually.') }
    setParsing(false)
  }

  const handleApplySupplement = async () => {
    if (!selectedClaimId) { setError('Please select a claim to link this supplement to.'); return }
    setSaving(true); setError('')
    const targetClaim = existingClaims.find(c => c.id === selectedClaimId)
    if (!targetClaim) { setError('Could not find the selected claim.'); setSaving(false); return }
    let fileUrl = targetClaim.file_url, fileName = targetClaim.file_name
    if (file) {
      const ext = file.name.split('.').pop()
      const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error: upErr } = await supabase.storage.from('estimates').upload(path, file)
      if (upErr) { setError('Upload failed: ' + upErr.message); setSaving(false); return }
      const { data } = supabase.storage.from('estimates').getPublicUrl(path)
      fileUrl = data.publicUrl; fileName = file.name
    }
    const existingAmt = parseFloat((targetClaim.est_amount || '0').replace(/[^0-9.]/g, '')) || 0
    const suppAmt = parseFloat((supplementAmount || '0').replace(/[^0-9.]/g, '')) || 0
    const newTotal = existingAmt + suppAmt
    const newTotalStr = '$' + newTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const suppLabel = supplementNumber ? `Supplement #${supplementNumber}` : 'Supplement'
    const suppNote = `${suppLabel} added: ${supplementAmount || 'amount unknown'}. New total: ${newTotalStr}.`
    const newNotes = targetClaim.notes ? `${targetClaim.notes}\n\n${suppNote}` : suppNote
    const existingEvents: EventLog[] = JSON.parse(targetClaim.events_log || '[]')
    const newEvent = makeEvent('supplement', `${suppLabel} received`, `Amount: ${supplementAmount || 'unknown'} → New total: ${newTotalStr}`)
    const updates: Partial<Claim> = {
      est_amount: newTotalStr, status: 'supplement', notes: newNotes,
      file_name: fileName, file_url: fileUrl,
      events_log: JSON.stringify([...existingEvents, newEvent]),
    }
    if (form.adjuster) updates.adjuster = form.adjuster
    if (form.adj_phone) updates.adj_phone = form.adj_phone
    if (form.adj_email) updates.adj_email = form.adj_email
    const { error: e } = await supabase.from('claims').update(updates).eq('id', selectedClaimId)
    if (e) { setError(e.message); setSaving(false); return }
    setSaving(false); onSaved()
  }

  const handleSave = async () => {
    if (!form.vehicle && !form.claim_num) { setError('Enter at least a vehicle or claim number.'); return }
    setSaving(true); setError('')
    let fileName = form.file_name, fileUrl = form.file_url
    if (file) {
      const ext = file.name.split('.').pop()
      const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error: upErr } = await supabase.storage.from('estimates').upload(path, file)
      if (upErr) { setError('Upload failed: ' + upErr.message); setSaving(false); return }
      const { data } = supabase.storage.from('estimates').getPublicUrl(path)
      fileName = file.name; fileUrl = data.publicUrl
    }
    let eventsLog = form.events_log || '[]'
    if (!claim) {
      const arrivedDetail = form.tow_type === 'us'
        ? `Towed by us — compensation applies${form.tow_amount ? ` ($${form.tow_amount})` : ''}`
        : form.tow_type === 'outside'
        ? `Towed by ${form.tow_company || 'outside party'} — ${form.tow_coverage === 'insurance' ? 'covered by insurance' : form.tow_coverage === 'outlaid' ? `we laid out money${form.tow_amount ? ` ($${form.tow_amount})` : ''}` : 'coverage TBD'}`
        : 'Drove in'
      eventsLog = JSON.stringify([makeEvent('arrived', 'Vehicle arrived at shop', arrivedDetail)])
    }
    const payload = { ...form, file_name: fileName, file_url: fileUrl, events_log: eventsLog }
    if (claim) {
      const { error: e } = await supabase.from('claims').update(payload).eq('id', claim.id)
      if (e) { setError(e.message); setSaving(false); return }
    } else {
      const { error: e } = await supabase.from('claims').insert([payload])
      if (e) { setError(e.message); setSaving(false); return }
    }
    setSaving(false); onSaved()
  }

  return (
    <div ref={overlayRef} className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto"
      onClick={e => { if (e.target === overlayRef.current) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl my-4 sm:my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{claim ? 'Edit claim' : 'New claim'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto max-h-[calc(100vh-160px)]">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/></svg>
              {error}
            </div>
          )}

          {/* Upload zone */}
          <div>
            <label className="form-label">Estimate file <span className="ml-1 normal-case text-blue-500 font-normal text-xs">AI auto-fills · detects supplements</span></label>
            <div className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${parsing ? 'border-blue-300 bg-blue-50' : isSupplementDetected ? 'border-orange-300 bg-orange-50' : aiFilled ? 'border-green-300 bg-green-50' : file ? 'border-green-300 bg-green-50' : 'border-gray-200 hover:border-blue-300 bg-gray-50 hover:bg-blue-50'}`}
              onClick={() => !parsing && fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f && !parsing) handleFile(f) }}>
              {parsing ? (
                <div className="flex flex-col items-center gap-2 py-1">
                  <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin"/>
                  <p className="text-sm text-blue-600 font-medium">Reading document with AI...</p>
                  <p className="text-xs text-blue-400">Takes about 10 seconds</p>
                </div>
              ) : isSupplementDetected ? (
                <div className="flex flex-col items-center gap-1">
                  <div className="flex items-center gap-2 text-orange-700 font-medium text-sm">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                    Supplement{supplementNumber ? ` #${supplementNumber}` : ''} detected!
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">Amount: <strong>{supplementAmount || 'unknown'}</strong> · {file?.name} <span className="ml-1 cursor-pointer text-blue-400 hover:underline" onClick={e => { e.stopPropagation(); setFile(null); set('file_name',''); set('file_url',''); setIsSupplementDetected(false); setSupplementMode(null) }}>Change</span></p>
                </div>
              ) : aiFilled ? (
                <div className="flex flex-col items-center gap-1">
                  <div className="flex items-center gap-2 text-green-700 font-medium text-sm">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    Fields filled from estimate!
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{file?.name} · <span className="cursor-pointer text-blue-400 hover:underline" onClick={e => { e.stopPropagation(); setFile(null); set('file_name',''); set('file_url',''); setAiFilled(false) }}>Change file</span></p>
                </div>
              ) : file ? (
                <div className="flex items-center justify-center gap-2 text-sm text-green-700 font-medium">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  {file.name} <button className="ml-1 text-gray-400 hover:text-gray-600" onClick={e => { e.stopPropagation(); setFile(null); set('file_name',''); set('file_url','') }}>✕</button>
                </div>
              ) : (
                <>
                  <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/></svg>
                  <p className="text-sm font-medium text-gray-600">Drop estimate or supplement PDF here</p>
                  <p className="text-xs text-gray-400 mt-1">PDF, JPG, PNG — AI reads it and fills the form</p>
                  <div className="inline-flex items-center gap-1.5 mt-3 bg-blue-100 text-blue-700 text-xs font-medium px-3 py-1.5 rounded-full">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                    Auto-fill with AI · Supplement detection
                  </div>
                </>
              )}
            </div>
            <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}/>
            {aiError && <div className="mt-2 flex items-center gap-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2"><svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>{aiError}</div>}
          </div>

          {/* Supplement chooser */}
          {isSupplementDetected && !supplementMode && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
              <p className="text-sm font-semibold text-orange-800 mb-1">Supplement{supplementNumber ? ` #${supplementNumber}` : ''} detected</p>
              <p className="text-xs text-orange-600 mb-3">This looks like a supplement for an existing claim.</p>
              <div className="flex gap-2">
                <button className="flex-1 py-2 px-3 bg-orange-600 text-white text-xs font-medium rounded-lg hover:bg-orange-700" onClick={() => setSupplementMode('link')}>Link to existing claim</button>
                <button className="flex-1 py-2 px-3 bg-white border border-orange-300 text-orange-700 text-xs font-medium rounded-lg hover:bg-orange-50" onClick={() => { setSupplementMode('new'); setAiFilled(true) }}>Create new claim</button>
              </div>
            </div>
          )}

          {/* Supplement link panel */}
          {isSupplementDetected && supplementMode === 'link' && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-orange-800">Link to existing claim</p>
                <button className="text-xs text-gray-400 hover:text-gray-600" onClick={() => setSupplementMode(null)}>← Back</button>
              </div>
              {matchedClaims.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-green-600 font-medium">✓ Found {matchedClaims.length} possible match{matchedClaims.length > 1 ? 'es' : ''}</p>
                  {matchedClaims.map(c => (
                    <label key={c.id} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer ${selectedClaimId === c.id ? 'border-orange-400 bg-orange-100' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
                      <input type="radio" name="claimSelect" value={c.id} checked={selectedClaimId === c.id} onChange={() => setSelectedClaimId(c.id)} className="mt-0.5"/>
                      <div><p className="text-sm font-medium text-gray-900">{c.vehicle || 'No vehicle'}</p><p className="text-xs text-gray-500">{c.claim_num ? `#${c.claim_num} · ` : ''}{c.insurance} · Current: {c.est_amount || '—'}</p></div>
                    </label>
                  ))}
                </div>
              )}
              <div>
                <label className="form-label">Or select claim manually</label>
                <select className="form-input" value={selectedClaimId} onChange={e => setSelectedClaimId(e.target.value)}>
                  <option value="">— Select a claim —</option>
                  {existingClaims.map(c => <option key={c.id} value={c.id}>{c.vehicle || 'No vehicle'}{c.claim_num ? ` · #${c.claim_num}` : ''}{c.est_amount ? ` · ${c.est_amount}` : ''}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Supplement amount</label>
                <input className="form-input" placeholder="$0.00" value={supplementAmount} onChange={e => setSupplementAmount(e.target.value)}/>
              </div>
              {selectedClaimId && (() => {
                const t = existingClaims.find(c => c.id === selectedClaimId)
                if (!t) return null
                const e = parseFloat((t.est_amount || '0').replace(/[^0-9.]/g, '')) || 0
                const s = parseFloat((supplementAmount || '0').replace(/[^0-9.]/g, '')) || 0
                return (
                  <div className="bg-white border border-orange-200 rounded-lg p-3 text-xs space-y-1">
                    <p className="font-medium text-gray-700">Summary of changes:</p>
                    <p className="text-gray-500">Current estimate: <strong className="text-gray-800">{t.est_amount || '—'}</strong></p>
                    <p className="text-gray-500">+ Supplement: <strong className="text-gray-800">{supplementAmount || '—'}</strong></p>
                    <p className="text-orange-700 font-semibold">= New total: ${(e+s).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</p>
                    <p className="text-gray-400">Status → Supplement needed · Event logged automatically</p>
                  </div>
                )
              })()}
            </div>
          )}

          {/* Main form */}
          {supplementMode !== 'link' && (
            <>
              {aiFilled && <p className="text-xs text-gray-400">Review fields below and correct anything before saving.</p>}
              <div className="grid grid-cols-2 gap-3">
                <div><label className="form-label">Claim number</label><input className="form-input" placeholder="CLM-2024-001" value={form.claim_num} onChange={e => set('claim_num', e.target.value)}/></div>
                <div><label className="form-label">Status</label>
                  <select className="form-input" value={form.status} onChange={e => set('status', e.target.value as Claim['status'])}>
                    <option value="active">Active</option><option value="pending">Pending approval</option>
                    <option value="supplement">Supplement needed</option><option value="complete">Complete</option>
                  </select>
                </div>
              </div>
              <div><label className="form-label">Vehicle (year / make / model)</label><input className="form-input" placeholder="2021 Toyota Camry" value={form.vehicle} onChange={e => set('vehicle', e.target.value)}/></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="form-label">VIN</label><input className="form-input font-mono text-xs" placeholder="17-digit VIN" value={form.vin} onChange={e => set('vin', e.target.value)}/></div>
                <div><label className="form-label">License plate</label><input className="form-input" placeholder="ABC-1234" value={form.plate} onChange={e => set('plate', e.target.value)}/></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="form-label">Insurance company</label><input className="form-input" placeholder="State Farm" value={form.insurance} onChange={e => set('insurance', e.target.value)}/></div>
                <div><label className="form-label">Policy number</label><input className="form-input" placeholder="Policy #" value={form.policy} onChange={e => set('policy', e.target.value)}/></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="form-label">Claims adjuster</label><input className="form-input" placeholder="Full name" value={form.adjuster} onChange={e => set('adjuster', e.target.value)}/></div>
                <div><label className="form-label">Adjuster phone</label><input className="form-input" placeholder="(555) 000-0000" value={form.adj_phone} onChange={e => set('adj_phone', e.target.value)}/></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="form-label">Adjuster email</label><input className="form-input" placeholder="adj@insurance.com" value={form.adj_email} onChange={e => set('adj_email', e.target.value)}/></div>
                <div><label className="form-label">Customer contact</label><input className="form-input" placeholder="Name & phone" value={form.customer} onChange={e => set('customer', e.target.value)}/></div>
              </div>

              {/* ── FINANCIALS ── */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Financials</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="form-label">Estimate amount</label><input className="form-input" placeholder="$0.00" value={form.est_amount} onChange={e => set('est_amount', e.target.value)}/></div>
                  <div>
                    <label className="form-label flex items-center gap-1">
                      Deductible
                      <span className="normal-case font-normal text-gray-400 text-xs">(owed by customer)</span>
                    </label>
                    <input className="form-input" placeholder="$0.00" value={form.deductible} onChange={e => set('deductible', e.target.value)}/>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="form-label">Paid / approved by insurance</label><input className="form-input" placeholder="$0.00" value={form.paid} onChange={e => set('paid', e.target.value)}/></div>
                  <div>
                    <label className="form-label">Balance owed</label>
                    <div className="form-input bg-white text-gray-700 font-medium cursor-default">
                      {(() => {
                        const est = parseFloat((form.est_amount || '0').replace(/[^0-9.]/g,'')) || 0
                        const paid = parseFloat((form.paid || '0').replace(/[^0-9.]/g,'')) || 0
                        const bal = Math.max(0, est - paid)
                        return bal > 0 ? '$' + bal.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) : '—'
                      })()}
                    </div>
                  </div>
                </div>
                {form.deductible && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-xs text-yellow-800">
                    💰 Deductible of <strong>{form.deductible}</strong> to be collected from customer at pickup
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div><label className="form-label">Date vehicle received</label><input type="date" className="form-input" value={form.date_in} onChange={e => set('date_in', e.target.value)}/></div>
                <div><label className="form-label">Estimated completion</label><input type="date" className="form-input" value={form.date_eta} onChange={e => set('date_eta', e.target.value)}/></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="form-label">Completion — {form.progress}%</label><input type="range" min={0} max={100} step={5} className="w-full mt-2" value={form.progress} onChange={e => set('progress', parseInt(e.target.value))}/></div>
                <div><label className="form-label">Assigned technician</label><input className="form-input" placeholder="Tech name" value={form.tech} onChange={e => set('tech', e.target.value)}/></div>
              </div>
              <div><label className="form-label">Notes / updates</label><textarea className="form-input min-h-20" placeholder="Parts status, supplement details, updates..." value={form.notes} onChange={e => set('notes', e.target.value)}/></div>

              {/* Tow tracking */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                <p className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/></svg>
                  Tow / arrival info
                </p>
                <div>
                  <label className="form-label">How did the vehicle arrive?</label>
                  <div className="grid grid-cols-3 gap-2">
                    {([['none','Drove in'],['us','Towed by us'],['outside','Outside tow']] as [TowType,string][]).map(([val,label]) => (
                      <button key={val} type="button"
                        className={`py-2 px-3 rounded-lg border text-xs font-medium transition-colors ${form.tow_type === val ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                        onClick={() => { set('tow_type', val); if (val !== 'outside') { set('tow_coverage',''); set('tow_company','') } }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {form.tow_type === 'us' && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-xs font-medium text-blue-800 mb-2">Towed by us — compensation applies</p>
                    <div><label className="form-label">Tow compensation amount</label><input className="form-input" placeholder="$0.00" value={form.tow_amount} onChange={e => set('tow_amount', e.target.value)}/></div>
                  </div>
                )}
                {form.tow_type === 'outside' && (
                  <div className="space-y-3">
                    <div><label className="form-label">Tow company name</label><input className="form-input" placeholder="ABC Towing" value={form.tow_company} onChange={e => set('tow_company', e.target.value)}/></div>
                    <div>
                      <label className="form-label">Was the tow covered?</label>
                      <div className="grid grid-cols-2 gap-2">
                        {([['insurance','✓ Covered by insurance'],['outlaid','💸 We laid out money']] as [TowCoverage,string][]).map(([val,label]) => (
                          <button key={val} type="button"
                            className={`py-2 px-3 rounded-lg border text-xs font-medium transition-colors ${form.tow_coverage === val ? val === 'insurance' ? 'bg-green-600 text-white border-green-600' : 'bg-red-600 text-white border-red-600' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                            onClick={() => set('tow_coverage', val)}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {form.tow_coverage === 'outlaid' && (
                      <div><label className="form-label">Amount laid out</label><input className="form-input" placeholder="$0.00" value={form.tow_amount} onChange={e => set('tow_amount', e.target.value)}/></div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          {supplementMode === 'link' ? (
            <button className="btn btn-primary min-w-36 justify-center" onClick={handleApplySupplement} disabled={saving || !selectedClaimId}>
              {saving ? <span className="flex items-center gap-2"><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Applying...</span> : 'Apply supplement'}
            </button>
          ) : (
            <button className="btn btn-primary min-w-28 justify-center" onClick={handleSave} disabled={saving || parsing}>
              {saving ? <span className="flex items-center gap-2"><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Saving...</span>
              : parsing ? 'Reading...' : claim ? 'Save changes' : 'Add claim'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
