@echo off
echo Starting Resume Generator...
echo Open http://localhost:8765 in your browser
echo Press Ctrl+C to stop.
echo.
cd /d "C:\Users\parth\job-search"
.venv\Scripts\python.exe resume_gui\app.py
pause
