FROM node:20-alpine AS base

# 1. Build Expo App
FROM base AS expo-builder
WORKDIR /app/expo-rn

# Accept build arguments for Expo public environment variables
ARG EXPO_PUBLIC_STALKER_BEARER
ARG EXPO_PUBLIC_STALKER_ADID
ARG EXPO_PUBLIC_APP_PASSWORD_HASH

# Set as environment variables for the Expo build
ENV EXPO_PUBLIC_STALKER_BEARER=$EXPO_PUBLIC_STALKER_BEARER
ENV EXPO_PUBLIC_STALKER_ADID=$EXPO_PUBLIC_STALKER_ADID
ENV EXPO_PUBLIC_APP_PASSWORD_HASH=$EXPO_PUBLIC_APP_PASSWORD_HASH

COPY expo-rn/package.json expo-rn/package-lock.json ./
RUN npm ci
COPY expo-rn/ .
# The script "export:web" outputs to ../web-dist, which will be /app/web-dist
RUN npm run export:web

# 2. Install Next.js Dependencies
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* ./
RUN npm ci --legacy-peer-deps

# 3. Build Next.js App
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Copy Expo build artifacts to public folder
# The expo-builder created /app/web-dist
COPY --from=expo-builder /app/web-dist ./public

# Accept build arguments for Next.js public environment variables
ARG NEXT_PUBLIC_STALKER_MAC
ARG NEXT_PUBLIC_STALKER_URL
ARG NEXT_PUBLIC_STALKER_BEARER
ARG NEXT_PUBLIC_STALKER_ADID
ARG NEXT_PUBLIC_APP_PASSWORD_HASH

# Set as environment variables for the build
ENV NEXT_PUBLIC_STALKER_MAC=$NEXT_PUBLIC_STALKER_MAC
ENV NEXT_PUBLIC_STALKER_URL=$NEXT_PUBLIC_STALKER_URL
ENV NEXT_PUBLIC_STALKER_BEARER=$NEXT_PUBLIC_STALKER_BEARER
ENV NEXT_PUBLIC_STALKER_ADID=$NEXT_PUBLIC_STALKER_ADID
ENV NEXT_PUBLIC_APP_PASSWORD_HASH=$NEXT_PUBLIC_APP_PASSWORD_HASH

# Build the application
RUN npm run build

# 4. Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=2005
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy the standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

USER nextjs

EXPOSE 2005

CMD ["node", "server.js"]
