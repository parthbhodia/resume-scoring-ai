# Railway build — Python backend with LaTeX support
FROM python:3.11-slim

# Install texlive for PDF compilation
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        texlive-latex-base \
        texlive-fonts-recommended \
        texlive-latex-extra && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Default library root on Railway (ephemeral — resumes persist only per-instance)
ENV LIBRARY_ROOT=/app/resume_library

RUN mkdir -p /app/resume_library

EXPOSE 8080

CMD ["uvicorn", "resume_gui.app:app", "--host", "0.0.0.0", "--port", "8080"]
