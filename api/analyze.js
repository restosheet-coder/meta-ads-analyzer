export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const { ads, dateRange, model } = req.body;
  if (!ads || ads.length === 0) return res.status(400).json({ error: 'No ad data provided' });

  // Model selection — default Haiku, allow Sonnet override
  const selectedModel = model === 'sonnet' ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001';

  // Build ad summary table — top 25 by spend
  const adTable = ads
    .slice()
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 25)
    .map(ad => {
      const spend = ad.spend;
      const roas = ad.roas > 0 ? ad.roas : null;
      const trackedRevenue = roas ? Math.round(spend * roas) : null;
      const profitLoss = trackedRevenue !== null ? trackedRevenue - spend : null;
      const expectedRevenue = ad.conversions > 0 ? Math.round(ad.conversions * 2100 * 0.10) : 0;

      return {
        name: ad.name,
        campaign: ad.campaignName || '—',
        adset: ad.adsetName || '—',
        spend: Math.round(spend),
        messages: ad.conversions,
        costPerMsg: ad.costPerMsg > 0 ? Math.round(ad.costPerMsg * 100) / 100 : null,
        ctr: ad.ctr,
        roas: roas ? Math.round(roas * 100) / 100 : null,
        trackedRevenue,
        profitLoss,
        expectedRevenue,
        status: ad.status,
      };
    });

  const prompt = `คุณเป็น Senior Facebook Ads Analyst ผู้เชี่ยวชาญด้าน Click-to-Message campaigns สำหรับ B2B SaaS ในไทย

**บริบทธุรกิจ:**
- สินค้า: RestoSheet (ซอฟต์แวร์บริหารร้านอาหาร ขายผ่าน Message)
- AOV: ฿2,100 (ราคาเดียว ไม่มี subscription)
- Objective: Messages (Click-to-Message → Messenger + IG DM)
- Target margin: 80% → ต้นทุนที่ยอมได้ต่อ 1 sale = ฿420
- Close rate จาก message: ~10% → Max CPMsg = ฿42
- IG message purchases track ไม่ได้ด้วย pixel → ROAS จาก Meta ต่ำกว่าความจริง

**Industry Benchmarks (Thailand 2025-2026):**
- CPM ไทยเฉลี่ย: ฿120 (ขึ้นทุกปี)
- CPC ไทยเฉลี่ย: ฿11.50
- CTR เฉลี่ย B2B SaaS: 1-2% (ถ้า >3% ถือว่าดีมาก)
- ROAS เฉลี่ย B2B SaaS: 1.6x (mid-ticket target: 3-4x)
- Message-to-Sale conversion: 10-15% (ดี), 18%+ (ยอดเยี่ยม)
- Response time ภายใน 1 นาที → conversion สูงขึ้น 21 เท่า

**ข้อมูลที่คำนวณให้แล้ว (ต่อ creative):**
- trackedRevenue = Spend × ROAS (ยอดขายที่ pixel track ได้)
- profitLoss = trackedRevenue - Spend (กำไร/ขาดทุนจริง)
- expectedRevenue = Messages × ฿2,100 × 10% (รายได้ที่คาดหวังจาก messages)

**ช่วงเวลา:** ${dateRange}

**ข้อมูลโฆษณา:**
${JSON.stringify(adTable, null, 2)}

**Decision Matrix — ตัดสินจากหลายปัจจัยรวมกัน:**

🟢 "เพิ่มงบ" เมื่อ:
- profitLoss > 0 (กำไรจริง) + CPMsg ≤ ฿42 + Messages ≥ 20
- หรือ ROAS ≥ 5x (override แม้ CPMsg สูง แต่ต้องกำไร)
- ต้องระบุ: กำไรเท่าไหร่ + ควรเพิ่มที่ campaign ไหน

🟢 "ต่อ" เมื่อ:
- profitLoss > 0 + CPMsg ระหว่าง ฿42-55
- หรือ CPMsg ≤ ฿42 + ROAS 1-3x (พอได้ แต่ยังไม่ดีพอจะ scale)
- หรือ CPMsg สูง แต่ ROAS ≥ 3x (ขายได้จริง ให้ optimize creative)

🟡 "รอดูก่อน" เมื่อ:
- CPMsg ถูก (≤ ฿42) แต่ ROAS < 1 = ขาดทุน tracked purchases → ห้ามเพิ่มงบเด็ดขาด
- Messages < 5 + Spend < ฿500 (data ไม่พอ)
- ROAS null + CPMsg ปานกลาง (ไม่มี signal ชัดเจน)

🔴 "หยุด" เมื่อ:
- profitLoss < 0 (ขาดทุน) + CPMsg > ฿55
- Messages < 5 + Spend > ฿500 (จ่ายเยอะแต่ไม่ได้ message)
- Spend > expectedRevenue × 2 (ใช้เงินเกินกว่าที่ควรได้ 2 เท่า)
- ROAS < 1 + CPMsg > ฿42 (ขาดทุนทุกมิติ)

**ข้อควรระวังที่ต้องดู:**
- CTR สูง (>4%) แต่ Messages น้อยเมื่อเทียบกับ clicks → creative misleading
- CPMsg ถูกมาก แต่ ROAS < 1 → ได้ message ถูกแต่คนไม่ซื้อ (audience ผิด)
- Spend สูงมากในแคมเปญเดียว → ควรกระจายงบหรือไม่?
- หลาย creative ใช้ budget รวมกัน → ดูระดับ campaign ด้วย

**สิ่งที่ต้องตอบ (JSON เท่านั้น ห้ามมีข้อความอื่น):**
{
  "summary": "สรุปภาพรวม 2-3 ประโยค พร้อม total spend, total tracked revenue, overall profit/loss",
  "topInsight": "insight สำคัญที่สุด 1 อย่างที่ควรทำทันที พร้อมระบุตัวเลข",
  "ads": [
    {
      "name": "ชื่อโฆษณา",
      "campaign": "ชื่อแคมเปญ",
      "action": "เพิ่มงบ | ต่อ | รอดูก่อน | หยุด",
      "reason": "CPMsg ฿XX | Revenue ฿XX vs Spend ฿XX = กำไร/ขาดทุน ฿XX | เหตุผล"
    }
  ]
}`;

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

    // Add model info to response
    result.model = selectedModel;

    return res.status(200).json(result);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
