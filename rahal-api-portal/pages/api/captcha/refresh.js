import { generateCaptcha, getStore } from '../../../lib/mockStore';

function buildSvgCaptcha(code) {
  const colors = ['#FF6B6B','#C8A96E','#4A9EFF','#2ECC7A','#C89FFF'];
  let letters = '';
  for (let i = 0; i < code.length; i++) {
    const x = 14 + i * 22;
    const y = 28 + Math.floor(Math.random() * 10) - 5;
    const rot = Math.floor(Math.random() * 30) - 15;
    const color = colors[i % colors.length];
    const size = 18 + Math.floor(Math.random() * 6);
    letters += `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" font-weight="bold" font-family="monospace" transform="rotate(${rot},${x},${y})">${code[i]}</text>`;
  }
  let noise = '';
  for (let i = 0; i < 6; i++) {
    noise += `<line x1="${Math.random()*160}" y1="${Math.random()*40}" x2="${Math.random()*160}" y2="${Math.random()*40}" stroke="#ffffff" stroke-width="1" opacity="0.3"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="44" style="background:#1a1a2e;border-radius:6px">${noise}${letters}</svg>`;
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}

export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ code:'METHOD_NOT_ALLOWED', message:'Use GET' });
  const { previousToken } = req.query;
  if (previousToken) {
    const store = getStore();
    delete store.captchas[previousToken];
  }
  const { captchaToken, code } = generateCaptcha();
  return res.status(200).json({
    captchaToken,
    imageBase64: buildSvgCaptcha(code),
    expiresInSeconds: 300,
    _dev_code: process.env.NODE_ENV !== 'production' ? code : undefined
  });
}
