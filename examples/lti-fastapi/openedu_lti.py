"""
Bộ nối pylti1p3 ↔ FastAPI (pylti1p3 chỉ có sẵn bộ nối Flask/Django).

Dùng trong app luyện đọc hiểu: chép tệp này vào dự án, rồi xem app.py để biết cách gọi.
Cần: pip install -r requirements.txt

ServerCacheStorage: trạng thái đăng nhập LTI giữ ở MÁY CHỦ (không cần cookie phiên) để app chạy được trong khung của
OPEN-EDU trên Safari / iPad. Bản mẫu dùng bộ nhớ của tiến trình (CACHE) — chạy nhiều tiến trình / nhiều máy thì thay
bằng Redis (cùng 3 hàm get / set / delete).

Lưu ý: pylti1p3 là thư viện đồng bộ (gọi mạng bằng requests). Các hàm ở đây đọc xong dữ liệu biểu mẫu
(await request.form()) rồi mới gọi pylti1p3, nên dùng được trong endpoint async của FastAPI.
"""
from __future__ import annotations

import threading
import time
import typing as t

from fastapi import Request as FastAPIRequestType
from fastapi.responses import HTMLResponse, RedirectResponse, Response
from pylti1p3.cookie import CookieService
from pylti1p3.launch_data_storage.cache import CacheDataStorage
from pylti1p3.message_launch import MessageLaunch
from pylti1p3.oidc_login import OIDCLogin
from pylti1p3.redirect import Redirect
from pylti1p3.request import Request
from pylti1p3.session import SessionService


class FastAPIRequest(Request):
    """Gói request của FastAPI cho pylti1p3. `params` = query (GET) hoặc form (POST) đã đọc sẵn."""

    def __init__(self, request: FastAPIRequestType, params: t.Mapping[str, t.Any]):
        super().__init__()
        self._request = request
        self._params = dict(params)

    @classmethod
    async def build(cls, request: FastAPIRequestType) -> "FastAPIRequest":
        params: dict[str, t.Any] = dict(request.query_params)
        if request.method == "POST":
            form = await request.form()
            params.update({k: v for k, v in form.items() if isinstance(v, str)})
        return cls(request, params)

    @property
    def session(self):
        # Không dùng phiên cookie (xem ServerCacheStorage). Giữ để tương thích pylti1p3.
        return self._request.scope.setdefault("lti_session", {})

    def get_param(self, key: str):
        return self._params.get(key)

    def get_cookie(self, key: str):
        return self._request.cookies.get(key)

    def is_secure(self) -> bool:
        proto = self._request.headers.get("x-forwarded-proto", self._request.url.scheme)
        return proto == "https"


class MemoryCache:
    """Bộ nhớ có hạn dùng (giây). Thay bằng Redis khi chạy nhiều tiến trình."""

    def __init__(self):
        self._d: dict[str, tuple[float, t.Any]] = {}
        self._lock = threading.Lock()

    def get(self, key: str):
        with self._lock:
            hit = self._d.get(key)
            if not hit:
                return None
            if hit[0] < time.time():
                self._d.pop(key, None)
                return None
            return hit[1]

    def set(self, key: str, value, exp: int | None = None):
        with self._lock:
            if len(self._d) > 50000:  # dọn bớt mục hết hạn
                now = time.time()
                for k in [k for k, v in self._d.items() if v[0] < now]:
                    self._d.pop(k, None)
            self._d[key] = (time.time() + (exp or 86400), value)

    def delete(self, key: str):
        with self._lock:
            self._d.pop(key, None)


CACHE = MemoryCache()


class ServerCacheStorage(CacheDataStorage):
    """Kho trạng thái LTI ở máy chủ, KHÔNG gắn với cookie phiên (state / nonce là chuỗi ngẫu nhiên khó đoán)."""

    def __init__(self, cache: MemoryCache | None = None):
        super().__init__()
        self._cache = cache or CACHE

    def get_session_cookie_name(self):
        return None


class FastAPICookieService(CookieService):
    def __init__(self, request: FastAPIRequest):
        self._request = request
        self._to_set: dict[str, dict[str, t.Any]] = {}

    def _get_key(self, key: str) -> str:
        return self._cookie_prefix + "-" + key

    def get_cookie(self, name: str):
        return self._request.get_cookie(self._get_key(name))

    def set_cookie(self, name: str, value, exp: int = 3600):
        self._to_set[self._get_key(name)] = {"value": value, "exp": exp}

    def update_response(self, response: Response) -> None:
        secure = self._request.is_secure()
        for key, c in self._to_set.items():
            response.set_cookie(key=key, value=str(c["value"]), max_age=c["exp"], secure=secure, path="/", httponly=True, samesite="none" if secure else "lax")


class FastAPIRedirect(Redirect):
    def __init__(self, location: str, cookie_service: FastAPICookieService | None = None):
        super().__init__()
        self._location = location
        self._cookie_service = cookie_service

    def _done(self, response: Response) -> Response:
        if self._cookie_service:
            self._cookie_service.update_response(response)
        return response

    def do_redirect(self):
        return self._done(RedirectResponse(self._location, status_code=302))

    def do_js_redirect(self):
        return self._done(HTMLResponse(f'<script>window.location={self._location!r};</script>'))

    def set_redirect_url(self, location: str):
        self._location = location

    def get_redirect_url(self) -> str:
        return self._location


class FastAPIOIDCLogin(OIDCLogin):
    def __init__(self, request: FastAPIRequest, tool_config, session_service=None, cookie_service=None, launch_data_storage=None):
        cookie_service = cookie_service or FastAPICookieService(request)
        session_service = session_service or SessionService(request)
        super().__init__(request, tool_config, session_service, cookie_service, launch_data_storage)

    def get_redirect(self, url: str):
        return FastAPIRedirect(url, self._cookie_service)

    def get_response(self, html: str):
        return HTMLResponse(html)


class FastAPIMessageLaunch(MessageLaunch):
    def __init__(self, request: FastAPIRequest, tool_config, session_service=None, cookie_service=None, launch_data_storage=None, requests_session=None):
        cookie_service = cookie_service or FastAPICookieService(request)
        session_service = session_service or SessionService(request)
        super().__init__(request, tool_config, session_service, cookie_service, launch_data_storage, requests_session)

    def _get_request_param(self, key: str):
        return self._request.get_param(key)


LTI = "https://purl.imsglobal.org/spec/lti/claim/"


def student_of(launch_data: t.Mapping[str, t.Any]) -> dict[str, t.Any]:
    """Thông tin người dùng OPEN-EDU gửi sang trong id_token."""
    roles = launch_data.get(LTI + "roles", [])
    ctx = launch_data.get(LTI + "context", {}) or {}
    custom = launch_data.get(LTI + "custom", {}) or {}
    return {
        "id": launch_data.get("sub"),  # mã người dùng OPEN-EDU — dùng làm khóa trong CSDL của app
        "name": launch_data.get("name", ""),
        "email": launch_data.get("email", ""),
        "username": custom.get("username", ""),
        "grade": custom.get("grade", ""),
        "class_id": ctx.get("id"),
        "class_name": ctx.get("label") or custom.get("class_name", ""),
        "is_teacher": any(r.endswith("#Instructor") or r.endswith("#Administrator") for r in roles),
    }
