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

    const prompt = `You are reading an auto body repair estimate. Extract info and return ONLY valid JSON with these keys (empty string if not found): {"claim_num":"","vehicle":"","vin":"","plate":"","insurance":"","policy":"","adjuster":"","adj_phone":"","adj_email":"","customer":"","est_amount":"","date_in":"","notes":""}`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: [
              contentBlock,
              { type: 'text', text: prompt },
            ],
          },
        ],
      }),
    })

    if (!response.ok) {
      const err = await response.json()
      return NextResponse.json({ error: err.error?.message || 'API error' }, { status: 500 })
    }

    const data = await response.json()
    const text = data.content?.find((b: { type: string }) => b.type === 'text')?.text || ''
    const cleaned = text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(cleaned)

    return NextResponse.json({ fields: parsed })
  } catch (err) {
    console.error('Parse estimate error:', err)
    return NextResponse.json({ error: 'Failed to parse estimate' }, { status: 500 })
  }
}
