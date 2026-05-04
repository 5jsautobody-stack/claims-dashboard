import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey)

export type ClaimStatus = 'active' | 'pending' | 'supplement' | 'complete'

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
  paid: string
  date_in: string
  date_eta: string
  progress: number
  tech: string
  notes: string
  file_name: string
  file_url: string
  created_at: string
  updated_at: string
}
