// Contact form endpoint (Vercel serverless function).
// Checks the reCAPTCHA v3 token with Google, then sends the message to contact@allotar.com through Resend.
// Needs three environment variables in the Vercel project:
//   RECAPTCHA_SECRET   secret key of the reCAPTCHA v3 site (google.com/recaptcha/admin)
//   RESEND_API_KEY     API key from resend.com (sending domain allotar.com verified there)
//   CONTACT_FROM       verified sender, e.g. "Allotar website <website@allotar.com>"
const TO = 'contact@allotar.com';
const MIN_SCORE = 0.5;

const esc = s => String(s || '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const clip = (s, n) => String(s || '').trim().slice(0, n);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ok: false, error: 'method'});
  const {RECAPTCHA_SECRET, RESEND_API_KEY, CONTACT_FROM} = process.env;
  if (!RECAPTCHA_SECRET || !RESEND_API_KEY || !CONTACT_FROM) return res.status(503).json({ok: false, error: 'not-configured'});

  const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  if (b['bot-field']) return res.status(200).json({ok: true});   // honeypot: pretend success

  const first = clip(b.first, 80), last = clip(b.last, 80), email = clip(b.email, 160), org = clip(b.organization, 160),
        interest = clip(b.interest, 80), message = clip(b.message, 5000);
  if (!first || !last || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !interest) return res.status(400).json({ok: false, error: 'fields'});

  // reCAPTCHA v3
  const v = await fetch('https://www.google.com/recaptcha/api/siteverify', {
    method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({secret: RECAPTCHA_SECRET, response: String(b.token || ''), remoteip: String(req.headers['x-forwarded-for'] || '').split(',')[0]})
  }).then(r => r.json()).catch(() => ({success: false}));
  if (!v.success || v.action !== 'contact' || (v.score ?? 0) < MIN_SCORE) return res.status(400).json({ok: false, error: 'captcha'});

  const html = `<h2>New message from the Allotar website</h2>
    <p><b>Name:</b> ${esc(first)} ${esc(last)}<br><b>Email:</b> ${esc(email)}<br><b>Organization:</b> ${esc(org) || '—'}<br><b>Interest:</b> ${esc(interest)}</p>
    <p style="white-space:pre-wrap">${esc(message) || '(no message)'}</p>`;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: {Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({from: CONTACT_FROM, to: [TO], reply_to: email, subject: `Website enquiry: ${interest} (${first} ${last})`, html})
  });
  if (!r.ok) return res.status(502).json({ok: false, error: 'send'});
  return res.status(200).json({ok: true});
};
