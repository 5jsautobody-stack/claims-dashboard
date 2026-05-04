'use client'
import { type Claim } from '@/lib/supabase'

function parseMoney(v: string) {
  return parseFloat((v || '0').replace(/[^0-9.]/g, '')) || 0
}

export default function StatsBar({ claims }: { claims: Claim[] }) {
  const totalOwed = claims.reduce((sum, c) => sum + Math.max(0, parseMoney(c.est_amount) - parseMoney(c.paid)), 0)
  const stats = [
    { label: 'Total', value: claims.length.toString() },
    { label: 'Active', value: claims.filter(c => c.status === 'active').length.toString() },
    { label: 'Pending', value: claims.filter(c => c.status === 'pending').length.toString() },
    { label: 'Supplement', value: claims.filter(c => c.status === 'supplement').length.toString() },
    { label: 'Total Owed', value: '$' + totalOwed.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) },
  ]
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
      {stats.map(s => (
        <div key={s.label} className="card px-4 py-3">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">{s.label}</p>
          <p className="text-xl font-semibold text-gray-900">{s.value}</p>
        </div>
      ))}
    </div>
  )
}
