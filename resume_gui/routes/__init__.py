"""Collect all HTTP routes for the Starlette app."""
from starlette.routing import Route

from resume_gui.routes.advisor import (
    api_advisor_access,
    api_cohort_stats,
    api_student_detail,
    api_sync_institution_student,
)
from resume_gui.routes.analyze import (
    api_analyze,
    api_analyze_folder,
    api_analyze_upload,
    api_explain_category_score,
    api_my_analyses,
    api_scan_limit_status,
)
from resume_gui.routes.export import (
    api_builder_export_docx,
    api_export_docx,
    api_export_pdf_html,
    api_tb_enhance,
)
from resume_gui.routes.generate import api_generate_stream
from resume_gui.routes.library import (
    api_backfill_tex,
    api_resume_parsed,
    api_resume_save,
    api_resumes,
    api_storage_status,
    api_upload_resume,
    api_version_list,
    api_version_load,
    api_version_save,
)
from resume_gui.routes.misc import (
    api_ai_edit_bullet,
    api_ats_check,
    api_doctor_check,
    api_extract_jd,
    api_generate_skills,
    api_resume_analysis,
)
from resume_gui.routes.admin import api_admin_analytics
from resume_gui.routes.feedback import api_admin_bug_reports, api_bug_report
from resume_gui.routes.rewrite import api_rewrite_bullet, api_rewrite_role
from resume_gui.routes.share import api_share_create, api_share_resolve, api_share_revoke
from resume_gui.routes.static import api_health, homepage, serve_pdf
from resume_gui.routes.suggest import api_suggest_changes_stream, api_suggest_gap_fix
from resume_gui.routes.profile_dashboard import profile_dashboard_handler


def all_routes():
    return [
        Route("/", homepage),
        Route("/api/health", api_health, methods=["GET"]),
        Route("/api/resumes", api_resumes),
        Route("/api/generate-stream", api_generate_stream, methods=["POST"]),
        Route("/api/upload-resume", api_upload_resume, methods=["POST"]),
        Route("/api/analyze", api_analyze, methods=["POST"]),
        Route("/api/extract-jd", api_extract_jd, methods=["POST"]),
        Route("/api/resume/{folder}", api_resume_parsed, methods=["GET"]),
        Route("/api/resume/{folder}", api_resume_save, methods=["POST"]),
        Route("/api/ai-edit-bullet", api_ai_edit_bullet, methods=["POST"]),
        Route("/api/generate-skills", api_generate_skills, methods=["POST"]),
        Route("/api/ats-check/{folder}", api_ats_check, methods=["POST"]),
        Route("/api/doctor-check", api_doctor_check, methods=["POST"]),
        Route("/api/resume-analysis/{folder}", api_resume_analysis, methods=["POST"]),
        Route("/api/share/{folder}", api_share_create, methods=["POST"]),
        Route("/api/share/{shortid}", api_share_resolve, methods=["GET"]),
        Route("/api/share/{shortid}", api_share_revoke, methods=["DELETE"]),
        Route("/api/version/{folder}", api_version_save, methods=["POST"]),
        Route("/api/version/{folder}", api_version_list, methods=["GET"]),
        Route("/api/version/{folder}/{version}", api_version_load, methods=["GET"]),
        Route("/api/storage-status", api_storage_status, methods=["GET"]),
        Route("/api/backfill-tex", api_backfill_tex, methods=["POST"]),
        Route("/api/analyze-upload", api_analyze_upload, methods=["POST"]),
        Route("/api/scan-limit-status", api_scan_limit_status, methods=["GET"]),
        Route("/api/my-analyses", api_my_analyses, methods=["GET"]),
        Route("/api/profile-dashboard", profile_dashboard_handler, methods=["GET"]),
        Route("/api/advisor-access", api_advisor_access, methods=["GET"]),
        Route("/api/sync-institution-student", api_sync_institution_student, methods=["POST"]),
        Route("/api/cohort-stats", api_cohort_stats, methods=["GET"]),
        Route("/api/student-detail", api_student_detail, methods=["GET"]),
        Route("/api/export-docx", api_export_docx, methods=["POST"]),
        Route("/api/builder-export-docx", api_builder_export_docx, methods=["POST"]),
        Route("/api/analyze-folder/{folder}", api_analyze_folder, methods=["POST"]),
        Route("/api/rewrite-role", api_rewrite_role, methods=["POST"]),
        Route("/api/rewrite-bullet", api_rewrite_bullet, methods=["POST"]),
        Route("/api/tb-enhance", api_tb_enhance, methods=["POST"]),
        Route("/api/suggest-changes-stream", api_suggest_changes_stream, methods=["POST"]),
        Route("/api/suggest-gap-fix", api_suggest_gap_fix, methods=["POST"]),
        Route("/api/explain-category-score", api_explain_category_score, methods=["POST"]),
        Route("/api/export-pdf-html", api_export_pdf_html, methods=["POST"]),
        Route("/api/bug-report", api_bug_report, methods=["POST"]),
        Route("/api/admin/bug-reports", api_admin_bug_reports, methods=["GET"]),
        Route("/api/admin/analytics", api_admin_analytics, methods=["GET"]),
        Route("/pdf/{folder}/{filename}", serve_pdf),
    ]
