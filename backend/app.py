import os, shutil, subprocess, tempfile, zipfile, threading, time
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

app = FastAPI(title='ClipIA Studio API', version='0.2.0')
app.add_middleware(CORSMiddleware, allow_origins=['*'], allow_methods=['*'], allow_headers=['*'])
ROOT = Path(os.getenv('CLIPIA_OUTPUT_DIR', '/tmp/clipia-output'))
ROOT.mkdir(parents=True, exist_ok=True)
JOBS = {}
LOCK = threading.Lock()
ALLOWED_EXTS = {'.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi'}

@app.get('/')
def home():
    return {'app': 'ClipIA Studio API', 'status': 'ok', 'note': 'MVP: evenly spaced cuts, no AI highlight detection yet.'}

@app.get('/health')
def health():
    return {'status': 'ok', 'ffmpeg': shutil.which('ffmpeg') is not None}

def run_job(job_id, job_dir, source_files, clip_duration, clips_per_video):
    output_files = []
    try:
        with LOCK:
            JOBS[job_id] = {'status': 'processing', 'progress': 5, 'message': 'Preparando vídeos'}
        for index, src in enumerate(source_files):
            probe = subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',str(src)],capture_output=True,text=True)
            if probe.returncode != 0:
                raise RuntimeError(f'No se pudo leer el vídeo {src.name}. Comprueba que sea un archivo de vídeo válido.')
            total = float(probe.stdout.strip() or 0)
            if total < 1:
                continue
            dur = min(float(clip_duration), total)
            max_start = max(0.0, total - dur)
            for j in range(clips_per_video):
                start = (max_start * j / max(1, clips_per_video - 1)) if clips_per_video > 1 else max_start / 2
                dest = job_dir / f'clip_{index+1}_{j+1}.mp4'
                cmd = ['ffmpeg','-hide_banner','-loglevel','error','-y','-ss',f'{start:.3f}','-i',str(src),'-t',f'{dur:.3f}','-vf',"scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,setsar=1,fps=30",'-c:v','libx264','-preset','veryfast','-crf','23','-c:a','aac','-b:a','128k','-movflags','+faststart',str(dest)]
                run = subprocess.run(cmd,capture_output=True,text=True)
                if run.returncode != 0:
                    raise RuntimeError('FFmpeg no pudo procesar el vídeo: ' + run.stderr[-500:])
                output_files.append(dest)
                progress = 10 + int(75 * len(output_files) / max(1, len(source_files) * clips_per_video))
                with LOCK:
                    JOBS[job_id] = {'status':'processing','progress':min(progress, 90),'message':f'Clips creados: {len(output_files)}'}
        if not output_files:
            raise RuntimeError('No se pudieron generar clips válidos.')
        archive = job_dir / 'clipia-clips.zip'
        with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
            for f in output_files:
                z.write(f, f.name)
        with LOCK:
            JOBS[job_id] = {'status':'done','progress':100,'clips_created':len(output_files),'download_url':f'/download/{job_id}','message':'Clips listos para descargar.'}
    except Exception as e:
        with LOCK:
            JOBS[job_id] = {'status':'error','progress':100,'message':str(e)}

@app.post('/process')
async def process(files: list[UploadFile] = File(...), clip_duration: int = Form(20), clips_per_video: int = Form(3)):
    if not files:
        raise HTTPException(400, 'Selecciona al menos un vídeo.')
    if not 3 <= clip_duration <= 180:
        raise HTTPException(400, 'La duración del clip debe estar entre 3 y 180 segundos.')
    if not 1 <= clips_per_video <= 20:
        raise HTTPException(400, 'La cantidad de clips debe estar entre 1 y 20.')
    if not shutil.which('ffmpeg') or not shutil.which('ffprobe'):
        raise HTTPException(500, 'FFmpeg y FFprobe deben estar instalados en el servidor.')
    job_id = 'clipia-' + next(tempfile._get_candidate_names())
    job_dir = ROOT / job_id
    job_dir.mkdir(parents=True, exist_ok=False)
    source_files = []
    try:
        for index, upload in enumerate(files):
            ext = Path(upload.filename or 'input.mp4').suffix.lower()
            if ext not in ALLOWED_EXTS:
                ext = '.mp4'
            src = job_dir / f'input_{index}{ext}'
            with src.open('wb') as out:
                shutil.copyfileobj(upload.file, out)
            source_files.append(src)
        if not source_files:
            raise HTTPException(400, 'No se recibieron vídeos.')
        with LOCK:
            JOBS[job_id] = {'status':'queued','progress':1,'message':'Vídeos recibidos; preparando la generación.'}
        threading.Thread(target=run_job, args=(job_id, job_dir, source_files, clip_duration, clips_per_video), daemon=True).start()
        return {'status':'queued','job_id':job_id,'message':'Vídeos recibidos. La generación continúa en segundo plano.'}
    except HTTPException:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise
    except Exception as e:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise HTTPException(500, 'No se pudieron guardar los vídeos: ' + str(e))

@app.get('/status/{job_id}')
def job_status(job_id: str):
    if not job_id.startswith('clipia-') or '/' in job_id or '..' in job_id:
        raise HTTPException(400, 'Identificador de trabajo inválido.')
    with LOCK:
        job = JOBS.get(job_id)
    if not job:
        raise HTTPException(404, 'No se encontró el trabajo. Puede que el servidor se haya reiniciado; intenta de nuevo.')
    return job

@app.get('/download/{job_id}')
def download(job_id: str):
    if not job_id.startswith('clipia-') or '/' in job_id or '..' in job_id:
        raise HTTPException(400,'Identificador de trabajo inválido')
    archive = ROOT / job_id / 'clipia-clips.zip'
    if not archive.is_file():
        raise HTTPException(404,'El archivo ZIP todavía no está disponible o expiró.')
    return FileResponse(archive, media_type='application/zip', filename='clipia-clips.zip')
