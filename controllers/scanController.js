import { useState, useRef, useEffect } from 'react';
import { Camera, Upload, X, RotateCcw, CheckCircle2, Loader2, Car, WifiOff } from 'lucide-react';
import { Btn } from './UI';
import { useApp } from '../context/useAppState';
import { TRANSLATIONS } from '../translations';

/* ===========================================
   HELPER: base64 → File (pour FormData)
   =========================================== */
function base64ToFile(base64, filename = 'scan.jpg') {
  const [meta, data] = base64.split(',');
  const mime = meta.match(/:(.*?);/)[1];
  const bytes = atob(data);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new File([arr], filename, { type: mime });
}

/* ===========================================
   OCR PROCESSING ENGINE (appel API)
   =========================================== */
function OcrProcessing({ image, mode, onDone, t }) {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState(t.google_analysis);

  useEffect(() => {
    let isMounted = true;

    const runBackendOCR = async () => {
      try {
        setStatus(t.google_analysis);
        setProgress(30);

        const token = localStorage.getItem('token');
        const baseUrl = import.meta.env.VITE_API_URL || 'https://noregisbackend.onrender.com';

        // Conversion base64 → File (important : le backend attend un champ 'image')
        const imageFile = base64ToFile(image, 'scan.jpg');

        const formData = new FormData();
        formData.append('image', imageFile);   // 🔥 clé 'image' correspond à upload.single('image')
        formData.append('mode', mode);

        const response = await fetch(`${baseUrl}/api/scan`, {
          method: 'POST',
          headers: {
            'Authorization': token ? `Bearer ${token}` : ''
          },
          body: formData,
        });

        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}));
          console.error('Détails erreur Backend Scan:', errorBody);
          throw new Error(`Erreur Scan: ${errorBody.message || response.statusText}`);
        }

        setProgress(70);
        const result = await response.json();

        if (!isMounted) return;

        if (!result.infosExtraites) {
          throw new Error(t.no_text);
        }

        setStatus(t.extracting);
        setProgress(100);

        // Nettoie les données : ne garde que les champs primitifs
        const dataBrute = result.infosExtraites;
        const champsAfficheables = {};
        for (const [key, value] of Object.entries(dataBrute)) {
          if (typeof value !== 'object' || value === null) {
            champsAfficheables[key] = value;
          }
        }
        onDone(champsAfficheables);

      } catch (err) {
        console.error('Scan Error:', err);
        onDone({ error: t.cloud_fail });
      }
    };

    runBackendOCR();
    return () => { isMounted = false; };
  }, [image, mode, onDone, t]);

  return (
    <div className="flex flex-col items-center justify-center h-full gap-8 p-8 text-center bg-slate-50/50 dark:bg-slate-900/50">
      <div className="relative">
        <img src={image} alt="doc" className="w-52 h-32 object-cover rounded-xl border-2 border-brand-blue-bright/30 blur-[1px] opacity-40 shadow-2xl" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-14 h-14 rounded-2xl bg-white dark:bg-slate-900 shadow-xl flex items-center justify-center">
            <Loader2 size={28} className="animate-spin text-brand-blue-bright" />
          </div>
        </div>
      </div>
      <div className="space-y-3">
        <p className="text-base font-black text-slate-900 dark:text-white uppercase tracking-tight">{t.analysis}</p>
        <div className="w-48 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mx-auto">
          <div className="h-full bg-brand-blue-bright transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
        <p className="text-[10px] font-black text-brand-blue-bright uppercase animate-pulse tracking-widest">{status}</p>
      </div>
    </div>
  );
}

/* ===========================================
   SCANNER (Camera Live) - AMÉLIORÉ
   =========================================== */
function LiveCamera({ onCapture, onClose, t }) {
  const videoRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return t.camera_unsupported;
    }
    return null;
  });

  useEffect(() => {
    let localStream = null;
    if (error) return;

    const startCamera = async (facing) => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        localStream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          setReady(true);
        }
      } catch (err) {
        console.error(err);
        if (facing === 'environment') {
          startCamera('user');
        } else {
          setError(`${t.camera_error} : ${err.name === 'NotAllowedError' ? t.permission_denied : t.unavailable}`);
        }
      }
    };

    startCamera('environment');

    return () => {
      if (localStream) localStream.getTracks().forEach(track => track.stop());
    };
  }, [error]);

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    // Dimensions max 1200px pour éviter les fichiers trop lourds
    const MAX_WIDTH = 1200;
    let width = video.videoWidth;
    let height = video.videoHeight;

    if (width > MAX_WIDTH) {
      height = Math.round((height * MAX_WIDTH) / width);
      width = MAX_WIDTH;
    }
    if (height > MAX_WIDTH) {
      width = Math.round((width * MAX_WIDTH) / height);
      height = MAX_WIDTH;
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, width, height);

    // Qualité 0.85 (bonne netteté pour l'OCR)
    const imageDataUrl = canvas.toDataURL('image/jpeg', 0.85);
    onCapture(imageDataUrl);
  };

  return (
    <div className="flex flex-col h-full bg-black">
      <div className="flex-1 relative overflow-hidden">
        {!ready && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-slate-400">
            <Loader2 size={40} className="animate-spin text-brand-blue-bright" />
            <span className="text-[10px] font-black uppercase tracking-widest">...</span>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center bg-slate-900">
            <WifiOff size={40} className="text-brand-red-bright" />
            <p className="text-sm font-black text-white uppercase tracking-tight leading-tight">{error}</p>
            <button onClick={onClose} className="mt-4 px-6 py-2 bg-white/10 text-white rounded-lg text-[10px] font-black uppercase">{t.close}</button>
          </div>
        )}
        <video ref={videoRef} autoPlay playsInline muted className={`w-full h-full object-cover ${ready ? 'opacity-100' : 'opacity-0'}`} />
        <div className="absolute inset-0 flex items-center justify-center p-8 pointer-events-none">
          <div className="relative w-full aspect-[1.6] max-w-sm border-2 border-white/20 rounded-2xl">
            <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-brand-blue-bright rounded-tl-xl" />
            <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-brand-blue-bright rounded-tr-xl" />
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-brand-blue-bright rounded-bl-xl" />
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-brand-blue-bright rounded-br-xl" />
          </div>
        </div>
      </div>
      <div className="p-8 bg-slate-900 flex items-center justify-center gap-10">
        <button onClick={onClose} className="w-12 h-12 rounded-full bg-white/10 text-white flex items-center justify-center"><X size={24} /></button>
        <button onClick={capture} disabled={!ready} className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center active:scale-95 transition-transform">
          <div className="w-14 h-14 rounded-full bg-white" />
        </button>
        <div className="w-12 h-12" />
      </div>
    </div>
  );
}

/* ===========================================
   SCAN PANEL (Main Entry)
   =========================================== */
export function ScanPanel({ mode = 'person', onDataExtracted, onClose }) {
  const { state } = useApp();
  const t = TRANSLATIONS[state.settings?.language || 'fr'];
  const [phase, setPhase] = useState('choose');
  const [capturedImage, setCapturedImage] = useState(null);
  const [ocrData, setOcrData] = useState(null);
  const fileRef = useRef(null);

  const handleOcrDone = (data) => {
    setOcrData(data);
    setPhase('done');
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => { setCapturedImage(reader.result); setPhase('ocr'); };
    reader.readAsDataURL(file);
  };

  const getFieldLabel = (key, t) => {
    const labels = {
      nom: 'Nom',
      prenom: 'Prénom',
      numeroPiece: 'N° Pièce',
      dateNaissance: 'Date de naissance',
      dateExpiration: 'Date d\'expiration',
      sexe: 'Sexe',
      nationalite: 'Nationalité',
      typePiece: 'Type de pièce',
      paysEmission: 'Pays d\'émission',
      adresse: 'Adresse',
      mrz: 'MRZ',
    };
    return labels[key] || key;
  };

  const isAr = state.settings?.language === 'ar';

  return (
    <div className="flex flex-col h-full min-h-[520px] bg-white dark:bg-slate-900 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="p-4 border-b border-slate-50 dark:border-slate-800 flex items-center gap-4 bg-slate-50/50 dark:bg-slate-900/50">
        <div className="w-10 h-10 rounded-lg bg-brand-blue-light text-brand-blue-bright flex items-center justify-center">
          {mode === 'vehicule' ? <Car size={20} /> : <Camera size={20} />}
        </div>
        <div>
          <h2 className="text-base font-black text-slate-900 dark:text-white leading-none">{t.scanning}</h2>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter mt-1.5">{mode === 'vehicule' ? t.license_plate : t.id_card}</p>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {phase === 'choose' && (
          <div className="p-8 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-300">
            <p className="text-center text-slate-500 text-[11px] font-extrabold uppercase tracking-widest mb-2">{t.scan_method}</p>
            <button onClick={() => setPhase('camera')} className="group flex items-center gap-4 p-4 rounded-xl border-2 border-brand-blue-bright/10 bg-brand-blue-light/10 hover:border-brand-blue-bright/30 transition-all text-left">
              <div className="w-10 h-10 rounded-lg bg-brand-blue-bright text-white flex items-center justify-center shrink-0"><Camera size={20} /></div>
              <div className="flex-1">
                <p className="font-black text-sm text-slate-900 dark:text-white">{t.live_camera}</p>
                <p className="text-[9px] font-bold text-brand-blue-bright uppercase tracking-tighter mt-1">{t.scan_id_desc}</p>
              </div>
            </button>
            <button onClick={() => fileRef.current?.click()} className="group flex items-center gap-4 p-4 rounded-xl border-2 border-slate-100 dark:border-slate-800 hover:border-slate-300 transition-all text-left">
              <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center shrink-0"><Upload size={20} /></div>
              <div className="flex-1">
                <p className="font-black text-sm text-slate-900 dark:text-white">{t.import_file}</p>
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter mt-1">{t.scan_id_desc}</p>
              </div>
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleFileUpload} />
            <button onClick={onClose} className="mt-6 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-[10px] font-black text-slate-400 uppercase tracking-widest active:scale-95 transition-all">{t.cancel}</button>
          </div>
        )}

        {phase === 'camera' && (
          <LiveCamera
            onCapture={(img) => { setCapturedImage(img); setPhase('ocr'); }}
            onClose={() => setPhase('choose')}
            t={t}
          />
        )}
        
        {phase === 'ocr' && <OcrProcessing image={capturedImage} mode={mode} onDone={handleOcrDone} t={t} />}

        {phase === 'done' && ocrData && (
          <div className="p-6 flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="relative rounded-lg overflow-hidden border-2 border-brand-green-bright">
              <img src={capturedImage} alt="Capture" className="w-full h-32 object-cover" />
              <div className="absolute top-2 right-2 bg-brand-green-bright text-white px-2 py-1 rounded text-[9px] font-black uppercase tracking-tighter">{t.capture_valid}</div>
            </div>
            
            <div className="bg-brand-green-light/10 dark:bg-brand-green-bright/5 rounded-xl p-4 border border-brand-green-bright/20">
              <p className="text-[9px] font-black text-brand-green-bright uppercase tracking-widest mb-3 flex items-center gap-2">{t.extraction_done}</p>
              <div className="space-y-2">
                {Object.entries(ocrData)
                  .filter(([key, value]) => typeof value !== 'object' || value === null)
                  .map(([key, value]) => (
                    <div key={key} className="flex justify-between items-center gap-4 pb-2 border-b border-brand-green-bright/5 last:border-0 last:pb-0">
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">
                        {getFieldLabel(key, t)}
                      </span>
                      <span className={`text-xs font-black text-slate-900 dark:text-white ${isAr ? 'text-left' : 'text-right'}`}>
                        {value || '—'}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
            
            <div className="flex gap-3">
              <Btn variant="secondary" icon={RotateCcw} onClick={() => setPhase('choose')} fullWidth>{t.restart}</Btn>
              <Btn variant="success" icon={CheckCircle2} onClick={() => onDataExtracted(ocrData, capturedImage)} fullWidth>{t.validate_data}</Btn>
            </div>
          </div>
        )}
        
        {phase === 'done' && ocrData?.error && (
          <div className="p-6 flex flex-col gap-4 animate-in fade-in duration-500">
            <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4 border border-red-200 dark:border-red-800/50 text-center">
              <WifiOff size={32} className="text-red-500 mx-auto mb-3" />
              <p className="text-sm font-bold text-red-600 dark:text-red-400">{ocrData.error}</p>
              <Btn variant="secondary" icon={RotateCcw} onClick={() => setPhase('choose')} className="mt-4">{t.restart}</Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}    