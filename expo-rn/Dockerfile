FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy app files
COPY . .

# Expose Expo ports
EXPOSE 8081 8082

# Start Expo
CMD ["npx", "expo", "start", "--web", "--host", "0.0.0.0"]
