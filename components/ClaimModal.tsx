'use client'

import { useState, useRef, useEffect } from 'react'
import { supabase, type Claim } from '@/lib/supabase'

type FormData = Omit<Claim, 'id' | 'created_at' | 'updated_at'>

const empty: FormData = {
  claim_num: '', status: 'active', vehicle: '', vin: '', plate: '',
  insurance: '', policy: '', adjuster: '', adj_phone: '', adj_email: '',
  customer: '', est_amount: '', paid: '', date_in: '', date_eta: '',
  progress: 0, tech: '', notes: '', file_name: '', file_url: '',
}

export default function ClaimModal({ claim, onClose, onSaved }: { claim: Claim | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<FormData>(claim ? { ...claim } : { ...empty })
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  const set = (k: keyof FormData, v: string | number) => setForm(f => ({ ...f, [k]: v }))

  const handleFile = (f: File) => {
    if (f.size > 20 * 1024 * 1024) { setError('File must be under 20MB'); return }
    setFile(f); set('file_name', f.name)
  }

  const handleSave = async () => {
    if (!form.vehicle && !form.claim_num) { setError('Enter at least a vehicle or claim number.'); return }
    setSaving(true); setError('')

    let fileName = form.file_name
    let fileUrl = form.file_url

    if (file) {
      const ext = file.name.split('.').pop()
      const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error: upErr } = await supabase.storage.from('estimates').upload(path, file)
      if (upErr) { setError('Upload failed: ' + upErr.message); setSaving(false); return }
      const { data } = supabase.storage.from('estimates').getPublicUrl(path)
      fileName = file.name
      fileUrl = data.publicUrl
    }

    const payload = { ...form, file_name: fileName, file_url: fileUrl }

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
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto max-h-[calc(100vh-160px)]">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="0.5" fill="currentColor"/>
              </svg>
              {error}
            </div>
          )}

          {/* File upload */}
          <div>
            <label className="form-label">Estimate file</label>
            <div className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors ${file || form.file_name ? 'border-green-300 bg-green-50' : 'border-gray-200 hover:border-gray-300 bg-gray-50'}`}
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}>
              {file || form.file_name ? (
                <div className="flex items-center justify-center gap-2 text-sm text-green-700 font-medium">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                  {file?.name || form.file_name}
                  <button className="ml-1 text-gray-400 hover:text-gray-600" onClick={e => { e.stopPropagation(); setFile(null); set('file_name', ''); set('file_url', '') }}>✕</button>
                </div>
              ) : (
                <>
                  <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/>
                  </svg>
                  <p className="text-sm text-gray-500 font-medium">Drop estimate or click to upload</p>
                  <p className="text-xs text-gray-400 mt-1">PDF, JPG, PNG — up to 20MB</p>
                </>
              )}
            </div>
            <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className="form-label">Claim number</label><input className="form-input" placeholder="CLM-2024-001" value={form.claim_num} onChange={e => set('claim_num', e.target.value)} /></div>
            <div><label className="form-label">Status</label>
              <select className="form-input" value={form.status} onChange={e => set('status', e.target.value as Claim['status'])}>
                <option value="active">Active</option>
                <option value="pending">Pending approval</option>
                <option value="supplement">Supplement needed</option>
                <option value="complete">Complete</option>
              </select>
            </div>
          </div>

          <div><label className="form-label">Vehicle (year / make / model)</label><input className="form-input" placeholder="2021 Toyota Camry" value={form.vehicle} onChange={e => set('vehicle', e.target.value)} /></div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className="form-label">VIN</label><input className="form-input font-mono text-xs" placeholder="17-digit VIN" value={form.vin} onChange={e => set('vin', e.target.value)} /></div>
            <div><label className="form-label">License plate</label><input className="form-input" placeholder="ABC-1234" value={form.plate} onChange={e => set('plate', e.target.value)} /></div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className="form-label">Insurance company</label><input className="form-input" placeholder="State Farm" value={form.insurance} onChange={e => set('insurance', e.target.value)} /></div>
            <div><label className="form-label">Policy number</label><input className="form-input" placeholder="Policy #" value={form.policy} onChange={e => set('policy', e.target.value)} /></div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className="form-label">Claims adjuster</label><input className="form-input" placeholder="Full name" value={form.adjuster} onChange={e => set('adjuster', e.target.value)} /></div>
            <div><label className="form-label">Adjuster phone</label><input className="form-input" placeholder="(555) 000-0000" value={form.adj_phone} onChange={e => set('adj_phone', e.target.value)} /></div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className="form-label">Adjuster email</label><input className="form-input" placeholder="adj@insurance.com" value={form.adj_email} onChange={e => set('adj_email', e.target.value)} /></div>
            <div><label className="form-label">Customer contact</label><input className="form-input" placeholder="Name & phone" value={form.customer} onChange={e => set('customer', e.target.value)} /></div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className="form-label">Estimate amount</label><input className="form-input" placeholder="$0.00" value={form.est_amount} onChange={e => set('est_amount', e.target.value)} /></div>
            <div><label className="form-label">Paid / approved</label><input className="form-input" placeholder="$0.00" value={form.paid} onChange={e => set('paid', e.target.value)} /></div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className="form-label">Date vehicle received</label><input type="date" className="form-input" value={form.date_in} onChange={e => set('date_in', e.target.value)} /></div>
            <div><label className="form-label">Estimated completion</label><input type="date" className="form-input" value={form.date_eta} onChange={e => set('date_eta', e.target.value)} /></div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Completion — {form.progress}%</label>
              <input type="range" min={0} max={100} step={5} className="w-full mt-2" value={form.progress} onChange={e => set('progress', parseInt(e.target.value))} />
            </div>
            <div><label className="form-label">Assigned technician</label><input className="form-input" placeholder="Tech name" value={form.tech} onChange={e => set('tech', e.target.value)} /></div>
          </div>

          <div><label className="form-label">Notes / updates</label><textarea className="form-input min-h-20" placeholder="Parts status, supplement details, updates..." value={form.notes} onChange={e => set('notes', e.target.value)} /></div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary min-w-24 justify-center" onClick={handleSave} disabled={saving}>
            {saving ? (
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                Saving...
              </span>
            ) : claim ? 'Save changes' : 'Add claim'}
          </button>
        </div>
      </div>
    </div>
  )
}
