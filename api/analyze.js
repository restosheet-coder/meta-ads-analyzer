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
- AOV (Average Order Value): ฿2,100
- Objective: Messages (Click-to-Message)
- Target margin: 80% → ต้นทุนที่ยอมได้ต่อ 1 sale = ฿420 (฿2,100 × 20%)
- Close rate จาก message: ~10% → Max CPMsg = ฿42 (฿420 ÷ 10)
- **การคำนวณกำไร/ขาดทุนต่อ creative:**
  - Tracked Revenue = Spend × ROAS
  - Profit/Loss = Tracked Revenue - Spend
  - Expected Revenue จาก messages = Messages × ฿2,100 × 10% (close rate)
  - ถ้า Spend > Expected Revenue → ใช้เงินเกินกว่าที่ควรจะได้กลับมา

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

**Decision Matrix — ต้องดูหลายปัจจัยรวมกัน ห้ามดูแค่ CPMsg อย่างเดียว:**

สถานการณ์ 1: CPMsg ต่ำ (≤฿42) + ROAS สูง (≥3x) + Messages เยอะ (≥20) + กำไร (Revenue > Spend)
→ "เพิ่มงบ" — ดีที่สุด ข้อความถูก ขายได้จริง คุ้มค่า AOV

สถานการณ์ 2: CPMsg ต่ำ (≤฿42) + ROAS ต่ำ (<1) = ขาดทุนจริง (Revenue < Spend)
→ "รอดูก่อน" — CPMsg ถูกแต่ขาดทุน ห้ามเพิ่มงบ ระบุจำนวนเงินที่ขาดทุนด้วย

สถานการณ์ 3: CPMsg สูง (>฿42) + ROAS สูง (≥3x) + กำไร
→ "ต่อ" — message แพงแต่ขายได้จริง คุ้ม AOV ควร optimize creative เพื่อลด CPMsg

สถานการณ์ 4: CPMsg สูง (>฿55) + ROAS ต่ำ (<1) หรือ ขาดทุน
→ "หยุด" — แพงทั้ง CPMsg + ขาดทุน ระบุจำนวนเงินที่เสียไป

สถานการณ์ 5: Messages น้อยมาก (<5) + Spend > ฿500
→ "หยุด" — ใช้เงิน > ฿500 แต่ได้แค่ <5 messages ไม่คุ้ม AOV

สถานการณ์ 6: Messages น้อยมาก (<5) + Spend < ฿500
→ "รอดูก่อน" — data ไม่พอ แต่ยังไม่เสียเงินมาก

สถานการณ์ 7: CTR สูง (>4%) แต่ Messages น้อยเมื่อเทียบกับ clicks
→ ระบุใน reason: creative ดึงดูดคนกดแต่ไม่ convert เป็น message

**ทุกคำแนะนำต้องระบุ:**
- CPMsg เท่าไหร่
- Tracked Revenue vs Spend (กำไร/ขาดทุนเท่าไหร่)
- ถ้ามี ROAS ให้คำนวณ: Spend × ROAS = Revenue → กำไร/ขาดทุน = Revenue - Spend

**กฎเพิ่มเติม:**
- ROAS จาก Meta Pixel ไม่ครบ (IG message purchases track ไม่ได้) ใช้เป็น signal ไม่ใช่ absolute truth
- ถ้า ROAS = null/0 → ไม่ลงโทษ ROAS แต่ก็ไม่ได้ bonus ให้ตัดสินจาก CPMsg + volume
- ถ้า ROAS มีค่าและ < 1 → ห้ามเพิ่มงบเด็ดขาด แม้ CPMsg จะต่ำ
- ROAS ≥ 5x → เพิ่มงบได้แม้ CPMsg สูง (override)
- Ad ที่ paused → ระบุว่า paused อยู่ พร้อมแนะนำว่าควร restart หรือไม่`;

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
