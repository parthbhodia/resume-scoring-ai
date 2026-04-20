# Railway build — Python backend with LaTeX support + headless Chromium
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

# Install Chromium + its native libs so the JD scraper can render JS-heavy
# job boards (Ashby, Workday, Google Careers). --with-deps does the apt-get
# install of libnss3/libatk/etc. that Chromium needs to launch headless.
RUN python -m playwright install --with-deps chromium && \
    rm -rf /var/lib/apt/lists/*

COPY . .

# Default library root on Railway (ephemeral — resumes persist only per-instance)
ENV LIBRARY_ROOT=/app/resume_library

RUN mkdir -p /app/resume_library

EXPOSE 8080

CMD ["uvicorn", "resume_gui.app:app", "--host", "0.0.0.0", "--port", "8080"]
