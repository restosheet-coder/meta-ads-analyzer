export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const { ads, dateRange } = req.body;
  if (!ads || ads.length === 0) return res.status(400).json({ error: 'No ad data provided' });

  // Build ad summary table for Claude — top 50 by spend only
  const adTable = ads
    .slice()
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 25)
    .map(ad => ({
      name: ad.name,
      campaign: ad.campaignName || '—',
      adset: ad.adsetName || '—',
      spend: ad.spend,
      messages: ad.conversions,
      costPerMsg: ad.costPerMsg > 0 ? ad.costPerMsg : null,
      ctr: ad.ctr,
      roas: ad.roas > 0 ? ad.roas : null,
      status: ad.status,
    }));

  const prompt = `คุณเป็น Facebook Ads Analyst ผู้เชี่ยวชาญ วิเคราะห์ข้อมูลโฆษณาต่อไปนี้และให้คำแนะนำที่ actionable

**บริบทธุรกิจ:**
- สินค้า: RestoSheet (ซอฟต์แวร์บริหารร้านอาหาร)
- ราคาขายเฉลี่ย: ฿2,100
- Objective: Messages (Click-to-Message)
- Target margin: 80%
- Max Cost per Message เพื่อ breakeven: ~฿42 (สมมติ close rate 10%)

**ช่วงเวลา:** ${dateRange}

**ข้อมูลโฆษณา (เรียงตาม Spend มากไปน้อย):**
${JSON.stringify(adTable, null, 2)}

**สิ่งที่ต้องการ:**
ตอบเป็น JSON ตามรูปแบบนี้เท่านั้น ห้ามมีข้อความอื่น:
{
  "summary": "สรุปภาพรวม 2-3 ประโยค",
  "topInsight": "insight สำคัญที่สุด 1 อย่างที่ควรทำทันที",
  "ads": [
    {
      "name": "ชื่อโฆษณา",
      "campaign": "ชื่อแคมเปญ",
      "action": "เพิ่มงบ | ต่อ | รอดูก่อน | หยุด",
      "reason": "เหตุผลสั้นๆ 1 ประโยค"
    }
  ]
}

วิเคราะห์เชิงลึก พิจารณา: CPMsg เทียบกับ threshold, ROAS, CTR trend, และ budget allocation`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 8192,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    const text = data.content[0].text.trim();
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}') + 1;
    const result = JSON.parse(text.slice(jsonStart, jsonEnd));

    return res.status(200).json(result);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
