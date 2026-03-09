# Usar una imagen ligera de Node.js v20
FROM node:20-slim

# ─── 1. Instalar dependencias del sistema para Puppeteer/Chromium ───
# WhatsApp Web.js requiere de un navegador headless por detrás, y en Linux
# es necesario instalar todas estas librerías gráficas para que no crashee.
RUN apt-get update && apt-get install -y \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    xdg-utils \
    wget \
    && rm -rf /var/lib/apt/lists/*

# ─── 2. Configurar el directorio de trabajo ───
WORKDIR /usr/src/app

# ─── 3. Instalar dependencias de Node.js ───
# Copiamos primero package.json y package-lock.json para aprovechar la caché de Docker
COPY package*.json ./
RUN npm ci

# ─── 4. Generar el cliente de Prisma ───
COPY prisma ./prisma/
RUN npx prisma generate

# ─── 5. Copiar el resto del código ───
COPY . .

# ─── 6. Exponer puertos y comando de inicio ───
# El puerto en el que corre tu API (por defecto 3001)
EXPOSE 3001

# Iniciar el servidor
CMD ["npm", "start"]
