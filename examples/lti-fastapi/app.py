"""
App mẫu (Tool) LTI 1.3 + Deep Linking + xAPI viết bằng FastAPI cho OPEN-EDU — khung cho app luyện đọc hiểu.
Hướng dẫn: docs/KET_NOI_LTI.md.

Chạy thử:
    pip install -r requirements.txt
    python make_keys.py                           # private.key / public.key của app
    # dán lti_config.json chép từ OPEN-EDU (Quản trị → Ứng dụng kết nối → Cấu hình LTI)
    APP_SECRET=<chuỗi dài ngẫu nhiên> APP_URL=https://doc.truong.edu.vn uvicorn app:app --port 8001

Khai báo ở OPEN-EDU:
    Login URL      = {APP_URL}/lti/login
    Launch URL     = {APP_URL}/lti/launch
    Deep link URL  = {APP_URL}/lti/chon-bai     (giáo viên chọn bài để giao)
    JWKS URL       = {APP_URL}/lti/jwks

Điểm thiết kế:
  * KHÔNG dùng cookie phiên: app chạy được trong khung (iframe) của OPEN-EDU kể cả trên Safari / iPad (chặn cookie
    bên thứ ba). Trạng thái OIDC giữ ở máy chủ (CACHE) và được ràng buộc với trình duyệt qua "lưu trạng thái qua nền
    tảng" (postMessage lti.put_data / lti.get_data) khi OPEN-EDU gửi lti_storage_target; mở ở thẻ mới thì dùng cookie
    state như thường.
  * Sau khi mở, trang nhận APP_TOKEN (kí bằng APP_SECRET) và gọi API bằng header Authorization.
  * Mọi lời gọi mạng của pylti1p3 chạy ở luồng phụ (run_in_threadpool): khi đổi access token, OPEN-EDU gọi ngược
    /lti/jwks của chính app — chặn vòng lặp sự kiện thì hai bên chờ nhau mãi.
  * Dữ liệu học chi tiết gửi bằng xAPI (send_xapi) — mỗi câu trả lời kèm mã kĩ năng; điểm tổng gửi bằng AGS.
"""
from __future__ import annotations

import datetime as dt
import html
import json
import os
import secrets
import uuid

import requests
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse
from itsdangerous import BadSignature, URLSafeTimedSerializer
from pylti1p3.deep_link_resource import DeepLinkResource
from pylti1p3.grade import Grade
from pylti1p3.lineitem import LineItem
from pylti1p3.tool_config import ToolConfJsonFile
from starlette.concurrency import run_in_threadpool

from openedu_lti import CACHE, FastAPIMessageLaunch, FastAPIOIDCLogin, FastAPIRequest, ServerCacheStorage, student_of

APP_URL = os.environ.get("APP_URL", "http://localhost:8001").rstrip("/")
HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG = os.environ.get("LTI_CONFIG", os.path.join(HERE, "lti_config.json"))
SIGNER = URLSafeTimedSerializer(os.environ.get("APP_SECRET", "doi-chuoi-nay"), salt="openedu-app")
XAPI = "https://open-edu.vn/lti/claim/xapi"
SKILLS_EXT = "https://open-edu.vn/xapi/skills"

# Bài đọc mẫu (app thật lấy từ CSDL của mình).
BAI_DOC = [
    {"id": "3", "ten": "Bài 3 - Cây bàng", "diem_toi_da": 10},
    {"id": "4", "ten": "Bài 4 - Mùa thu của em", "diem_toi_da": 10},
]

app = FastAPI()


def tool_conf() -> ToolConfJsonFile:
    return ToolConfJsonFile(CONFIG)


def storage() -> ServerCacheStorage:
    return ServerCacheStorage()


def platform_origin() -> str:
    """Origin trang OPEN-EDU (auth_login_url) — để kiểm tin nhắn postMessage."""
    cfg = json.load(open(CONFIG, encoding="utf-8"))
    reg = next(iter(cfg.values()))[0]
    from urllib.parse import urlsplit
    u = urlsplit(reg["auth_login_url"])
    return f"{u.scheme}://{u.netloc}"


def page(title: str, body: str, script: str = "") -> HTMLResponse:
    return HTMLResponse(f"<!doctype html><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>"
                        f"<title>{html.escape(title)}</title><body style='font-family:system-ui,sans-serif;padding:20px'>{body}<script>{script}</script></body>")


# ----------------------------------------------------------------- 1. đăng nhập (OIDC)
STORAGE_JS = """
function ltiStore(target, platformOrigin, subject, data) {
  return new Promise(function (resolve, reject) {
    var w = target === '_parent' ? window.parent : (window.parent.frames[target] || null);
    if (!w || w === window) return reject(new Error('no-target'));
    var id = Math.random().toString(36).slice(2);
    var done = false;
    function on(ev) {
      if (ev.origin !== platformOrigin || !ev.data || ev.data.message_id !== id) return;
      window.removeEventListener('message', on); done = true;
      if (ev.data.error) reject(new Error(ev.data.error.code)); else resolve(ev.data);
    }
    window.addEventListener('message', on);
    w.postMessage(Object.assign({ subject: subject, message_id: id }, data), platformOrigin);
    setTimeout(function () { if (!done) { window.removeEventListener('message', on); reject(new Error('timeout')); } }, 3000);
  });
}
"""


@app.api_route("/lti/login", methods=["GET", "POST"])
async def lti_login(request: Request):
    """Bước 1: OPEN-EDU mở địa chỉ này (iss, login_hint, target_link_uri, lti_storage_target?). App chuyển về OPEN-EDU."""
    req = await FastAPIRequest.build(request)
    target = req.get_param("target_link_uri") or f"{APP_URL}/lti/launch"
    if not target.startswith(APP_URL):
        raise HTTPException(400, "target_link_uri lạ")
    login = FastAPIOIDCLogin(req, tool_conf(), launch_data_storage=storage())
    storage_target = req.get_param("lti_storage_target")
    if not storage_target:
        return login.redirect(target)  # mở ở thẻ mới: cookie state như thường
    # Trong khung của OPEN-EDU: ghi state vào OPEN-EDU (postMessage) rồi mới chuyển trang.
    redirect = login.get_redirect_object(target)
    url = redirect.get_redirect_url()
    from urllib.parse import parse_qs, urlsplit
    state = parse_qs(urlsplit(url).query)["state"][0]
    CACHE.set(f"storage-{state}", storage_target, 600)
    data = json.dumps({"url": url, "state": state, "target": storage_target, "origin": platform_origin()})
    script = STORAGE_JS + f"""
var d = {data};
ltiStore(d.target, d.origin, 'lti.put_data', {{ key: 'lti_state_' + d.state, value: d.state }})
  .catch(function () {{}}).then(function () {{ window.location.replace(d.url); }});
"""
    return page("Đang mở…", "<p>Đang mở bài…</p>", script)


# ----------------------------------------------------------------- 2. mở bài / chọn bài
async def _launch(request: Request):
    req = await FastAPIRequest.build(request)
    state = req.get_param("state") or ""
    launch = FastAPIMessageLaunch(req, tool_conf(), launch_data_storage=storage())
    has_cookie = req.get_cookie("lti1p3-" + state) == state
    if not has_cookie and CACHE.get(f"storage-{state}"):
        proof = req.get_param("lti_storage_proof")
        if not proof:
            # Không có cookie (trong khung): đọc lại state từ OPEN-EDU, đúng thì gửi lại kèm proof dùng một lần.
            one_time = secrets.token_urlsafe(24)
            CACHE.set(f"proof-{state}", one_time, 120)
            data = json.dumps({"state": state, "target": CACHE.get(f"storage-{state}"), "origin": platform_origin(), "proof": one_time,
                               "action": str(request.url), "id_token": req.get_param("id_token")})
            script = STORAGE_JS + """
var d = %s;
ltiStore(d.target, d.origin, 'lti.get_data', { key: 'lti_state_' + d.state }).then(function (r) {
  if (r.value !== d.state) throw new Error('state');
  var f = document.createElement('form'); f.method = 'POST'; f.action = d.action;
  [['id_token', d.id_token], ['state', d.state], ['lti_storage_proof', d.proof]].forEach(function (kv) {
    var i = document.createElement('input'); i.type = 'hidden'; i.name = kv[0]; i.value = kv[1]; f.appendChild(i); });
  document.body.appendChild(f); f.submit();
}).catch(function () { document.body.textContent = 'Không mở được bài. Em mở lại từ OPEN-EDU nhé.'; });
""" % data
            return None, page("Đang mở…", "<p>Đang mở bài…</p>", script)
        if CACHE.get(f"proof-{state}") != proof:
            raise HTTPException(400, "Phiên mở bài không hợp lệ")
        CACHE.delete(f"proof-{state}")
        launch.get_session_service().set_state_valid(state, launch._get_id_token_hash())  # noqa: SLF001
    # pylti1p3 gọi mạng kiểu đồng bộ (tải JWKS của OPEN-EDU) → chạy ở luồng phụ.
    data = await run_in_threadpool(launch.get_launch_data)  # ném lỗi nếu không hợp lệ
    return launch, data


def _app_token(launch, hs) -> str:
    return SIGNER.dumps({"launch_id": launch.get_launch_id(), "user": hs})


@app.post("/lti/launch")
async def lti_launch(request: Request):
    launch, data = await _launch(request)
    if launch is None:
        return data
    if launch.is_deep_link_launch():
        return _picker(launch)
    hs = student_of(data)
    # TẠI ĐÂY: tìm / tạo học sinh trong CSDL của app theo hs["id"] (mã OPEN-EDU).
    bai = (data.get("https://purl.imsglobal.org/spec/lti/claim/custom") or {}).get("bai", "")
    token = _app_token(launch, hs)
    return page("Luyện đọc", f"<h1>Chào {html.escape(hs['name'])}</h1><p>Lớp {html.escape(hs['class_name'] or '')}. Bài: {html.escape(bai or 'tự chọn')}</p>",
                f"window.APP_TOKEN = {json.dumps(token)}; window.BAI = {json.dumps(bai)};")


@app.post("/lti/chon-bai")
async def lti_deep_link(request: Request):
    """Giáo viên chọn bài để giao (OPEN-EDU gửi LtiDeepLinkingRequest tới địa chỉ này)."""
    launch, data = await _launch(request)
    if launch is None:
        return data
    if not launch.is_deep_link_launch():
        raise HTTPException(400, "Không phải yêu cầu chọn bài")
    return _picker(launch)


def _picker(launch):
    token = SIGNER.dumps({"launch_id": launch.get_launch_id(), "dl": True})
    rows = "".join(f"<label style='display:block;margin:6px 0'><input type='checkbox' name='bai' value='{b['id']}'> {html.escape(b['ten'])}</label>" for b in BAI_DOC)
    return page("Chọn bài", f"<h1>Chọn bài để giao cho lớp</h1><form method='post' action='{APP_URL}/lti/chon-bai/xong'>"
                            f"<input type='hidden' name='t' value='{token}'>{rows}<button>Giao bài</button></form>")


@app.post("/lti/chon-bai/xong")
async def lti_deep_link_done(request: Request):
    form = await request.form()
    try:
        tok = SIGNER.loads(str(form.get("t", "")), max_age=3600)
    except BadSignature:
        raise HTTPException(401, "Phiên chọn bài đã hết hạn")
    launch = FastAPIMessageLaunch.from_cache(tok["launch_id"], FastAPIRequest(request, {}), tool_conf(), launch_data_storage=storage())
    chosen = [b for b in BAI_DOC if b["id"] in form.getlist("bai")]
    resources = [
        DeepLinkResource().set_url(f"{APP_URL}/lti/launch").set_title(b["ten"]).set_custom_params({"bai": b["id"]})
        .set_lineitem(LineItem().set_score_maximum(b["diem_toi_da"]).set_label(b["ten"]).set_tag(f"bai-{b['id']}"))
        for b in chosen
    ]
    # Trang tự gửi biểu mẫu (JWT kí bằng private.key của app) về OPEN-EDU.
    return HTMLResponse(launch.get_deep_link().output_response_form(resources))


@app.get("/lti/jwks")
async def lti_jwks():
    """Khóa công khai của app (OPEN-EDU dùng để kiểm chữ kí khi app gửi điểm / trả bài đã chọn)."""
    return JSONResponse(tool_conf().get_jwks())


# ----------------------------------------------------------------- 3. gửi dữ liệu học
def _session(request: Request):
    auth = request.headers.get("authorization", "")
    try:
        tok = SIGNER.loads(auth.removeprefix("Bearer ").strip(), max_age=6 * 3600)
    except BadSignature:
        raise HTTPException(401, "Em mở app từ OPEN-EDU trước nhé.")
    launch = FastAPIMessageLaunch.from_cache(tok["launch_id"], FastAPIRequest(request, {}), tool_conf(), launch_data_storage=storage())
    return launch, tok["user"]


def send_xapi(launch, statements: list[dict]) -> list[str]:
    """Gửi dữ liệu học chi tiết (xAPI) về OPEN-EDU bằng access token của app (scope xapi)."""
    cfg = launch.get_launch_data().get(XAPI)
    if not cfg:
        return []
    token = launch.get_service_connector().get_access_token([cfg["scope"]])
    r = requests.post(cfg["endpoint"] + "/statements", json=statements, timeout=10,
                      headers={"Authorization": "Bearer " + token, "X-Experience-API-Version": "1.0.3"})
    r.raise_for_status()
    return r.json()


def _stmt(hs, verb: str, obj_id: str, name: str, result: dict, skills: list[str] | None = None) -> dict:
    return {
        "id": str(uuid.uuid4()),
        "actor": {"account": {"homePage": "open-edu", "name": hs["id"]}},
        "verb": {"id": f"http://adlnet.gov/expapi/verbs/{verb}"},
        "object": {"id": obj_id, "definition": {"name": {"vi-VN": name}, "extensions": {SKILLS_EXT: skills or []}}},
        "result": result,
        "timestamp": dt.datetime.now(dt.timezone.utc).isoformat(),
    }


@app.post("/api/tra-loi")
async def tra_loi(request: Request):
    """
    Mỗi câu em trả lời. Thân JSON:
    { "bai": "3", "cau": "2", "cau_hoi": "Ý chính của đoạn 1?", "dung": false, "ky_nang": ["TV5-DH-YCHINH"], "giay": 45 }
    Câu có mã kĩ năng OPEN-EDU → mức thành thạo của em được cập nhật.
    """
    b = await request.json()
    launch, hs = await run_in_threadpool(_session, request)
    st = _stmt(hs, "answered", f"{APP_URL}/bai/{b['bai']}/cau/{b['cau']}", b.get("cau_hoi", f"Câu {b['cau']}"),
               {"success": bool(b["dung"]), "duration": f"PT{int(b.get('giay', 0))}S"}, b.get("ky_nang"))
    ids = await run_in_threadpool(send_xapi, launch, [st])
    return {"ok": True, "ids": ids}


@app.post("/api/ket-qua")
async def ket_qua(request: Request):
    """
    Làm xong bài: { "diem": 8, "diem_toi_da": 10, "nhan_xet": "Đọc hiểu tốt", "bai": "Bài 3 - Cây bàng" }
    Điểm vào cột điểm của bài (AGS) + một câu xAPI 'completed'.
    """
    body = await request.json()
    launch, hs = await run_in_threadpool(_session, request)
    if not launch.has_ags():
        raise HTTPException(400, "OPEN-EDU không bật nhận điểm cho lần mở này.")
    grade = (
        Grade()
        .set_score_given(float(body["diem"]))
        .set_score_maximum(float(body.get("diem_toi_da", 10)))
        .set_activity_progress("Completed")
        .set_grading_progress("FullyGraded")
        .set_user_id(hs["id"])
        .set_timestamp(dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z"))
    )
    if body.get("nhan_xet") or body.get("bai"):
        grade.set_comment(" — ".join(x for x in [body.get("bai"), body.get("nhan_xet")] if x))
    await run_in_threadpool(launch.get_ags().put_grade, grade)
    await run_in_threadpool(send_xapi, launch, [_stmt(hs, "completed", f"{APP_URL}/bai/{body.get('bai', '')}", body.get("bai", "Bài đọc"),
                                                     {"score": {"raw": float(body["diem"]), "max": float(body.get("diem_toi_da", 10))}, "completion": True})])
    return {"ok": True}
