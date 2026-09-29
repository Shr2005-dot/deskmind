"""The embed snippet the dashboard hands out points at ``<backend>/widget.js``.

FastAPI Cloud only uploads ``backend/`` and ``dist/`` is git-ignored, so the
bundle served in production has to be the committed copy in ``backend/static``.
Without it every customer embed 404s (the dashboard's Embed tab shows exactly
that URL), which is why this is covered by tests.
"""

from __future__ import annotations

from app.main import WIDGET_JS_PATHS


class TestWidgetBundle:
    def test_a_bundle_path_is_committed_with_the_backend(self):
        committed = [p for p in WIDGET_JS_PATHS if p.parent.name == "static"]
        assert committed, "expected a committed bundle path under backend/static"
        assert any(p.exists() for p in committed), (
            "backend/static/widget.iife.js is missing: copy widget/dist/widget.iife.js "
            "there after `npm run build` in widget/"
        )

    def test_widget_js_is_served_as_javascript(self, client):
        response = client.get("/widget.js")
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("application/javascript")
        assert "deskmind" in response.text.lower()
