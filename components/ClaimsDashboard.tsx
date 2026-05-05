'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase, type Claim } from '@/lib/supabase'
import ClaimCard from './ClaimCard'
import ClaimModal from './ClaimModal'
import StatsBar from './StatsBar'

export default function ClaimsDashboard() {
  const [claims, setClaims] = useState<Claim[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingClaim, setEditingClaim] = useState<Claim | null>(null)

  const fetchClaims = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('claims').select('*').order('created_at', { ascending: false })
    if (!error && data) setClaims(data as Claim[])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchClaims()
    const channel = supabase
      .channel('claims-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'claims' }, fetchClaims)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchClaims])

  const filtered = claims.filter(c => {
    const q = search.toLowerCase()
    const matchSearch = !q || [c.vehicle, c.claim_num, c.insurance, c.customer, c.adjuster, c.plate, c.vin]
      .some(f => (f || '').toLowerCase().includes(q))
    const matchStatus = statusFilter === 'all' || c.status === statusFilter
    return matchSearch && matchStatus
  })

  const openNew = () => { setEditingClaim(null); setModalOpen(true) }
  const openEdit = (c: Claim) => { setEditingClaim(c); setModalOpen(true) }

  const deleteClaim = async (id: string) => {
    if (!confirm('Delete this claim? This cannot be undone.')) return
    await supabase.from('claims').delete().eq('id', id)
    fetchClaims()
  }

  const updateStatus = async (id: string, status: Claim['status']) => {
    await supabase.from('claims').update({ status }).eq('id', id)
    fetchClaims()
  }

  return (
    <div className="min-h-screen bg-stone-100">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-semibold text-gray-900">Claims Dashboard</h1>
              <p className="text-xs text-gray-400 hidden sm:block">5 J's Automotive — shared shop view</p>
            </div>
          </div>
          <button onClick={openNew} className="btn btn-primary text-xs sm:text-sm py-1.5 px-3 sm:py-2 sm:px-4">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
            </svg>
            <span className="hidden sm:inline">New claim</span>
            <span className="sm:hidden">New</span>
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        <StatsBar claims={claims} />
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <circle cx="11" cy="11" r="8"/><path strokeLinecap="round" d="m21 21-4.35-4.35"/>
            </svg>
            <input className="form-input pl-9" placeholder="Search vehicle, claim #, insurance, customer..." value={search} onChange={e => setSearch(e.target.value)}/>
          </div>
          <select className="form-input sm:w-44" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="supplement">Supplement</option>
            <option value="complete">Complete</option>
          </select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-800 rounded-full animate-spin"/>
          </div>
        ) : filtered.length === 0 ? (
          <div className="card p-12 text-center">
            <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
              <rect x="3" y="3" width="18" height="18" rx="2"/><path strokeLinecap="round" d="M8 12h8M8 8h8M8 16h4"/>
            </svg>
            <p className="text-sm text-gray-400">
              {claims.length === 0 ? 'No claims yet — click New claim to add the first one.' : 'No claims match your search.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(claim => (
              <ClaimCard key={claim.id} claim={claim}
                onEdit={() => openEdit(claim)}
                onDelete={() => deleteClaim(claim.id)}
                onStatusChange={status => updateStatus(claim.id, status)}
              />
            ))}
          </div>
        )}
      </main>

      {modalOpen && (
        <ClaimModal
          claim={editingClaim}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); fetchClaims() }}
          existingClaims={claims}
        />
      )}
    </div>
  )
}
