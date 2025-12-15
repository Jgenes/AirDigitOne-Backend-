# Base image
FROM node:20-alpine

# Set working directory
WORKDIR /usr/src/app

# Copy package.json and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy app code
COPY . .

# Expose port
EXPOSE 4001

# Start service
CMD ["node", "src/server.js"]
