# ClipIA Studio — MVP inicial

Aplicación móvil Expo/React Native para seleccionar varios vídeos y enviarlos a una API que genera clips verticales MP4.

## Estado honesto
- Este paquete contiene un prototipo de código, no un APK compilado.
- El móvil necesita conexión a un servidor backend con FFmpeg.
- Los cortes iniciales se distribuyen a lo largo del vídeo; todavía no detectan automáticamente los mejores momentos con IA.

## Estructura
- `mobile/`: aplicación Expo para Android.
- `backend/`: API FastAPI que recibe vídeos y genera clips 9:16 usando FFmpeg.

## Backend (Python 3.11+ y FFmpeg instalado)
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000
```
En el móvil configura la URL accesible del servidor en el campo “Servidor API”. No uses `localhost` desde un teléfono físico.

## App móvil
```bash
cd mobile
npm install
npx expo start
```
Para crear un APK posteriormente, configura EAS Build y ejecuta `eas build -p android --profile preview`. No se incluye APK en este ZIP.
