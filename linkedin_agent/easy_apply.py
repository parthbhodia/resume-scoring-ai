"""
LinkedIn Easy Apply automation using Playwright.

Requires:
    pip install playwright
    playwright install chromium

Credentials (set in .env):
    LINKEDIN_EMAIL
    LINKEDIN_PASSWORD
    PHONE_NUMBER  (optional, defaults to Parth's number)
"""

import json
import os
import random
import time
from pathlib import Path
from typing import Dict

from playwright.sync_api import BrowserContext, Page, sync_playwright

_REPO_ROOT = Path(__file__).parent.parent
COOKIES_PATH = _REPO_ROOT / "linkedin_cookies.json"
DEBUG_SCREENSHOT_DIR = _REPO_ROOT / "debug_screenshots"


class LinkedInEasyApply:
    """Automates LinkedIn Easy Apply using a headed Chromium browser."""

    def __init__(self):
        self.email = os.getenv("LINKEDIN_EMAIL", "")
        self.password = os.getenv("LINKEDIN_PASSWORD", "")
        self.phone = os.getenv("PHONE_NUMBER", "4439294371")

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _delay(self, min_s: float = 0.5, max_s: float = 1.5) -> None:
        time.sleep(random.uniform(min_s, max_s))

    def _save_cookies(self, context: BrowserContext) -> None:
        with open(COOKIES_PATH, "w", encoding="utf-8") as f:
            json.dump(context.cookies(), f)

    def _load_cookies(self, context: BrowserContext) -> bool:
        if COOKIES_PATH.exists():
            with open(COOKIES_PATH, encoding="utf-8") as f:
                context.add_cookies(json.load(f))
            return True
        return False

    def _is_logged_in(self, page: Page) -> bool:
        try:
            page.goto("https://www.linkedin.com/feed/", timeout=15_000)
            self._delay(1, 2)
            return "feed" in page.url and "login" not in page.url
        except Exception:
            return False

    def _login(self, page: Page) -> bool:
        try:
            page.goto("https://www.linkedin.com/login", timeout=15_000)
            self._delay(1, 2)
            page.fill("#username", self.email)
            self._delay(0.3, 0.7)
            page.fill("#password", self.password)
            self._delay(0.3, 0.7)
            page.click('[type="submit"]')
            self._delay(3, 5)
            if "checkpoint" in page.url or "captcha" in page.url.lower():
                return False  # Needs manual intervention
            return "feed" in page.url or "mynetwork" in page.url or "jobs" in page.url
        except Exception as e:
            print(f"[EasyApply] Login error: {e}")
            return False

    # ------------------------------------------------------------------
    # Form filling
    # ------------------------------------------------------------------

    def _handle_form_step(self, page: Page, cover_letter: str, resume_path: str) -> str:
        """
        Fill all visible fields on the current form step.

        Returns: "submit" | "review" | "next" | "error"
        """
        self._delay(0.5, 1.0)

        # 1. Resume file upload
        if resume_path and os.path.exists(resume_path):
            for file_input in page.query_selector_all('input[type="file"]'):
                try:
                    file_input.set_input_files(resume_path)
                    self._delay(1, 2)
                except Exception:
                    pass

        # 2. Cover letter textarea
        for area in page.query_selector_all("textarea"):
            try:
                aria = (area.get_attribute("aria-label") or "").lower()
                ph = (area.get_attribute("placeholder") or "").lower()
                label_text = aria + ph
                if ("cover" in label_text or "letter" in label_text or "message" in label_text):
                    if cover_letter and not area.input_value().strip():
                        area.fill(cover_letter[:2000])
                        self._delay(0.4, 0.8)
            except Exception:
                continue

        # 3. Text / tel / number inputs
        _profile_answers = {
            "phone": self.phone,
            "mobile": self.phone,
            "city": "Jersey City",
            "zip": "07302",
            "postal": "07302",
            "linkedin": "https://linkedin.com/in/parthbhodia",
            "website": "https://parthbhodia.com",
            "portfolio": "https://parthbhodia.com",
            "github": "https://github.com/parthbhodia",
        }
        for inp in page.query_selector_all('input[type="text"], input[type="tel"], input[type="number"]'):
            try:
                if inp.input_value().strip():
                    continue  # Already filled — leave it alone
                aria = (inp.get_attribute("aria-label") or "").lower()
                ph = (inp.get_attribute("placeholder") or "").lower()
                label_hint = aria + ph
                for keyword, value in _profile_answers.items():
                    if keyword in label_hint:
                        inp.fill("")
                        inp.type(value, delay=40)
                        self._delay(0.2, 0.4)
                        break
            except Exception:
                continue

        # 4. <select> dropdowns — pick index 1 if nothing selected
        for sel in page.query_selector_all("select"):
            try:
                current = sel.input_value()
                options = sel.query_selector_all("option")
                if (not current or current == "") and len(options) > 1:
                    sel.select_option(index=1)
                    self._delay(0.2, 0.4)
            except Exception:
                continue

        # 5. Radio fieldsets (work auth, sponsorship, etc.)
        for fieldset in page.query_selector_all("fieldset"):
            try:
                legend = fieldset.query_selector("legend")
                legend_text = legend.inner_text().lower() if legend else ""
                radios = fieldset.query_selector_all('input[type="radio"]')
                if not radios:
                    continue
                # Skip if one is already checked
                if any(r.is_checked() for r in radios):
                    continue
                # Auth / sponsorship questions → prefer "Yes"
                auth_keywords = ["authorized", "eligible", "legally", "sponsorship", "citizen", "visa"]
                if any(kw in legend_text for kw in auth_keywords):
                    clicked = False
                    for radio in radios:
                        rid = radio.get_attribute("id") or ""
                        lbl = page.query_selector(f'label[for="{rid}"]') if rid else None
                        if lbl and "yes" in lbl.inner_text().lower():
                            radio.click()
                            clicked = True
                            self._delay(0.2, 0.4)
                            break
                    if not clicked:
                        radios[0].click()
                else:
                    radios[0].click()
                self._delay(0.2, 0.4)
            except Exception:
                continue

        # 6. Determine which navigation button is available
        #    Priority: Submit > Review > Next/Continue
        selectors = {
            "submit": [
                'button[aria-label*="Submit application"]',
                'button:text-is("Submit application")',
            ],
            "review": [
                'button[aria-label*="Review your application"]',
                'button:text-is("Review")',
            ],
            "next": [
                'button[aria-label*="Continue to next step"]',
                'button:text-is("Next")',
                'button[aria-label*="Next"]',
            ],
        }
        for action, css_list in selectors.items():
            for css in css_list:
                try:
                    btn = page.query_selector(css)
                    if btn and btn.is_visible():
                        return action
                except Exception:
                    continue

        return "error"

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def apply(self, job_id: str, cover_letter: str = "", resume_path: str = "") -> Dict:
        """
        Apply to a LinkedIn job via Easy Apply.

        Args:
            job_id: LinkedIn numeric job ID
            cover_letter: Text to paste into cover letter fields
            resume_path: Absolute path to a PDF resume to upload

        Returns:
            dict with keys: success, job_id, status, message, url (optional)
        """
        if not self.email or not self.password:
            return {
                "success": False,
                "job_id": job_id,
                "status": "credentials_missing",
                "message": (
                    "LinkedIn credentials not set. "
                    "Add LINKEDIN_EMAIL and LINKEDIN_PASSWORD to your .env file."
                ),
            }

        job_url = f"https://www.linkedin.com/jobs/view/{job_id}"
        DEBUG_SCREENSHOT_DIR.mkdir(exist_ok=True)

        with sync_playwright() as pw:
            browser = pw.chromium.launch(
                headless=False,
                args=["--start-maximized"],
            )
            context = browser.new_context(
                viewport={"width": 1280, "height": 800},
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/121.0.0.0 Safari/537.36"
                ),
            )
            self._load_cookies(context)
            page = context.new_page()

            try:
                # Ensure logged in
                if not self._is_logged_in(page):
                    if not self._login(page):
                        return {
                            "success": False,
                            "job_id": job_id,
                            "status": "login_failed",
                            "message": (
                                "LinkedIn login failed. "
                                "Check credentials or complete any CAPTCHA that appeared in the browser window."
                            ),
                        }
                    self._save_cookies(context)

                # Navigate to job
                page.goto(job_url, timeout=20_000)
                self._delay(2, 3)

                # Find Easy Apply button
                easy_apply_btn = None
                for css in [
                    'button[aria-label*="Easy Apply"]',
                    ".jobs-apply-button--top-card button",
                    'button:text-is("Easy Apply")',
                ]:
                    try:
                        btn = page.query_selector(css)
                        if btn and btn.is_visible():
                            easy_apply_btn = btn
                            break
                    except Exception:
                        continue

                if not easy_apply_btn:
                    return {
                        "success": False,
                        "job_id": job_id,
                        "status": "no_easy_apply",
                        "message": "This job does not have Easy Apply. Apply manually at: " + job_url,
                    }

                easy_apply_btn.click()
                self._delay(1.5, 2.5)

                # Multi-step form loop
                for step in range(1, 11):
                    action = self._handle_form_step(page, cover_letter, resume_path)

                    if action == "submit":
                        for css in [
                            'button[aria-label*="Submit application"]',
                            'button:text-is("Submit application")',
                        ]:
                            try:
                                btn = page.query_selector(css)
                                if btn and btn.is_visible():
                                    btn.click()
                                    self._delay(2, 3)
                                    self._save_cookies(context)
                                    return {
                                        "success": True,
                                        "job_id": job_id,
                                        "status": "applied",
                                        "message": f"Easy Apply submitted successfully for job {job_id}.",
                                        "url": job_url,
                                    }
                            except Exception:
                                continue
                        # Submit button found but click failed
                        return {
                            "success": False,
                            "job_id": job_id,
                            "status": "submit_click_failed",
                            "message": "Found Submit button but could not click it.",
                        }

                    elif action == "review":
                        for css in [
                            'button[aria-label*="Review your application"]',
                            'button:text-is("Review")',
                        ]:
                            try:
                                btn = page.query_selector(css)
                                if btn and btn.is_visible():
                                    btn.click()
                                    self._delay(1, 2)
                                    break
                            except Exception:
                                continue

                    elif action == "next":
                        for css in [
                            'button[aria-label*="Continue to next step"]',
                            'button:text-is("Next")',
                            'button[aria-label*="Next"]',
                        ]:
                            try:
                                btn = page.query_selector(css)
                                if btn and btn.is_visible():
                                    btn.click()
                                    self._delay(1, 2)
                                    break
                            except Exception:
                                continue

                    else:  # "error" — unknown state
                        screenshot_path = str(
                            DEBUG_SCREENSHOT_DIR / f"easy_apply_step{step}_{job_id}.png"
                        )
                        try:
                            page.screenshot(path=screenshot_path)
                        except Exception:
                            pass
                        return {
                            "success": False,
                            "job_id": job_id,
                            "status": "form_error",
                            "message": (
                                f"Could not determine next action on step {step}. "
                                f"Screenshot saved to: {screenshot_path}"
                            ),
                        }

                return {
                    "success": False,
                    "job_id": job_id,
                    "status": "max_steps_exceeded",
                    "message": "Form exceeded 10 steps without completing. Check debug_screenshots/.",
                }

            except Exception as e:
                return {
                    "success": False,
                    "job_id": job_id,
                    "status": "error",
                    "message": str(e),
                }
            finally:
                try:
                    self._save_cookies(context)
                except Exception:
                    pass
                browser.close()
