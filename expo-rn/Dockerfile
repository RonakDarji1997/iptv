FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy app files
COPY . .

# Expose Expo ports
EXPOSE 3005

# Start Expo
CMD ["npx", "expo", "start", "--lan", "--port", "3005"]
