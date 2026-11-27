/** Cài đặt cá nhân (GV): khối ưu tiên (mặc định lớp 5), lối tắt tới Thông báo và Đổi mật khẩu. */
import { Link } from 'react-router';
import { Icon } from '@openedu/ui';
import { PageHead, Seg } from '../components/common';
import { GRADES, useFocusGrade } from '../lib/focusGrade';

export default function PersonalSettings() {
  const f = useFocusGrade();
  return (
    <div className="tc-page tc-stack" style={{ maxWidth: 820 }}>
      <PageHead title="Cài đặt cá nhân" sub="Áp dụng cho tài khoản của thầy/cô trên mọi máy." />
      <section className="tc-card tc-stack" data-testid="focus-grade">
        <h2 className="tc-h2">Khối ưu tiên</h2>
        <p className="tc-muted">Khối thầy/cô dạy nhiều nhất. Khối này được chọn sẵn và hiện trước ở khắp ứng dụng:</p>
        <ul className="tc-small" style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
          <li>Ngân hàng câu hỏi và Bài giảng lọc sẵn theo khối này (chọn “Mọi lớp” để xem hết, khối này vẫn đứng đầu).</li>
          <li>Tạo bài giảng, câu hỏi, thêm nhanh nhiều câu, tiêu chí chấm, ma trận đề, danh mục kĩ năng: chọn sẵn khối này.</li>
          <li>Lớp thuộc khối này đứng đầu danh sách lớp và được mở sẵn ở Tổng quan, Giao bài, Trực tiếp, Phụ huynh…</li>
          <li>Ở trang đã chọn một lớp, khối của lớp đó được dùng.</li>
        </ul>
        <div className="tc-row tc-wrap">
          <Seg label="Khối ưu tiên" value={f.grade} onChange={(g) => f.set(g)} options={GRADES.map((g) => ({ value: g, label: `Lớp ${g}` }))} />
          {f.saving ? <span className="tc-muted tc-small">Đang lưu…</span> : <span className="tc-chip tc-chip--ok" role="status">Đang ưu tiên lớp {f.grade}</span>}
        </div>
      </section>
      <section className="tc-card tc-row tc-wrap">
        <Link className="tc-btn" to="/thong-bao"><Icon name="bell" size={16} /><span>Thông báo trên điện thoại</span></Link>
        <Link className="tc-btn" to="/doi-mat-khau"><Icon name="lock" size={16} /><span>Đổi mật khẩu</span></Link>
      </section>
    </div>
  );
}
