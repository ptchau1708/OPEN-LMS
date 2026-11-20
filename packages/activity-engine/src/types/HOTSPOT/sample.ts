import type { ItemOf } from '@openedu/contracts';

/**
 * Tranh minh hoạ vẽ tay bằng SVG (400×250, tỉ lệ 1,6): bầu trời, ao, hai chú cá, mèo, chim, bướm.
 * Mã màu viết trực tiếp vì đây là hình minh hoạ (được phép theo quy ước).
 */
const SCENE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 250">
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fd8ff"/><stop offset="1" stop-color="#dff3ff"/></linearGradient>
<linearGradient id="water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6cc6f5"/><stop offset="1" stop-color="#2f8fd8"/></linearGradient>
</defs>
<rect width="400" height="250" fill="url(#sky)"/>
<circle cx="352" cy="38" r="22" fill="#ffd23f"/>
<circle cx="352" cy="38" r="30" fill="#ffd23f" opacity=".25"/>
<g fill="#ffffff"><ellipse cx="78" cy="42" rx="30" ry="13"/><ellipse cx="100" cy="34" rx="20" ry="13"/><ellipse cx="58" cy="36" rx="16" ry="10"/></g>
<g fill="#ffffff" opacity=".85"><ellipse cx="220" cy="28" rx="22" ry="9"/><ellipse cx="236" cy="22" rx="14" ry="9"/></g>
<path d="M0 132 Q100 118 200 130 T400 126 V250 H0 Z" fill="#8fd16a"/>
<path d="M0 150 Q120 140 220 152 T400 148 V250 H0 Z" fill="#7cc35a"/>
<g fill="#5ea844"><path d="M30 225 l4 -12 l4 12z"/><path d="M110 236 l4 -12 l4 12z"/><path d="M380 160 l4 -12 l4 12z"/></g>
<ellipse cx="250" cy="194" rx="120" ry="48" fill="#bfe3f7"/>
<ellipse cx="250" cy="194" rx="113" ry="43" fill="url(#water)"/>
<g stroke="#bfe9ff" stroke-width="2" fill="none" stroke-linecap="round" opacity=".8"><path d="M170 172 q8 -4 16 0"/><path d="M250 222 q8 -4 16 0"/><path d="M325 178 q8 -4 16 0"/></g>
<g><polygon points="188,185 174,175 174,195" fill="#ff7a1a"/><ellipse cx="205" cy="185" rx="19" ry="11" fill="#ff8a3d"/><path d="M200 175 q6 10 0 20" stroke="#ff6a00" stroke-width="2" fill="none"/><circle cx="214" cy="182" r="2.6" fill="#22304a"/></g>
<g><polygon points="316,203 330,193 330,213" fill="#f2b705"/><ellipse cx="300" cy="203" rx="17" ry="10" fill="#ffd23f"/><path d="M305 194 q-6 9 0 18" stroke="#f2b705" stroke-width="2" fill="none"/><circle cx="292" cy="200" r="2.4" fill="#22304a"/></g>
<g><path d="M90 196 q22 -6 18 -30" stroke="#e8964a" stroke-width="7" fill="none" stroke-linecap="round"/><ellipse cx="70" cy="188" rx="22" ry="20" fill="#f2a65a"/><circle cx="70" cy="160" r="15" fill="#f2a65a"/><polygon points="57,153 59,138 68,149" fill="#f2a65a"/><polygon points="83,153 81,138 72,149" fill="#f2a65a"/><polygon points="60,150 61,142 66,148" fill="#ffc9c9"/><polygon points="80,150 79,142 74,148" fill="#ffc9c9"/><circle cx="64" cy="159" r="2.2" fill="#22304a"/><circle cx="76" cy="159" r="2.2" fill="#22304a"/><path d="M67 165 q3 3 6 0" stroke="#22304a" stroke-width="1.6" fill="none"/><ellipse cx="62" cy="206" rx="7" ry="4" fill="#f7c08a"/><ellipse cx="78" cy="206" rx="7" ry="4" fill="#f7c08a"/></g>
<g><ellipse cx="300" cy="74" rx="15" ry="9" fill="#e8485f"/><circle cx="313" cy="67" r="7" fill="#e8485f"/><polygon points="319,66 328,68 319,70" fill="#ffb703"/><circle cx="315" cy="65" r="1.6" fill="#22304a"/><path d="M292 72 q8 -18 18 -2" fill="#ff8aa0"/><polygon points="286,72 276,66 278,78" fill="#c9374d"/></g>
<g><circle cx="110" cy="150" r="5" fill="#ffd23f"/><g fill="#ff5d8f"><circle cx="110" cy="143" r="4"/><circle cx="117" cy="150" r="4"/><circle cx="110" cy="157" r="4"/><circle cx="103" cy="150" r="4"/></g><circle cx="110" cy="150" r="3" fill="#ffd23f"/></g>
<g><ellipse cx="118" cy="110" rx="8" ry="10" fill="#b18cf6"/><ellipse cx="132" cy="110" rx="8" ry="10" fill="#b18cf6"/><ellipse cx="119" cy="122" rx="5" ry="6" fill="#d4c0fb"/><ellipse cx="131" cy="122" rx="5" ry="6" fill="#d4c0fb"/><rect x="123.5" y="104" width="3" height="22" rx="1.5" fill="#3b3b45"/><path d="M124 104 q-4 -6 -7 -6 M126 104 q4 -6 7 -6" stroke="#3b3b45" stroke-width="1.2" fill="none"/></g>
</svg>`;

export const HOTSPOT_SAMPLE_IMAGE = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(SCENE)}`;

/** Item mẫu hợp lệ (có key): Tự nhiên và Xã hội lớp 1 — con vật sống dưới nước. */
export function sample(): ItemOf<'HOTSPOT'> {
  return {
    id: 'sample-hotspot-tnxh1',
    type: 'HOTSPOT',
    grade: 1,
    subject: 'tnxh',
    difficulty: 'nhan-biet',
    prompt: { text: 'Em hãy chạm vào tất cả các con vật sống dưới nước.', lang: 'vi-VN' },
    payload: {
      image: HOTSPOT_SAMPLE_IMAGE,
      aspect: 1.6,
      multiple: true,
      regions: [
        { id: 'ca-cam', shape: 'circle', x: 50.5, y: 74, r: 7, label: 'Cá cam' },
        { id: 'ca-vang', shape: 'circle', x: 76, y: 81, r: 7, label: 'Cá vàng' },
        { id: 'meo', shape: 'rect', x: 11, y: 54, w: 17, h: 32, label: 'Con mèo' },
        { id: 'chim', shape: 'circle', x: 75.5, y: 28.5, r: 7, label: 'Con chim' },
        { id: 'buom', shape: 'circle', x: 31.25, y: 45, r: 5.5, label: 'Con bướm' },
      ],
    },
    key: { correct: ['ca-cam', 'ca-vang'] },
    hint: 'Con vật nào đang bơi trong ao?',
    explanation: 'Cá sống dưới nước. Mèo sống trên cạn, chim và bướm bay trên trời.',
    stars: 1,
  };
}
