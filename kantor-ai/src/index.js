/**
 * Backend Orchestrator Rook - Cloudflare Worker (Groq, versi tahan banting)
 * Secret wajib: GROQ_API_KEY. Opsional: GROQ_MODEL.
 * Cek status: buka https://NAMA-WORKER.SUBDOMAIN.workers.dev/status
 * Catatan: CORS dibuka untuk semua origin agar pasti jalan. Kunci ke domainmu nanti kalau sudah stabil.
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
const PLAN_PROMPT = `Kamu Rook, Project Manager sebuah tim AI. Bos Fadli memberi perintah tingkat tinggi.
Pecah menjadi 1-5 tugas kecil dan bagikan ke agen yang paling cocok. Satu agen satu tugas.
Agen: Nova (copywriter), Pixel (desainer), Byte (developer), Echo (customer service), Sage (riset), Ledger (keuangan), Radar (marketing).
Balas HANYA JSON valid dengan format:
{"plan":[{"agent":"Nova","task":"nulis naskah webinar","seconds":12}]}
"task" maksimal 6 kata, bahasa Indonesia santai. "seconds" antara 6 dan 20.`;

async function groq(env, messages, json, max, temp) {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.GROQ_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      max_tokens: max,
      temperature: temp,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
      messages,
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Groq ' + r.status + ': ' + ((d.error && d.error.message) || 'error'));
  return d.choices[0].message.content;
}

export default {
  async fetch(req, env) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    const send = (obj, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

    try {
      if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
      if (req.method === 'GET') {
        return send({ ok: true, hasKey: !!env.GROQ_API_KEY, model: env.GROQ_MODEL || 'default' });
      }
      if (req.method !== 'POST') return send({ error: 'POST only' }, 405);
      if (!env.GROQ_API_KEY) return send({ error: 'GROQ_API_KEY belum dipasang' }, 500);

      const body = await req.json();
      const text = body.text;
      if (typeof text !== 'string' || !text.trim() || text.length > 500) {
        return send({ error: 'Perintah kosong atau terlalu panjang' }, 400);
      }

      if (body.mode === 'work') {
        if (!AGENTS.includes(body.agent) || typeof body.task !== 'string') {
          return send({ error: 'Agen tidak valid' }, 400);
        }
        const out = await groq(env, [
          {
            role: 'system',
            content: `Kamu ${body.agent}, ${ROLES[body.agent]} di tim Bos Fadli. Kerjakan tugasmu dan berikan HASIL JADI yang bisa langsung dipakai, dalam bahasa Indonesia, maksimal sekitar 250 kata, tanpa basa-basi pembuka.`,
          },
          { role: 'user', content: `Perintah Bos: ${text}\nTugasmu: ${body.task.slice(0, 100)}` },
        ], false, 700, 0.7);
        return send({ result: out.trim() });
      }

      const raw = await groq(env, [
        { role: 'system', content: PLAN_PROMPT },
        { role: 'user', content: text },
      ], true, 600, 0.4);
      const plan = JSON.parse(raw.replace(/```json|```/g, '').trim()).plan
        .filter((p) => AGENTS.includes(p.agent) && typeof p.task === 'string')
        .slice(0, 5);
      if (!plan.length) throw new Error('rencana kosong');
      return send({ plan });
    } catch (e) {
      return send({ error: String(e.message || e) }, 502);
    }
  },
};
