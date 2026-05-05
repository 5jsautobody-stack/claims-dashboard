import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey)

export type ClaimStatus = 'active' | 'pending' | 'supplement' | 'complete'
export type TowType = 'none' | 'us' | 'outside'
export type TowCoverage = 'insurance' | 'outlaid' | ''

export type EventLog = {
  id: string
  type: 'arrived' | 'departed' | 'supplement' | 'status_change' | 'note' | 'payment'
  label: string
  detail?: string
  timestamp: string
}

export type PaymentConfirmation = {
  id: string
  amount: string
  method: string
  note: string
  file_name: string
  file_url: string
  timestamp: string
}

export type Claim = {
  id: string
  claim_num: string
  status: ClaimStatus
  vehicle: string
  vin: string
  plate: string
  insurance: string
  policy: string
  adjuster: string
  adj_phone: string
  adj_email: string
  customer: string
  est_amount: string
  deductible: string
  paid: string
  date_in: string
  date_eta: string
  progress: number
  tech: string
  notes: string
  file_name: string
  file_url: string
  tow_type: TowType
  tow_coverage: TowCoverage
  tow_amount: string
  tow_company: string
  events_log: string        // JSON string of EventLog[]
  payments: string          // JSON string of PaymentConfirmation[]
  created_at: string
  updated_at: string
}
