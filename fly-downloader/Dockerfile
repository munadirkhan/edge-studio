FROM node:20-slim

RUN apt-get update && apt-get install -y \
    ffmpeg python3 python3-pip curl \
    && pip3 install yt-dlp curl_cffi --break-system-packages \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install

COPY . .
EXPOSE 8080

CMD ["sh", "-c", "pip3 install --upgrade yt-dlp --break-system-packages --quiet 2>&1 | tail -1 && node server.js"]
