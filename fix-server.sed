/^function startPythonService() {$/,/^}$/ {
  /^function startPythonService() {$/ {
    n
    c\
  console.log('🚀 Connecting to Python Whisper service at localhost:8771...');\
  \
  // Use fetch to check if Python service is available\
  fetch('http://localhost:8771/health')\
    .then(response => {\
      if (response.ok) {\
        pythonServiceReady = true;\
        console.log('✅ Python Whisper service connected!');\
      } else {\
        throw new Error('Service not ready');\
      }\
    })\
    .catch(error => {\
      console.log('⚠️  Python Whisper service not available, retrying in 5s...');\
      pythonServiceReady = false;\
      setTimeout(startPythonService, 5000);\
    });
    :a
    n
    /^}$/!ba
  }
}
