import type { Profile } from '@openedu/contracts';
import { paperCardCode, paperCardsFor } from '@openedu/data';
import { QrCode } from '@openedu/ui';
import { Btn, Empty, Loading, PageHead } from '../../components/common';
import { ClassPicker, useClassPick, useRoster } from '../../lib/assess';

/** In thẻ giấy: mỗi em một thẻ (2 thẻ / trang A4). A ở trên, B phải, C dưới, D trái — xoay chữ mình chọn lên trên. */
export default function PaperCards({ user }: { user: Profile }) {
  const { list, cls, classId, setClassId, classes } = useClassPick(user);
  const { roster, isLoading } = useRoster(cls);
  const cards = paperCardsFor(roster);
  if (classes.isLoading) return <Loading />;
  return (
    <div className="tc-page tc-papercards">
      <div className="tc-noprint">
        <PageHead title="In thẻ giấy" sub="Mỗi học sinh một thẻ theo số thứ tự trong danh sách lớp. In một lần, dùng cho mọi trò chơi chế độ giấy." actions={<>
          <ClassPicker list={list} value={classId} onChange={setClassId} />
          <Btn kind="primary" icon="print" disabled={!cards.length} onClick={() => window.print()}>In {cards.length} thẻ</Btn>
        </>} />
        <div className="tc-alert tc-alert--info"><span>
          In khổ A4 dọc, <b>không co giãn</b> (tỉ lệ 100%), giấy trắng dày nếu có. Dạy HS: <b>giơ thẻ thẳng, chữ mình chọn ở phía trên</b>, không che mã.
          Thêm học sinh mới thì em mới nhận số tiếp theo, thẻ cũ vẫn dùng được.
        </span></div>
      </div>
      {isLoading ? <Loading /> : !cards.length ? <Empty title="Lớp chưa có học sinh" /> : (
        <div className="tc-cards" data-testid="paper-cards">
          {cards.map((c) => (
            <section key={c.card} className="tc-pcard" aria-label={`Thẻ số ${c.card}: ${c.name}`}>
              <span className="tc-pcard__l is-a">A</span>
              <span className="tc-pcard__l is-b">B</span>
              <span className="tc-pcard__l is-c">C</span>
              <span className="tc-pcard__l is-d">D</span>
              <div className="tc-pcard__qr"><QrCode value={paperCardCode(c.card)} size={300} title={`Mã thẻ ${c.card}`} /></div>
              <span className="tc-pcard__who"><b>{c.card}</b> {c.name}</span>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
