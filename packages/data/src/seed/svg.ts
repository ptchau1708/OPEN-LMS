/**
 * Minh họa SVG nhúng (data URI) cho nội dung mẫu — không cần tải ảnh, chạy được khi không có mạng.
 * Toạ độ vùng HOTSPOT tính theo % của viewBox, ghi chú ngay cạnh hình vẽ.
 */
export function svgUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/\s{2,}/g, ' ').trim())}`;
}

const FONT = "font-family='Nunito, Arial, sans-serif' font-weight='700'";

/** Một que tính dọc. */
function stick(x: number, y: number, h = 120): string {
  return `<rect x='${x}' y='${y}' width='7' height='${h}' rx='3' fill='#f6c76b' stroke='#c98f2e' stroke-width='1.5'/>`;
}

/** 26 = 2 bó chục + 6 que lẻ (slide "Bó chục và que lẻ"). viewBox 420×220. */
export const STICKS_26_SVG = svgUri(`
<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 420 220'>
  <rect width='420' height='220' rx='18' fill='#fff8e8'/>
  ${[0, 1]
    .map((b) => {
      const x0 = 24 + b * 100;
      const sticks = Array.from({ length: 10 }, (_, i) => stick(x0 + i * 7.5, 30)).join('');
      return `<g>${sticks}<rect x='${x0 - 4}' y='82' width='84' height='14' rx='5' fill='#e2453c'/></g>`;
    })
    .join('')}
  ${Array.from({ length: 6 }, (_, i) => stick(250 + i * 24, 30)).join('')}
  <text x='70' y='185' text-anchor='middle' ${FONT} font-size='22' fill='#2f7bf6'>1 chục</text>
  <text x='170' y='185' text-anchor='middle' ${FONT} font-size='22' fill='#2f7bf6'>1 chục</text>
  <text x='320' y='185' text-anchor='middle' ${FONT} font-size='22' fill='#ff8a3d'>6 que lẻ</text>
  <text x='210' y='212' text-anchor='middle' ${FONT} font-size='16' fill='#555'>26 = 2 chục và 6 đơn vị</text>
</svg>`);

/**
 * Ao và cánh đồng (HOTSPOT TNXH lớp 1). viewBox 400×250 → aspect 1.6.
 * Cá vàng (60,180) · tôm (115,145) · cá chép (160,192) ở dưới ao; bò (300,150) và gà (250,215) trên cạn.
 */
export const POND_FIELD_SVG = svgUri(`
<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 250'>
  <rect width='400' height='250' fill='#d5f1ff'/>
  <circle cx='365' cy='32' r='20' fill='#ffd23f'/>
  <g fill='#ffffff'><ellipse cx='70' cy='35' rx='30' ry='12'/><ellipse cx='95' cy='30' rx='22' ry='12'/><ellipse cx='220' cy='45' rx='26' ry='10'/></g>
  <rect y='105' width='400' height='145' fill='#9bd770'/>
  <path d='M0 105 Q100 92 200 105 T400 105 V112 H0Z' fill='#86c95a'/>
  <ellipse cx='110' cy='175' rx='100' ry='60' fill='#4fb3e8' stroke='#2e8fc4' stroke-width='4'/>
  <path d='M40 160 q10 -6 20 0 M150 225 q10 -6 20 0 M170 140 q10 -6 20 0' stroke='#bfe7ff' stroke-width='3' fill='none'/>
  <g>
    <ellipse cx='60' cy='180' rx='20' ry='11' fill='#ff8a3d'/>
    <polygon points='40,180 26,170 26,190' fill='#ff8a3d'/>
    <circle cx='70' cy='177' r='2.5' fill='#222'/>
  </g>
  <g>
    <path d='M100 140 q15 -14 30 0 q4 10 -6 16' stroke='#ff7b9c' stroke-width='9' fill='none' stroke-linecap='round'/>
    <path d='M124 156 l-8 8 M124 156 l4 10' stroke='#ff7b9c' stroke-width='4' stroke-linecap='round'/>
    <path d='M102 138 l-10 -12 M106 136 l-4 -15' stroke='#c94f6d' stroke-width='2'/>
    <circle cx='104' cy='141' r='2' fill='#222'/>
  </g>
  <g>
    <ellipse cx='160' cy='192' rx='22' ry='12' fill='#ffd23f'/>
    <polygon points='182,192 196,181 196,203' fill='#ffd23f'/>
    <circle cx='149' cy='189' r='2.5' fill='#222'/>
  </g>
  <g>
    <rect x='265' y='132' width='70' height='36' rx='14' fill='#ffffff' stroke='#555' stroke-width='2'/>
    <circle cx='285' cy='145' r='7' fill='#333'/><circle cx='318' cy='155' r='6' fill='#333'/>
    <rect x='272' y='165' width='8' height='18' fill='#555'/><rect x='320' y='165' width='8' height='18' fill='#555'/>
    <circle cx='342' cy='134' r='15' fill='#ffffff' stroke='#555' stroke-width='2'/>
    <ellipse cx='348' cy='140' rx='7' ry='5' fill='#ffb3c1'/>
    <path d='M333 121 l-6 -8 M350 120 l5 -8' stroke='#8a6f5a' stroke-width='3'/>
    <circle cx='338' cy='130' r='2' fill='#222'/>
  </g>
  <g>
    <circle cx='250' cy='218' r='15' fill='#fff3d6' stroke='#c98f2e' stroke-width='2'/>
    <circle cx='262' cy='203' r='9' fill='#fff3d6' stroke='#c98f2e' stroke-width='2'/>
    <path d='M258 193 q4 -6 8 0 q4 -6 6 2' fill='#e2453c'/>
    <polygon points='270,203 278,206 270,209' fill='#f08a24'/>
    <circle cx='264' cy='201' r='1.8' fill='#222'/>
    <path d='M246 233 v8 M254 233 v8' stroke='#f08a24' stroke-width='3'/>
  </g>
</svg>`);

/**
 * Các hình (HOTSPOT Toán lớp 1). viewBox 400×200 → aspect 2.
 * Tròn đỏ (60,100,r40) · vuông xanh (130–200, 65–135) · tam giác (220–300, 60–140) · tròn vàng (350,100,r30).
 */
export const SHAPES_SVG = svgUri(`
<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 200'>
  <rect width='400' height='200' rx='16' fill='#fdfbf5'/>
  <circle cx='60' cy='100' r='40' fill='#ff6b6b'/>
  <rect x='130' y='65' width='70' height='70' rx='4' fill='#2f7bf6'/>
  <polygon points='260,60 220,140 300,140' fill='#20a974'/>
  <circle cx='350' cy='100' r='30' fill='#ffd23f'/>
</svg>`);

/**
 * Khuôn mặt (HOTSPOT giác quan / "Touch the nose"). viewBox 300×300 → aspect 1.
 * Mắt (110,140) (190,140) · tai (40,165) (260,165) · mũi (150,180) · miệng (115–185, 210–240).
 */
export const FACE_SVG = svgUri(`
<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 300'>
  <rect width='300' height='300' rx='20' fill='#eef7ff'/>
  <ellipse cx='40' cy='165' rx='18' ry='28' fill='#f7c59f'/>
  <ellipse cx='260' cy='165' rx='18' ry='28' fill='#f7c59f'/>
  <circle cx='150' cy='160' r='110' fill='#ffd9b3'/>
  <path d='M45 130 Q60 40 150 45 Q240 40 255 130 Q220 80 150 85 Q80 80 45 130Z' fill='#3b2a20'/>
  <circle cx='110' cy='140' r='14' fill='#ffffff' stroke='#3b2a20' stroke-width='2'/>
  <circle cx='190' cy='140' r='14' fill='#ffffff' stroke='#3b2a20' stroke-width='2'/>
  <circle cx='112' cy='142' r='7' fill='#3b2a20'/><circle cx='192' cy='142' r='7' fill='#3b2a20'/>
  <path d='M150 165 q-10 20 0 24 q10 -4 0 -24' fill='#f0a878'/>
  <path d='M118 218 Q150 245 182 218' stroke='#c2410c' stroke-width='6' fill='none' stroke-linecap='round'/>
  <circle cx='85' cy='190' r='12' fill='#ffb3c1' opacity='0.7'/><circle cx='215' cy='190' r='12' fill='#ffb3c1' opacity='0.7'/>
</svg>`);

/** Nền vẽ: mặt nước nhạt (DRAW "con vật sống dưới nước"). */
export const WATER_BG_SVG = svgUri(`
<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'>
  <rect width='400' height='300' fill='#ffffff'/>
  <rect y='120' width='400' height='180' fill='#e3f4ff'/>
  <path d='M0 120 q25 -10 50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0' stroke='#9bd3f5' stroke-width='3' fill='none'/>
  <path d='M30 270 q8 -30 0 -60 M60 280 q10 -25 2 -50 M360 275 q-8 -30 0 -55' stroke='#9bd770' stroke-width='4' fill='none'/>
</svg>`);
