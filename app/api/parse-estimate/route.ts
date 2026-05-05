import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { base64, mimeType } = await req.json()
    if (!base64 || !mimeType) return NextResponse.json({ error: 'Missing file data' }, { status: 400 })
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'API key not configured' }, { status: 500 })

    const isImage = mimeType.startsWith('image/')
    const contentBlock = isImage
      ? { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } }
      : { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }

    const prompt = `You are reading an auto body / collision repair document. It may be an original estimate, a supplement, or a combined document showing multiple estimates and supplements.

IMPORTANT: Scan the ENTIRE document thoroughly. Look for ALL of the following:
- The original estimate amount
- Any Supplement #1 amount
- Any Supplement #2 amount  
- Any additional supplements
- Each may appear as a separate section, page, or line item

Return ONLY a valid JSON object with these exact keys (empty string for any field not found):
{
  "is_supplement": true or false (true only if this document is ONLY a supplement with no original estimate),
  "supplement_number": "1, 2, 3 etc — only if is_supplement is true",
  "claim_num": "claim or file number",
  "vehicle": "year make model trim",
  "vin": "full VIN",
  "plate": "license plate",
  "insurance": "insurance company name",
  "policy": "policy number",
  "adjuster": "adjuster full name",
  "adj_phone": "adjuster phone",
  "adj_email": "adjuster email",
  "customer": "owner name and phone",
  "date_in": "date received YYYY-MM-DD — empty string if not found",
  "notes": "2-3 sentence damage summary",
  "estimate_breakdown": [
    {
      "label": "Original Estimate",
      "amount": "$0.00",
      "date": "YYYY-MM-DD or empty string"
    },
    {
      "label": "Supplement #1",
      "amount": "$0.00",
      "date": "YYYY-MM-DD or empty string"
    }
  ]
}

The estimate_breakdown array must contain ONE entry for EACH distinct estimate or supplement found in the document.
If only one amount is found, still return it as an array with one item labeled "Original Estimate".
The total est_amount should NOT be included separately — it will be calculated from the breakdown.

Return ONLY the JSON. No markdown, no explanation.`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 1500,
        messages: [{ role: 'user', content: [contentBlock, { type: 'text', text: prompt }] }],
      }),
    })

    if (!response.ok) {
      const err = await response.json()
      return NextResponse.json({ error: err.error?.message || 'API error' }, { status: 500 })
    }

    const data = await response.json()
    const text = data.content?.find((b: { type: string }) => b.type === 'text')?.text || ''
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())

    // Calculate total from breakdown
    const breakdown: { label: string; amount: string; date: string }[] = parsed.estimate_breakdown || []
    const total = breakdown.reduce((sum, item) => {
      return sum + (parseFloat((item.amount || '0').replace(/[^0-9.]/g, '')) || 0)
    }, 0)
    parsed.est_amount = total > 0
      ? '$' + total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : ''

    return NextResponse.json({ fields: parsed })
  } catch (err) {
    console.error('Parse estimate error:', err)
    return NextResponse.json({ error: 'Failed to parse estimate' }, { status: 500 })
  }
}
