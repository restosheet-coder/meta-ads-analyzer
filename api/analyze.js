export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }
    });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: 'API key not configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });

  const { ads, dateRange, model } = await req.json();
  if (!ads || ads.length === 0) return new Response(JSON.stringify({ error: 'No ad data' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  const selectedModel = model === 'sonnet' ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001';

  // Top 20 by spend — compact format
  const top = ads.slice().sort((a, b) => b.spend - a.spend).slice(0, 20).map(ad => {
    const s = ad.spend;
    const r = ad.roas > 0 ? ad.roas : null;
    const rev = r ? Math.round(s * r) : null;
    const pl = rev !== null ? rev - Math.round(s) : null;
    const er = ad.conversions > 0 ? Math.round(ad.conversions * 210) : 0;
    return `${ad.name}|${ad.campaignName || '-'}|${ad.adsetName || '-'}|spend:${Math.round(s)}|msg:${ad.conversions}|cpm:${ad.costPerMsg > 0 ? Math.round(ad.costPerMsg) : '-'}|ctr:${ad.ctr}|roas:${r || '-'}|rev:${rev || '-'}|pl:${pl || '-'}|expRev:${er}|${ad.status}`;
  });

  const prompt = `Facebook Ads Analyst สำหรับ RestoSheet (ซอฟต์แวร์ร้านอาหาร ฿2,100/ชิ้น ขายผ่าน Message)

AOV ฿2,100 | Margin 80% | Close rate 10% | Max CPMsg ฿42 | IG purchases track ไม่ได้
Benchmarks ไทย: CPM ฿120, CPC ฿11.50, CTR avg 1-2%, B2B ROAS avg 1.6x, target 3-4x

Data format: name|campaign|adset|spend|msg|cpm(cost/msg)|ctr|roas|trackedRevenue|profitLoss|expectedRevenue|status
ช่วง: ${dateRange}

${top.join('\n')}

Decision Rules:
เพิ่มงบ: pl>0 + cpm≤42 + msg≥20 หรือ roas≥5
ต่อ: pl>0 + cpm 42-55 หรือ cpm≤42 + roas 1-3
รอดูก่อน: cpm≤42 แต่ roas<1(ขาดทุน) หรือ msg<5+spend<500
หยุด: pl<0 + cpm>55 หรือ msg<5+spend>500 หรือ roas<1+cpm>42
ห้ามเพิ่มงบถ้า roas มีค่าและ<1 เด็ดขาด

ตอบ JSON เท่านั้น:
{"summary":"สรุป 2 ประโยค + total spend/revenue/profit","topInsight":"สิ่งที่ต้องทำทันที","creativeAdvice":"แนะนำว่าควรทำ creative ใหม่หรือไม่ ถ้าควร ควรทำแนว creative แบบไหน อ้างอิงจาก creative ที่ทำงานดี/ไม่ดี","ads":[{"name":"ชื่อ","campaign":"แคมเปญ","action":"เพิ่มงบ|ต่อ|รอดูก่อน|หยุด","reason":"CPMsg ฿X | Rev ฿X vs Spend ฿X = +/-฿X | เหตุผล"}]}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: selectedModel,
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
    result.model = selectedModel;

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
