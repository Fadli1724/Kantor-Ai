/**
 * Backend Orchestrator Rook - Cloudflare Worker (versi Groq)
 * Secret yang dibutuhkan: GROQ_API_KEY, ALLOWED_ORIGIN
 * Opsional: GROQ_MODEL (kalau model bawaan sudah tidak tersedia)
 */
const AGENTS = ['Nova', 'Pixel', 'Byte', 'Echo', 'Sage', 'Ledger', 'Radar'];
const ROLES = {
  Nova: 'copywriter yang menulis naskah, caption, artikel, dan email',
  Pixel: 'desainer yang menyusun konsep visual: layout, palet warna hex, font, dan isi tiap elemen',
  Byte: 'developer yang menulis kode atau langkah teknis yang siap dipakai',
  Echo: 'customer service yang menyiapkan balasan dan FAQ yang ramah',
  Sage: 'periset yang merangkum temuan, poin penting, dan rekomendasi',
  Ledger: 'staf keuangan yang menyusun anggaran, rincian biaya, dan laporan',
  Radar: 'marketer yang menyusun rencana kampanye, jadwal publikasi, dan targeting',
};

const SYSTEM = `Kamu Rook, Project Manager sebuah tim AI. Bos Fadli memberi perintah tingkat tinggi.
Pecah menjadi 1-5 tugas kecil dan bagikan ke agen yang paling cocok. Satu agen satu tugas.
Agen:
- Nova: copywriter (naskah, caption, artikel, email)
- Pixel: desainer (visual, poster, logo, layout)
- Byte: developer (kode, web, bug, otomasi)
- Echo: customer service (balasan pelanggan, FAQ)
- Sage: riset (data, tren, kompetitor)
- Ledger: keuangan (anggaran, laporan, invoice)
- Radar: marketing (kampanye, iklan, jadwal publikasi)
Balas HANYA JSON valid dengan format:
{"plan":[{"agent":"Nova","task":"nulis naskah webinar","seconds":12}]}
"task" maksimal 6 kata, bahasa Indonesia santai. "seconds" antara 6 dan 20 sesuai bobot tugas.`;

export default {
  async fetch(req, env) {
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    const send = (obj, status = 200) =>
      new Response(JSON.stringify(obj), {
        status,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });

    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (req.method !== 'POST') return send({ error: 'POST only' }, 405);

    let body;
    try {
      body = await req.json();
    } catch {
      return send({ error: 'JSON tidak valid' }, 400);
    }
    const text = body.text;
    if (typeof text !== 'string' || !text.trim() || text.length > 500) {
      return send({ error: 'Perintah kosong atau terlalu panjang' }, 400);
    }

    if (body.mode === 'work') {
      if (!AGENTS.includes(body.agent) || typeof body.task !== 'string') {
        return send({ error: 'Agen tidak valid' }, 400);
      }
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + env.GROQ_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: env.GROQ_MODEL || 'llama-3.3-70b-versatile',
          max_tokens: 700,
          temperature: 0.7,
          messages: [
            {
              role: 'system',
              content: `Kamu ${body.agent}, ${ROLES[body.agent]} di tim Bos Fadli. Kerjakan tugasmu dan berikan HASIL JADI yang bisa langsung dipakai, dalam bahasa Indonesia, maksimal sekitar 250 kata, tanpa basa-basi pembuka.`,
            },
            { role: 'user', content: `Perintah Bos: ${text}\nTugasmu: ${body.task.slice(0, 100)}` },
          ],
        }),
      });
      if (!r.ok) return send({ error: 'Groq error ' + r.status }, 502);
      try {
        const d = await r.json();
        return send({ result: d.choices[0].message.content.trim() });
      } catch {
        return send({ error: 'Jawaban model tidak bisa dibaca' }, 502);
      }
    }

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + env.GROQ_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: env.GROQ_MODEL || 'llama-3.3-70b-versatile',
        max_tokens: 600,
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: text },
        ],
      }),
    });
    if (!res.ok) return send({ error: 'Groq error ' + res.status }, 502);

    try {
      const data = await res.json();
      const raw = data.choices[0].message.content.replace(/```json|```/g, '').trim();
      const plan = JSON.parse(raw).plan
        .filter((p) => AGENTS.includes(p.agent) && typeof p.task === 'string')
        .slice(0, 5);
      if (!plan.length) throw new Error('rencana kosong');
      return send({ plan });
    } catch {
      return send({ error: 'Jawaban model tidak bisa dibaca' }, 502);
    }
  },
};
