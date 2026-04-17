"""
Parth Bhodia — verified static profile.

Used as the primary profile source by the agent. Falls back to this whenever
LinkedIn scraping fails (which it often does). All data is verified from
actual resume files and work history.
"""

PARTH_PROFILE = {
    "name": "Parth Bhodia",
    "handle": "parthbhodia",
    "url": "https://linkedin.com/in/parthbhodia",
    "headline": "Full-Stack Software Engineer | AI/GenAI | React · Node.js · Python · AWS · GCP",
    "location": "Jersey City, NJ (NYC metro)",
    "email": "parthbhodia08@gmail.com",
    "phone": "+1 (443) 929-4371",
    "website": "parthbhodia.com",
    "about": (
        "Full-stack software engineer with 7+ years building end-to-end web applications "
        "using ReactJS and Node.js, designing scalable backend services and data flow pipelines, "
        "and owning production systems from schema design through deployment. Proven track record "
        "integrating RESTful and GraphQL APIs, delivering reliable distributed systems on AWS and GCP, "
        "and driving unit testing and pre-deployment QA standards across cross-functional teams. "
        "Strong background in AI/GenAI integrations (AWS Bedrock, TensorFlow, BERT, xAI/Groq), "
        "federal/enterprise software delivery, and performance optimization."
    ),
    "experience": [
        {
            "title": "Full-Stack Software Engineer",
            "company": "Eccalon LLC",
            "duration": "May 2022 – Present",
            "location": "Remote",
            "description": (
                "Built and owned React + Node.js end-to-end features across federal and enterprise "
                "platforms, managing the full lifecycle from API contract definition to frontend "
                "integration and production deployment on a system serving 100,000+ users. "
                "Designed PostgreSQL schema for a high-traffic multi-tenant CMS. "
                "Engineered gRPC-based streaming pipelines for real-time audio and text processing. "
                "Integrated AWS Bedrock LLM to deliver an AI-powered contract analytics tool, "
                "cutting time-to-information by 50%. Implemented secure auth using AWS Cognito, "
                "Lambda, and API Gateway. Delivered WCAG 2.1 compliance (ARIA, screen reader) "
                "for a CMMC vendor certification platform. Developed Code Compliant tool using "
                "BERT + XGBoost + TensorFlow for SBOM reports and foreign code ownership detection "
                "for US government clients."
            ),
            "technologies": [
                "React", "Redux", "Node.js", "Python", "PostgreSQL", "REST APIs", "gRPC",
                "AWS (Lambda, Cognito, API Gateway, Bedrock)", "TypeScript", "Docker", "Git",
                "TensorFlow", "BERT", "XGBoost"
            ],
        },
        {
            "title": "Research Software Engineer",
            "company": "University of Maryland, Baltimore County (UMBC)",
            "duration": "Jan 2022 – Dec 2022",
            "location": "Halethorpe, MD",
            "description": (
                "Architected a distributed Java Spring Boot backend with RabbitMQ message queuing "
                "and gRPC inter-service communication, enabling real-time geospatial data "
                "synchronization across system nodes. Built GIS anomaly detection visualizations "
                "using Elasticsearch + Kibana. Deployed backend services to a Kubernetes cluster "
                "for scalable, reproducible research infrastructure."
            ),
            "technologies": [
                "Java", "Spring Boot", "RabbitMQ", "gRPC", "Elasticsearch", "Kibana",
                "Kubernetes", "minikube"
            ],
        },
        {
            "title": "Software Engineer",
            "company": "Tata Communications Ltd.",
            "duration": "July 2018 – May 2021",
            "location": "Mumbai, IN",
            "description": (
                "Owned full-stack delivery of an internal analytics dashboard serving 10,000+ users "
                "— built the React frontend and Django/Python backend end-to-end, shipping iterative "
                "features that supported a 36% revenue increase in the APAC region. Built a "
                "Python-based route optimization service with a data-driven REST API layer. "
                "Established CI/CD pipelines with Jenkins and mentored junior engineers on testing "
                "standards and pre-deployment QA practices."
            ),
            "technologies": [
                "React", "JavaScript", "Django", "Python", "MySQL", "REST APIs", "Jenkins", "Git"
            ],
        },
    ],
    "projects": [
        {
            "title": "VibeIMG",
            "description": (
                "AI image generation SaaS with end-to-end product ownership: React + Redux frontend, "
                "FastAPI backend, Stripe payment flows, deployed to production as a profitable product. "
                "Reduced image generation latency from 25s to 10s (60% improvement) by optimizing "
                "the inference pipeline. Implemented a dual LLM fallback (xAI primary, Groq fallback) "
                "with graceful degradation for production resilience."
            ),
            "technologies": ["React", "Redux", "FastAPI", "Node.js", "Replicate Flux", "Stripe", "xAI", "Groq"],
            "year": "2024",
        },
        {
            "title": "Real-Time Tweet Sentiment Pipeline",
            "description": (
                "End-to-end GCP streaming data pipeline ingesting from Twitter/X API, processing "
                "through Pub/Sub and Dataflow, persisting to Spanner via Change Streams, and "
                "exposing a REST API layer for real-time sentiment scores at ~2–5s end-to-end latency."
            ),
            "technologies": [
                "GCP", "Pub/Sub", "Dataflow", "Spanner", "Cloud Functions", "NL API", "Python"
            ],
            "year": "2026",
        },
        {
            "title": "Nutri AI Scan",
            "description": (
                "Computer vision web app for food label scanning using Vue.js, OpenCV, and MongoDB. "
                "Won 2nd place at CBIC UMBC competition (25+ teams)."
            ),
            "technologies": ["Vue.js", "OpenCV", "MongoDB"],
            "year": "Oct 2022 – Feb 2023",
        },
    ],
    "education": [
        {
            "school": "University of Maryland, Baltimore County (UMBC)",
            "degree": "Master of Science",
            "field": "Computer Science",
            "years": "August 2021 – May 2023",
            "location": "Baltimore, MD",
        },
        {
            "school": "University of Mumbai",
            "degree": "Bachelor of Engineering",
            "field": "Information Technology",
            "years": "August 2014 – May 2018",
            "location": "Mumbai, IN",
        },
    ],
    "skills": [
        # Frontend
        "React", "Redux", "Vue.js", "JavaScript", "TypeScript", "HTML5", "CSS3",
        "WCAG 2.1", "ARIA Accessibility", "Responsive Design",
        # Backend
        "Node.js", "Python", "Java", "Django", "FastAPI", "Spring Boot",
        "REST APIs", "GraphQL", "gRPC",
        # AI/GenAI
        "AWS Bedrock", "TensorFlow", "BERT", "XGBoost", "OpenCV", "xAI", "Groq",
        "Replicate Flux", "LangChain", "LangGraph",
        # Data
        "PostgreSQL", "MySQL", "MongoDB", "Elasticsearch", "RabbitMQ", "SQL",
        # Cloud
        "AWS (Bedrock, Lambda, Cognito, API Gateway)",
        "GCP (Pub/Sub, Dataflow, Spanner, Cloud Functions, NL API)",
        # DevOps
        "Docker", "Kubernetes", "Jenkins", "Git", "CI/CD",
    ],
    "certifications": [],
    "languages": ["English"],
}


def get_parth_profile() -> dict:
    """Return Parth's complete verified profile."""
    return PARTH_PROFILE
