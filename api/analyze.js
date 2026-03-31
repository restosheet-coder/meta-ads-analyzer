export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key not configured' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }

  const { ads, dateRange } = await req.json();
  if (!ads || ads.length === 0) {
    return new Response(JSON.stringify({ error: 'No ad data provided' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }

  // Build ad summary table for Claude — top 50 by spend only
  const adTable = ads
    .slice()
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 50)
    .map(ad => ({
      name: ad.name,
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
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    const text = data.content[0].text.trim();
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}') + 1;
    const result = JSON.parse(text.slice(jsonStart, jsonEnd));

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
