# Use a slim version of Python for a smaller footprint
FROM python:3.11-slim-bookworm

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    dnsutils \
    nmap \
    sslscan \
    gobuster \
    wget \
    curl \
    unzip \
    nodejs \
    npm \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install subfinder manually
RUN wget -qO subfinder.zip https://github.com/projectdiscovery/subfinder/releases/download/v2.6.6/subfinder_2.6.6_linux_amd64.zip \
    && unzip subfinder.zip \
    && mv subfinder /usr/local/bin/ \
    && rm subfinder.zip

#Install playwright package 
COPY package*.json ./
RUN npm install
#Chromium for playwrigth 
RUN npx playwright install --with-deps chromium 

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the backend code
COPY . .

# Expose ports (will be overridden by compose)
EXPOSE 5000-5011

# Default command (can be overridden)
CMD ["python", "api_gateway/app.py"]
