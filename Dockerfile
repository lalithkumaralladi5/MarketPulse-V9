# Cloud showcase uses DEMO by default. Do not add a personal Upstox token to a public endpoint.
FROM eclipse-temurin:21-jdk-jammy
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends python3 python3-venv ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY ml/requirements.txt /app/ml/requirements.txt
RUN python3 -m venv /opt/mpvenv && /opt/mpvenv/bin/pip install --no-cache-dir -r /app/ml/requirements.txt
COPY . /app
# Compile all backend sources, including LiveStream.java and future services.
# CI must validate this exact Docker image, not only the local wildcard javac build.
RUN mkdir -p backend/classes && javac --release 21 -d backend/classes backend/*.java \
 && chmod +x start-cloud.sh
ENV PATH="/opt/mpvenv/bin:$PATH" \
    PORT=10000 \
    MARKETPULSE_BIND=0.0.0.0 \
    PYTHONUNBUFFERED=1
EXPOSE 10000
CMD ["./start-cloud.sh"]
