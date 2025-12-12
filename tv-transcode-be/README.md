# tv-transcode-be

Simple transcode backend used by the Android TV app to downscale 4K streams to 1080p and optionally upscale low-resolution streams to 1080p.

Quick start (local):

1. Install dependencies and start:

```bash
cd tv-transcode-be
npm install
npm start
```

2. Docker:

```bash
docker build -t tv-transcode-be .
docker run -p 4000:4000 tv-transcode-be
```

API:
- `GET /health` - returns 200 and ffmpeg availability
- `GET /transcode?url=<url>&target=1080&mode=downscale|upscale` - returns a proxied MPEG-TS stream transcoded by ffmpeg

Notes:
- This example uses `ffmpeg` and streams MPEG-TS (`video/MP2T`) to the client. For production use, consider HLS or DASH and robust caching.
