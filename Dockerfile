FROM node:20-alpine
WORKDIR /app

# COPY package.json package-lock.json ./
COPY . .
RUN npm install --production

RUN npx prisma generate

EXPOSE 7000
CMD ["node", "server.js"]
