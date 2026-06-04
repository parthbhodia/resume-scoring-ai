from resume_gui.services import scan_limits


def test_blocks_non_unlimited_user_at_limit(monkeypatch):
    monkeypatch.setattr(scan_limits, "_daily_scan_limit", lambda: 5)
    monkeypatch.setattr(scan_limits, "_user_in_unlimited_institution", lambda user_id, user_email: False)
    monkeypatch.setattr(scan_limits, "_daily_scan_count", lambda user_id: (5, "2026-06-04T00:00:00Z"))

    status = scan_limits._scan_limit_status_for_user("user-1", "student@gmail.com")

    assert status["enforced"] is True
    assert status["allowed"] is False
    assert status["limit"] == 5
    assert status["used"] == 5
    assert status["reason"] == "daily_free_tier_limit"


def test_allows_non_unlimited_user_below_limit(monkeypatch):
    monkeypatch.setattr(scan_limits, "_daily_scan_limit", lambda: 5)
    monkeypatch.setattr(scan_limits, "_user_in_unlimited_institution", lambda user_id, user_email: False)
    monkeypatch.setattr(scan_limits, "_daily_scan_count", lambda user_id: (3, "2026-06-04T00:00:00Z"))

    status = scan_limits._scan_limit_status_for_user("user-2", "student@gmail.com")

    assert status["enforced"] is True
    assert status["allowed"] is True
    assert status["limit"] == 5
    assert status["used"] == 3


def test_allows_unlimited_institution_user(monkeypatch):
    monkeypatch.setattr(scan_limits, "_user_in_unlimited_institution", lambda user_id, user_email: True)

    status = scan_limits._scan_limit_status_for_user("umbc-user", "student@umbc.edu")

    assert status["enforced"] is True
    assert status["allowed"] is True
    assert status["reason"] == "unlimited_institution"
    assert status["limit"] is None
    assert status["used"] is None


def test_skips_limit_for_missing_verified_user():
    status = scan_limits._scan_limit_status_for_user(None, None)
    assert status["enforced"] is False
    assert status["allowed"] is True
    assert status["reason"] == "anonymous_or_unverified"
