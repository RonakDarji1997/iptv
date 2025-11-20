# Docker Deployment

This project is containerized to run both the Expo React Native web app and the Next.js backend on a single port (2005).

## Prerequisites

- Docker
- Docker Compose

## How to Run

1.  Build and start the container:
    ```bash
    docker-compose up --build -d
    ```

2.  Access the application at:
    `http://localhost:2005`

## Configuration

The `docker-compose.yml` file uses the following environment variables:
- `NEXT_PUBLIC_STALKER_BEARER`
- `NEXT_PUBLIC_STALKER_ADID`
- `NEXT_PUBLIC_APP_PASSWORD_HASH`

Make sure these are set in your environment or a `.env` file.

## Architecture

- **Frontend**: Expo React Native (Web) built and exported as static files.
- **Backend**: Next.js serving the static files and providing the API proxy.
- **Port**: The container exposes port 2005.
