import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { base64, mimeType } = await req.json()

    if (!base64 || !mimeType) {
      return NextResponse.json({ error: 'Missing file data' }, { status: 400 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
    }

    const isImage = mimeType.startsWith('image/')

    const contentBlock = isImage
      ? { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } }
      : { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }

    const prompt = `You are reading an auto body / collision repair estimate document. Extract all available information and return ONLY a valid JSON object with these exact keys (use empty string "" for any field not found):

{
  "claim_num": "claim number or file number",
  "vehicle": "year make model trim (e.g. 2021 Toyota Camry LE)",
  "vin": "full VIN number",
  "plate": "license plate number",
  "insurance": "insurance company name",
  "policy": "policy number",
  "adjuster": "claims adjuster full name",
  "adj_phone": "adjuster phone number",
  "adj_email": "adjuster email address",
  "customer": "vehicle owner full name and phone number",
  "est_amount": "total estimate dollar amount (e.g. $4,250.00)",
  "date_in": "date vehicle was received in YYYY-MM-DD format",
  "notes": "brief summary of damage and work needed, 2-3 sentences max"
}

Return ONLY the JSON object. No markdown fences, no explanation, no extra text.`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
