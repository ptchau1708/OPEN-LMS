import { useState } from 'react';
import type { ReactNode } from 'react';
import { MASCOTS, SUBJECT_LIST } from '@openedu/contracts';
import type { MascotMood } from '@openedu/contracts';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Icon, ICON_NAMES } from '../components/Icon';
import { Media } from '../components/Media';
import { SpeakButton } from '../components/SpeakButton';
import { StarCount, StarBurst } from '../components/Stars';
import { Confetti } from '../components/Confetti';
import { ProgressDots, ProgressBar } from '../components/Progress';
import { TabBar } from '../components/TabBar';
import { SubjectBadge } from '../components/SubjectBadge';
import { KidShell } from '../components/KidShell';
import { Sheet } from '../components/Sheet';
import { TimerRing } from '../components/TimerRing';
import { QrCode } from '../components/QrCode';
import { Mascot, MascotBubble } from '../mascots/Mascot';

const MOODS: MascotMood[] = ['happy', 'cheer', 'think', 'sad', 'wave'];
const MOOD_VI: Record<MascotMood, string> = { happy: 'vui', cheer: 'reo hò', think: 'suy nghĩ', sad: 'buồn', wave: 'vẫy tay' };

const grid = (min: number, gap = 12) => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`, gap } as const);
const row = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', margin: -6 } as const;
const cell = { margin: 6 } as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 className="k-title" style={{ marginBottom: 12 }}>{title}</h2>
      {children}
    </section>
  );
}

/** Trang kiểm tra giao diện (QA): mọi linh vật × tâm trạng, mọi component. */
export function UiGallery({ animate = false }: { animate?: boolean }) {
  const [stars, setStars] = useState(12);
  const [burst, setBurst] = useState(false);
  const [confetti, setConfetti] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [slide, setSlide] = useState(2);
  const [tab, setTab] = useState('home');
  const [endsAt, setEndsAt] = useState(() => new Date(Date.now() + 20000).toISOString());
  const [big, setBig] = useState(false);

  return (
    <KidShell bigText={big}>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '24px 16px' }}>
        <header style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
          <Mascot id="nghe" mood="wave" size={72} animate={animate} />
          <div style={{ marginLeft: 12, flex: 1 }}>
            <h1 className="k-hero">Sân chơi giao diện</h1>
            <p className="k-muted" style={{ margin: 0 }}>Bảng kiểm tra bộ giao diện trẻ em OPEN-EDU</p>
          </div>
          <Button variant="secondary" onClick={() => setBig((b) => !b)}>{big ? 'Chữ thường' : 'Chữ to'}</Button>
        </header>

        <Section title="Linh vật">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'separate', borderSpacing: 6 }}>
              <thead>
                <tr><th />{MOODS.map((m) => <th key={m} className="k-small k-muted" style={{ fontWeight: 700 }}>{MOOD_VI[m]}</th>)}</tr>
              </thead>
              <tbody>
                {MASCOTS.map((m) => (
                  <tr key={m.id}>
                    <th style={{ textAlign: 'left', paddingRight: 8, minWidth: 110 }}>
                      <div style={{ fontFamily: 'var(--f-kid-display)', fontSize: 18 }}>{m.name}</div>
                      <div className="k-small k-muted" style={{ fontWeight: 600 }}>{m.country}</div>
                    </th>
                    {MOODS.map((mood) => (
                      <td key={mood} style={{ background: 'var(--k-card)', borderRadius: 18, padding: 4, textAlign: 'center' }}>
                        <Mascot id={m.id} mood={mood} size={120} animate={animate} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3 style={{ margin: '18px 0 8px' }}>Cỡ nhỏ (40px) và lớn (220px)</h3>
          <div style={row}>
            {MASCOTS.map((m) => <span key={m.id} style={cell}><Mascot id={m.id} size={40} /></span>)}
          </div>
          <div style={{ ...row, marginTop: 8 }}>
            <span style={cell}><Mascot id="shiba" mood="cheer" size={220} animate={animate} /></span>
            <span style={cell}><Mascot id="cong" mood="happy" size={220} animate={animate} /></span>
            <span style={cell}><Mascot id="voi" mood="wave" size={220} animate={animate} /></span>
          </div>
        </Section>

        <Section title="Bong bóng lời nói">
          <div style={grid(320, 16)}>
            <MascotBubble mascot="shiba" mood="wave" size={88}>Chào em! Hôm nay mình cùng học phép cộng nhé.</MascotBubble>
            <MascotBubble mascot="koala" mood="think" side="right" size={88}>Em thử đếm lại số quả táo xem nào?</MascotBubble>
          </div>
        </Section>

        <Section title="Nút bấm">
          <div style={row}>
            <span style={cell}><Button>Bắt đầu học</Button></span>
            <span style={cell}><Button variant="secondary">Để sau</Button></span>
            <span style={cell}><Button variant="ghost">Bỏ qua</Button></span>
            <span style={cell}><Button variant="subject" color="var(--k-math)" icon={<Icon name="play" />}>Toán</Button></span>
            <span style={cell}><Button variant="subject" color="var(--k-eng)">Tiếng Anh</Button></span>
            <span style={cell}><Button variant="danger" icon={<Icon name="trash" />}>Xóa</Button></span>
            <span style={cell}><Button disabled>Chưa mở</Button></span>
            <span style={cell}><Button icon={<Icon name="next" />} aria-label="Tiếp" /></span>
          </div>
          <div style={{ ...row, marginTop: 8 }}>
            <span style={cell}><Button size="lg" icon={<Icon name="check" size={26} />}>Kiểm tra</Button></span>
            <span style={cell}><Button size="xl" icon={<Icon name="play" size={32} />}>Vào học</Button></span>
            <span style={cell}><Button size="lg" variant="secondary" icon={<Icon name="retry" size={26} />}>Làm lại</Button></span>
          </div>
          <div style={{ maxWidth: 360, marginTop: 12 }}><Button block size="lg">Nút rộng hết cỡ</Button></div>
        </Section>

        <Section title="Thẻ">
          <div style={grid(220, 16)}>
            <Card><strong>Thẻ thường</strong><p className="k-muted" style={{ margin: '4px 0 0' }}>Nội dung bên trong thẻ.</p></Card>
            {SUBJECT_LIST.slice(0, 3).map((s) => (
              <Card key={s.id} color={`var(${s.colorVar})`} interactive onClick={() => undefined}>
                <SubjectBadge subject={s.id} />
                <div className="k-title" style={{ fontSize: 20, marginTop: 8 }}>Bài học {s.name}</div>
                <div style={{ marginTop: 10 }}><ProgressBar value={0.4} color={`var(${s.colorVar})`} label="Tiến độ" /></div>
              </Card>
            ))}
          </div>
        </Section>

        <Section title="Biểu tượng">
          <div style={grid(96, 8)}>
            {ICON_NAMES.map((n) => (
              <div key={n} style={{ background: 'var(--k-card)', borderRadius: 14, padding: '10px 4px', textAlign: 'center' }}>
                <Icon name={n} size={30} />
                <div className="k-small k-muted" style={{ fontSize: 12 }}>{n}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Hình ảnh, loa, sao">
          <div style={row}>
            <span style={cell}><Media src="emoji:🐟" alt="Con cá" /></span>
            <span style={cell}><Media src="emoji:🍎" alt="Quả táo" size={48} /></span>
            <span style={cell}><Media src="/khong-co-anh.png" alt="Ảnh lỗi" size={72} /></span>
            <span style={cell}><SpeakButton text="Xin chào các em" size="sm" /></span>
            <span style={cell}><SpeakButton text="Xin chào các em" /></span>
            <span style={cell}><SpeakButton text="Xin chào các em" size="lg" /></span>
            <span style={cell}><SpeakButton text="Hello" audioUrl="data:audio/wav;base64," showLabel label="Nghe đề" /></span>
            <span style={cell}><StarCount value={stars} size="sm" /></span>
            <span style={cell}><StarCount value={stars} /></span>
            <span style={cell}><StarCount value={stars} size="lg" /></span>
            <span style={{ ...cell, position: 'relative' }}>
              <Button variant="subject" color="var(--k-star-dark)" onClick={() => { setStars((s) => s + 3); setBurst(true); }}>+3 sao</Button>
              <StarBurst show={burst} count={6} onDone={() => setBurst(false)} />
            </span>
            <span style={cell}><Button variant="secondary" onClick={() => { setConfetti(false); setTimeout(() => setConfetti(true), 0); }}>Bắn giấy màu</Button></span>
          </div>
          <Confetti show={confetti} />
        </Section>

        <Section title="Tiến độ, đồng hồ, QR">
          <div style={row}>
            <span style={cell}><ProgressDots total={8} current={slide} done={[true, true, false, true]} onSelect={setSlide} /></span>
            <span style={cell}><ProgressDots total={5} current={1} done={[true]} color="var(--k-art)" /></span>
          </div>
          <div style={{ maxWidth: 420, margin: '12px 0' }}><ProgressBar value={0.65} label="Đã học 65%" /></div>
          <div style={row}>
            <span style={cell}><TimerRing endsAt={endsAt} totalSeconds={20} size={88} /></span>
            <span style={cell}><TimerRing endsAt={new Date(Date.now() + 4000).toISOString()} totalSeconds={20} size={64} /></span>
            <span style={cell}><Button variant="secondary" onClick={() => setEndsAt(new Date(Date.now() + 20000).toISOString())}>Đếm lại</Button></span>
            <span style={cell}><QrCode value="https://open-edu.vn/vao-lop?ma=AB12CD" size={140} /></span>
            <span style={cell}><QrCode value="Lớp 2A1 — Cô Hạnh" size={96} /></span>
          </div>
        </Section>

        <Section title="Nhãn môn">
          <div style={row}>
            {SUBJECT_LIST.map((s) => <span key={s.id} style={cell}><SubjectBadge subject={s.id} /></span>)}
            <span style={cell}><SubjectBadge subject="toan" size="sm" /></span>
          </div>
        </Section>

        <Section title="Thanh tab và bảng trượt">
          <div style={{ maxWidth: 520 }}>
            <TabBar
              fixed={false}
              active={tab}
              onSelect={setTab}
              items={[
                { id: 'home', label: 'Hôm nay', icon: <Icon name="home" /> },
                { id: 'learn', label: 'Bài học', icon: <Icon name="book" /> },
                { id: 'play', label: 'Đấu trường', icon: <Icon name="trophy" />, color: 'var(--k-viet)' },
                { id: 'passport', label: 'Hộ chiếu', icon: <Icon name="passport" />, color: 'var(--k-eng)' },
              ]}
            />
          </div>
          <div style={{ marginTop: 16 }}><Button onClick={() => setSheet(true)}>Mở bảng</Button></div>
          <Sheet open={sheet} onClose={() => setSheet(false)} title="Em muốn làm gì?">
            <MascotBubble mascot="panda" mood="happy" size={72}>Chọn một việc nhé!</MascotBubble>
            <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
              <Button block size="lg" onClick={() => setSheet(false)}>Học tiếp</Button>
              <Button block size="lg" variant="secondary" onClick={() => setSheet(false)}>Về trang chính</Button>
            </div>
          </Sheet>
        </Section>
      </div>
    </KidShell>
  );
}
