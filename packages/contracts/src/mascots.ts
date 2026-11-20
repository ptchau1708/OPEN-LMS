/**
 * Linh vật OPEN-EDU: nhân vật vẽ mới hoàn toàn (không dựa trên nhân vật có bản quyền),
 * mỗi bạn đại diện một nước. Học sinh mở khóa dần trong "Hộ chiếu khám phá" bằng sao tích lũy —
 * mở khóa theo mốc cố định, không quay ngẫu nhiên, không dùng tiền thật.
 */
export type MascotId = 'nghe' | 'shiba' | 'panda' | 'capybara' | 'koala' | 'voi' | 'kiwi' | 'ho' | 'ga' | 'cong';

export interface MascotMeta {
  id: MascotId;
  /** Tên gọi thân mật. */
  name: string;
  animal: string;
  country: string;
  /** Lời chào bằng tiếng của nước đó (phiên âm Latin) và nghĩa. */
  greeting: string;
  greetingMeaning: string;
  /** Một điều thú vị, viết cho học sinh tiểu học. */
  funFact: string;
  /** Số sao tích lũy để mở khóa. */
  unlockStars: number;
  /** Màu chủ đạo (hex). */
  color: string;
}

export const MASCOTS: MascotMeta[] = [
  { id: 'nghe', name: 'Nghé Tí', animal: 'nghé (trâu con)', country: 'Việt Nam', greeting: 'Xin chào!', greetingMeaning: 'Xin chào', funFact: 'Con trâu giúp bà con nông dân cày ruộng trồng lúa từ rất lâu rồi.', unlockStars: 0, color: '#8a6f5a' },
  { id: 'shiba', name: 'Shiba Mochi', animal: 'chó Shiba', country: 'Nhật Bản', greeting: 'Konnichiwa!', greetingMeaning: 'Xin chào', funFact: 'Ở Nhật Bản, học sinh thường tự dọn dẹp lớp học sau giờ học.', unlockStars: 20, color: '#e8964a' },
  { id: 'panda', name: 'Gấu trúc Mập', animal: 'gấu trúc', country: 'Trung Quốc', greeting: 'Nǐ hǎo!', greetingMeaning: 'Xin chào', funFact: 'Gấu trúc dành khoảng nửa ngày chỉ để ăn tre.', unlockStars: 50, color: '#3b3b45' },
  { id: 'capybara', name: 'Capi', animal: 'chuột lang nước', country: 'Brazil', greeting: 'Olá!', greetingMeaning: 'Xin chào', funFact: 'Chuột lang nước bơi rất giỏi và hay ngâm mình dưới nước cho mát.', unlockStars: 90, color: '#b0784a' },
  { id: 'koala', name: 'Koala Lá', animal: 'gấu túi koala', country: 'Úc', greeting: "G'day!", greetingMeaning: 'Chào bạn', funFact: 'Koala ngủ tới gần 20 tiếng mỗi ngày.', unlockStars: 140, color: '#8f98a8' },
  { id: 'voi', name: 'Voi Chang', animal: 'voi', country: 'Thái Lan', greeting: 'Sawasdee!', greetingMeaning: 'Xin chào', funFact: '“Chang” trong tiếng Thái nghĩa là con voi.', unlockStars: 200, color: '#8fa3c2' },
  { id: 'kiwi', name: 'Kiwi Lăn', animal: 'chim kiwi', country: 'New Zealand', greeting: 'Kia ora!', greetingMeaning: 'Chào bạn', funFact: 'Chim kiwi không bay được nhưng có cái mũi rất thính.', unlockStars: 270, color: '#9b7b4f' },
  { id: 'ho', name: 'Hổ Bum', animal: 'hổ', country: 'Hàn Quốc', greeting: 'Annyeong!', greetingMeaning: 'Xin chào', funFact: 'Trong truyện cổ Hàn Quốc, con hổ thường xuất hiện cùng thỏ và các bà cụ.', unlockStars: 350, color: '#f08a24' },
  { id: 'ga', name: 'Gà trống Coco', animal: 'gà trống', country: 'Pháp', greeting: 'Bonjour!', greetingMeaning: 'Chào buổi sáng', funFact: 'Bánh mì baguette của Pháp thường dài hơn cả cánh tay của em.', unlockStars: 440, color: '#e2453c' },
  { id: 'cong', name: 'Công Múa', animal: 'chim công', country: 'Ấn Độ', greeting: 'Namaste!', greetingMeaning: 'Xin chào', funFact: 'Chim công đực xòe đuôi có hàng trăm “con mắt” màu xanh.', unlockStars: 540, color: '#1f8a8a' },
];

export const MASCOT_BY_ID: Record<MascotId, MascotMeta> = Object.fromEntries(MASCOTS.map((m) => [m.id, m])) as Record<MascotId, MascotMeta>;

export type MascotMood = 'happy' | 'cheer' | 'think' | 'sad' | 'wave';
