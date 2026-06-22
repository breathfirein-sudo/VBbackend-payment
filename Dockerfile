FROM node:20
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm install --production
COPY . .
EXPOSE 5000
CMD ["node", "server.js"]
