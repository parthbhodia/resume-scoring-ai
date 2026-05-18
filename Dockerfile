# Railway build — Python backend with LaTeX support
FROM python:3.11-slim

# Install texlive for PDF compilation.
#   - texlive-fonts-extra    → `marvosym` (phone/email icons in the preamble)
#   - texlive-plain-generic  → `ulem.sty` (\usepackage[normalem]{ulem})
#   - lmodern                → `lmodern.sty` (\usepackage{lmodern})
# Missing any of these causes pdflatex to exit 1 with no output PDF.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        texlive-latex-base \
        texlive-fonts-recommended \
        texlive-fonts-extra \
        texlive-latex-extra \
        texlive-plain-generic \
        lmodern && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Default library root on Railway (ephemeral — resumes persist only per-instance)
ENV LIBRARY_ROOT=/app/resume_library

RUN mkdir -p /app/resume_library

# Railway injects $PORT; must listen on it (hardcoding 8080 causes 502 + bogus CORS errors).
ENV PORT=8080
EXPOSE 8080

CMD ["sh", "-c", "exec uvicorn resume_gui.app:app --host 0.0.0.0 --port ${PORT:-8080}"]
