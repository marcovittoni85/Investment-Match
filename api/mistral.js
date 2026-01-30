export const config = { maxDuration: 120 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'MISTRAL_API_KEY missing' });

  try {
    const { prompt, maxTokens = 4096 } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt required' });

    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'mistral-large-latest',
        max_tokens: maxTokens,
        messages: [
          { 
            role: 'system', 
            content: 'Sei un esperto M&A advisor specializzato in private equity e family office europei. Rispondi in italiano con dati precisi e nomi reali.'
          },
          { role: 'user', content: prompt }
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Mistral error:', response.status, errText);
      return res.status(response.status).json({ error: 'Mistral API error', details: errText });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    
    return res.status(200).json({ success: true, text, provider: 'mistral' });
  } catch (error) {
    console.error('Mistral server error:', error);
    return res.status(500).json({ error: error.message, provider: 'mistral' });
  }
}
