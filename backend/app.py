import os, shutil, subprocess, tempfile, zipfile
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

app = FastAPI(title='ClipIA Studio API', version='0.1.0')
app.add_middleware(CORSMiddleware, allow_origins=['*'], allow_methods=['*'], allow_headers=['*'])
ROOT = Path(os.getenv('CLIPIA_OUTPUT_DIR', '/tmp/clipia-output'))
ROOT.mkdir(parents=True, exist_ok=True)

@app.get('/')
def home():
    return {'app': 'ClipIA Studio API', 'status': 'ok', 'note': 'MVP: evenly spaced cuts, no AI highlight detection yet.'}

@app.get('/health')
def health():
    return {'status': 'ok', 'ffmpeg': shutil.which('ffmpeg') is not None}

@app.post('/process')
async def process(files: list[UploadFile] = File(...), clip_duration: int = Form(20), clips_per_video: int = Form(3)):
    if not files: raise HTTPException(400, 'Upload at least one video.')
    if not 3 <= clip_duration <= 180: raise HTTPException(400, 'clip_duration must be 3..180 seconds')
    if not 1 <= clips_per_video <= 20: raise HTTPException(400, 'clips_per_video must be 1..20')
    if not shutil.which('ffmpeg') or not shutil.which('ffprobe'): raise HTTPException(500, 'FFmpeg and FFprobe must be installed on the server.')
    job = tempfile.mkdtemp(prefix='clipia-', dir=str(ROOT))
    output_files = []
    try:
        for index, upload in enumerate(files):
            ext = Path(upload.filename or 'input.mp4').suffix.lower()
            if ext not in {'.mp4','.mov','.m4v','.webm','.mkv','.avi'}: ext = '.mp4'
            src = Path(job) / f'input_{index}{ext}'
            with src.open('wb') as out: shutil.copyfileobj(upload.file, out)
            probe = subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',str(src)],capture_output=True,text=True)
            if probe.returncode != 0: raise HTTPException(400, f'Could not read video {upload.filename}')
            total = float(probe.stdout.strip() or 0)
            if total < 1: continue
            dur = min(float(clip_duration), total)
            # Space clips through the source. For long videos, avoid always selecting only the opening.
            max_start = max(0.0, total - dur)
            for j in range(clips_per_video):
                start = (max_start * j / max(1, clips_per_video - 1)) if clips_per_video > 1 else max_start / 2
                dest = Path(job) / f'clip_{index+1}_{j+1}.mp4'
                cmd = ['ffmpeg','-hide_banner','-loglevel','error','-y','-ss',f'{start:.3f}','-i',str(src),'-t',f'{dur:.3f}','-vf',"scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,setsar=1,fps=30",'-c:v','libx264','-preset','veryfast','-crf','23','-c:a','aac','-b:a','128k','-movflags','+faststart',str(dest)]
                run = subprocess.run(cmd,capture_output=True,text=True)
                if run.returncode != 0: raise HTTPException(500, 'FFmpeg failed: '+run.stderr[-700:])
                output_files.append(dest)
        if not output_files: raise HTTPException(400, 'No valid clips could be generated.')
        archive = Path(job) / 'clipia-clips.zip'
        with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
            for f in output_files: z.write(f, f.name)
        # Keep generated output in the job directory; returned URL is valid only while the server retains it.
        return {'status':'done','clips_created':len(output_files),'download_url':f'/download/{Path(job).name}','message':'Clips are evenly spaced; automatic highlight detection is not included yet.'}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))

@app.get('/download/{job_id}')
def download(job_id: str):
    if not job_id.startswith('clipia-') or '/' in job_id or '..' in job_id: raise HTTPException(400,'Invalid job id')
    archive = ROOT / job_id / 'clipia-clips.zip'
    if not archive.is_file(): raise HTTPException(404,'Output not found or expired')
    return FileResponse(archive, media_type='application/zip', filename='clipia-clips.zip')
