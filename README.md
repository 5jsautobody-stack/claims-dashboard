# Claims Dashboard — 5JS Auto Body

Auto body shop claims tracker built with Next.js, Supabase, and Vercel.

---

## Setup Guide

### Step 1 — Supabase database (already done ✓)
Your SQL schema is already run. Your project URL is:
`https://fdabsjdtxihqivoxcejw.supabase.co`

### Step 2 — Get your API keys
1. In Supabase: **Settings (gear icon) → API Keys**
2. Copy the **Publishable key** (starts with `sb_publishable_...`)

### Step 3 — Add environment variables
Create a file called `.env.local` in this folder (copy from `.env.local.example`):

```
NEXT_PUBLIC_SUPABASE_URL=https://fdabsjdtxihqivoxcejw.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_your_full_key_here
```

### Step 4 — Push to GitHub
1. Create a new repo at github.com
2. Upload or push this entire folder to it

### Step 5 — Deploy to Vercel
1. Go to vercel.com → **New Project** → import your GitHub repo
2. Add environment variables (same two as above)
3. Click **Deploy**
4. Share the live URL with your whole shop!

---

## Features
- Real-time updates — all shop users see changes instantly
- File uploads — estimates stored in Supabase Storage
- Status tracking: Active / Pending / Supplement / Complete
- Progress bar, ETA countdown, balance owed auto-calculated
- Search and filter across all claims
- Quick status change without opening the edit modal
