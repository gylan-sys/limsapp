import React, { useState, useEffect } from 'react';
import { 
  ClipboardList, 
  MapPin, 
  Calendar, 
  Search,
  CheckCircle2,
  Clock,
  ArrowRight,
  Package,
  Scan,
  AlertCircle,
  Hash,
  ThermometerSnowflake,
  ShieldCheck,
  UserCheck,
  Info,
  X
} from 'lucide-react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  updateDoc,
  Timestamp,
  addDoc,
  getDocs
} from 'firebase/firestore';
import { db } from '../firebase';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';
import { Html5QrcodeScanner } from 'html5-qrcode';

interface LabLoginDashboardProps {
  user: any;
  onNotify: (title: string, message: string, type: 'success' | 'info' | 'error') => void;
}

interface Sample {
  id: string;
  jobId: string;
  sampleName: string;
  type: string;
  status: string;
  chillerLocation?: string;
  verifiedAt?: any;
  verifiedBy?: string;
}

const LabLoginDashboard: React.FC<LabLoginDashboardProps> = ({ user, onNotify }) => {
  const [submittedJobs, setSubmittedJobs] = useState<any[]>([]);
  const [selectedJob, setSelectedJob] = useState<any | null>(null);
  const [jobSamples, setJobSamples] = useState<Sample[]>([]);
  const [loading, setLoading] = useState(true);
  const [verificationData, setVerificationData] = useState<{ [key: string]: { chiller: string, labType: string, verified: boolean } }>({});
  const [showScanner, setShowScanner] = useState(false);
  const [fastScanInput, setFastScanInput] = useState('');
  const [chillerStats, setChillerStats] = useState<{ [key: string]: number }>({});

  useEffect(() => {
    // Live monitoring of all samples in chillers
    const q = query(collection(db, 'app_samples'), where('status', 'in', ['VERIFIED', 'IN_PROGRESS', 'NEEDS_QC']));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const stats: { [key: string]: number } = {};
      snapshot.docs.forEach(doc => {
        const loc = doc.data().chillerLocation;
        if (loc) stats[loc] = (stats[loc] || 0) + 1;
      });
      setChillerStats(stats);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (showScanner) {
      const scanner = new Html5QrcodeScanner(
        "login-reader",
        { fps: 10, qrbox: { width: 250, height: 250 } },
        false
      );

      scanner.render((decodedText) => {
        handleScanSuccess(decodedText);
        scanner.clear();
        setShowScanner(false);
      }, (error) => {
        // scan error
      });

      return () => {
        scanner.clear();
      };
    }
  }, [showScanner]);

  const handleScanSuccess = async (qrData: string) => {
    try {
      // Find sample by QR Code globally
      const q = query(collection(db, 'app_samples'), where('qrCode', '==', qrData));
      const snap = await getDocs(q);
      
      if (snap.empty) {
        onNotify('Info', 'Label QR tidak ditemukan di database.', 'info');
        return;
      }
      
      const sampleDoc = snap.docs[0];
      const sampleData = sampleDoc.data();
      
      // Find the associated job details
      const jobSnap = await getDocs(query(collection(db, 'sampling_jobs'), where('__name__', '==', sampleData.jobId)));
      
      if (!jobSnap.empty) {
        const jobDoc = jobSnap.docs[0];
        const jobData: any = { id: jobDoc.id, ...jobDoc.data() };
        setSelectedJob(jobData);
        onNotify('Berhasil', `Sampel ${sampleData.sampleName} ditemukan dari STPS ${jobData.stpsNumber || 'N/A'}.`, 'success');
        
        // Use a timeout to allow the samples list to render before scrolling
        setTimeout(() => {
          const element = document.getElementById(`sample-card-${sampleDoc.id}`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element.classList.add('ring-2', 'ring-blue-500', 'ring-offset-4');
            setTimeout(() => element.classList.remove('ring-2', 'ring-blue-500', 'ring-offset-4'), 3000);
          }
        }, 500);
      }
    } catch (error) {
      onNotify('Error', 'Gagal memproses hasil scan.', 'error');
    }
  };

  useEffect(() => {
    // Listen for jobs submitted by sampling officers
    const q = query(
      collection(db, 'sampling_jobs'),
      where('status', 'in', ['SUBMITTED', 'RECEIVED'])
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSubmittedJobs(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!selectedJob) return;

    const q = query(
      collection(db, 'app_samples'),
      where('jobId', '==', selectedJob.id)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const samples = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Sample));
      setJobSamples(samples);
      
      // Initialize verification local state
      const initial: any = {};
      samples.forEach(s => {
        initial[s.id] = { 
          chiller: s.chillerLocation || '',
          labType: (s as any).labType || (s as any).type || '', 
          verified: s.status !== 'PENDING' 
        };
      });
      setVerificationData(initial);
    });

    return () => unsubscribe();
  }, [selectedJob]);

  const handleVerifySample = async (sampleId: string) => {
    const data = verificationData[sampleId];
    if (!data.chiller) {
      onNotify('Info', 'Mohon tentukan lokasi chiller terlebih dahulu', 'info');
      return;
    }
    if (!data.labType) {
      onNotify('Info', 'Mohon tentukan tujuan Lab terlebih dahulu', 'info');
      return;
    }

    try {
      await updateDoc(doc(db, 'app_samples', sampleId), {
        status: 'VERIFIED',
        chillerLocation: data.chiller,
        labType: data.labType,
        verifiedAt: Timestamp.now(),
        verifiedBy: user.uid
      });

      // Notify Analysts of specific lab and chiller
      await addDoc(collection(db, 'notifications'), {
        recipientId: `analysts_${data.labType}`, // Can target by lab type if needed
        title: 'Sampel Masuk Chiller',
        message: `Sampel ${jobSamples.find(s => s.id === sampleId)?.sampleName} telah masuk di Chiller ${data.chiller} (Lab ${data.labType.toUpperCase()})`,
        type: 'info',
        read: false,
        createdAt: Timestamp.now()
      });
      
      onNotify('Berhasil', 'Sampel telah diverifikasi dan notifikasi dikirim ke Analis', 'success');
    } catch (error) {
      onNotify('Gagal', 'Gagal memverifikasi sampel', 'error');
    }
  };

  const handleCompleteJobReception = async () => {
    if (!selectedJob) return;
    
    const allVerified = jobSamples.every(s => 
      jobSamples.length > 0 && (verificationData[s.id]?.verified || s.status !== 'PENDING')
    );

    if (!allVerified) {
      onNotify('Peringatan', 'Semua sampel dalam penugasan ini harus diverifikasi terlebih dahulu', 'error');
      return;
    }

    try {
      await updateDoc(doc(db, 'sampling_jobs', selectedJob.id), {
        status: 'RECEIVED',
        receivedAt: Timestamp.now(),
        receivedBy: user.uid
      });

      // Notify Analysts
      await addDoc(collection(db, 'notifications'), {
        recipientId: 'system_analysts',
        title: 'Sampel Baru Tersedia',
        message: `Sampel dari ${selectedJob.customerName} telah diverifikasi dan siap dianalisis.`,
        type: 'success',
        read: false,
        createdAt: Timestamp.now()
      });

      setSelectedJob(null);
      onNotify('Selesai', 'Seluruh sampel telah diterima dan diteruskan ke analis', 'success');
    } catch (error) {
      onNotify('Gagal', 'Gagal menyelesaikan penerimaan', 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-blue-600">
        <Clock className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 leading-tight">Dashboard Team Login Lab</h1>
          <p className="text-slate-500">Penerimaan, verifikasi sampel fisik, alokasi chiller, dan plotting ke laboratorium tujuan.</p>
        </div>
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative">
            <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text"
              placeholder="Fast Scan ID (Tembak Barcode)..."
              value={fastScanInput}
              onChange={(e) => setFastScanInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && fastScanInput.trim()) {
                  handleScanSuccess(fastScanInput.trim());
                  setFastScanInput('');
                }
              }}
              className="pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20 w-full md:w-64 placeholder:text-slate-300"
            />
            {fastScanInput && (
               <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                 <span className="text-[8px] font-black text-slate-300 uppercase tracking-tighter">Enter to process</span>
                 <div className="w-4 h-4 rounded bg-slate-100 flex items-center justify-center">
                    <ArrowRight className="w-2 h-2 text-slate-400" />
                 </div>
               </div>
            )}
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => setShowScanner(true)}
              className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-black uppercase tracking-widest flex items-center gap-2 hover:bg-slate-800 shadow-lg shadow-slate-500/20 transition-all shrink-0"
            >
              <Scan className="w-4 h-4" />
              Scan
            </button>
            <div className="px-4 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm font-bold border border-blue-100 flex items-center gap-2 whitespace-nowrap">
              <Scan className="w-4 h-4" />
              {submittedJobs.length} Pengiriman
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Submitted Jobs List */}
        <div className="lg:col-span-1 space-y-6">
          {/* Chiller Inventory Map */}
          <div className="bg-slate-900 rounded-[32px] p-6 shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full -mr-16 -mt-16 blur-3xl group-hover:bg-blue-500/20 transition-all" />
            <h2 className="text-xs font-black text-blue-400 uppercase tracking-widest flex items-center gap-2 mb-4">
              <ThermometerSnowflake className="w-4 h-4" /> Status Kapasitas Chiller
            </h2>
            <div className="space-y-3">
              {['C-01', 'C-02'].map((id) => {
                const count = chillerStats[id] || 0;
                const capacity = 50; // Increased capacity for fewer chillers
                const percent = Math.min((count / capacity) * 100, 100);
                
                return (
                  <div key={id} className="space-y-1.5">
                    <div className="flex justify-between items-end">
                       <span className="text-[10px] font-black text-white uppercase tracking-tighter">Loc: {id}</span>
                       <span className="text-[9px] font-mono text-slate-400">{count}/{capacity} Samples</span>
                    </div>
                    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                       <motion.div 
                         initial={{ width: 0 }}
                         animate={{ width: `${percent}%` }}
                         className={cn(
                           "h-full transition-all duration-1000",
                           percent > 85 ? "bg-rose-500" : percent > 50 ? "bg-amber-500" : "bg-blue-500"
                         )}
                       />
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-4 text-[8px] text-slate-500 font-bold uppercase tracking-widest italic flex items-center gap-1">
               <Info className="w-2 h-2" /> Live monitoring for storage allocation
            </p>
          </div>

          <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <ClipboardList className="w-4 h-4" /> Antrian Pengiriman
          </h2>
          <div className="space-y-3">
            {submittedJobs.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-xl border border-dashed border-slate-300">
                <p className="text-slate-400 text-sm italic underline underline-offset-4 decoration-slate-200">Tidak ada pengiriman sampel saat ini.</p>
              </div>
            ) : (
              submittedJobs.map(job => (
                <motion.button
                  key={job.id}
                  layoutId={job.id}
                  onClick={() => setSelectedJob(job)}
                  className={cn(
                    "w-full text-left p-5 rounded-2xl border transition-all duration-300 relative group overflow-hidden",
                    selectedJob?.id === job.id 
                      ? "bg-white border-blue-500 shadow-xl ring-2 ring-blue-500/20" 
                      : "bg-white border-slate-200 hover:border-blue-300 hover:translate-x-1"
                  )}
                >
                  {selectedJob?.id === job.id && (
                    <div className="absolute top-0 right-0 w-12 h-12 bg-blue-500/10 rounded-bl-full flex items-center justify-center">
                      <ArrowRight className="w-4 h-4 text-blue-500" />
                    </div>
                  )}
                  <div className="flex justify-between items-start mb-3">
                    <span className={cn(
                      "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-tighter",
                      job.status === 'SUBMITTED' ? "bg-amber-100 text-amber-700 border border-amber-200" : "bg-blue-100 text-blue-700 border border-blue-200"
                    )}>
                      {job.status === 'SUBMITTED' ? 'Menunggu Verif' : 'Sedang Diproses'}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono font-bold bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                      {job.stpsNumber || 'STPS-TEMP'}
                    </span>
                  </div>
                  <h3 className="font-black text-slate-900 group-hover:text-blue-600 transition-colors uppercase leading-tight truncate pr-8">
                    {job.customerName}
                  </h3>
                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase">
                      <MapPin className="w-3.5 h-3.5 text-slate-300" /> {job.location}
                    </div>
                    <div className="text-[10px] font-mono text-slate-400">
                      {job.submittedAt ? new Date(job.submittedAt.seconds * 1000).toLocaleTimeString() : '-'}
                    </div>
                  </div>
                </motion.button>
              ))
            )}
          </div>
        </div>

        {/* Job Verification & Samples */}
        <div className="lg:col-span-2">
          <AnimatePresence mode="wait">
            {selectedJob ? (
              <motion.div
                key="verification"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden"
              >
                <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2 py-0.5 bg-blue-600 text-white text-[9px] font-black rounded uppercase tracking-widest">Job Entry</span>
                      <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">{selectedJob.customerName}</h2>
                    </div>
                    <div className="flex items-center gap-4 text-xs font-bold text-slate-500">
                      <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> {selectedJob.location}</span>
                      <span className="flex items-center gap-1.5"><UserCheck className="w-3.5 h-3.5" /> Petugas: {selectedJob.assignedToName || 'Sampling Team'}</span>
                    </div>
                  </div>
                  <button 
                    onClick={() => setSelectedJob(null)}
                    className="p-3 bg-white border border-slate-200 hover:bg-slate-100 text-slate-400 rounded-2xl transition-all shadow-sm flex items-center gap-2 font-bold text-xs"
                  >
                    Tutup <ArrowRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-8">
                  <div className="mb-8 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl">
                      <p className="text-[10px] font-black text-emerald-600 uppercase mb-1">Suhu Lapangan</p>
                      <p className="text-xl font-black text-emerald-900">{selectedJob.fieldData?.temperature || '-'} °C</p>
                    </div>
                    <div className="p-4 bg-sky-50 border border-sky-100 rounded-2xl">
                      <p className="text-[10px] font-black text-sky-600 uppercase mb-1">Kelembaban</p>
                      <p className="text-xl font-black text-sky-900">{selectedJob.fieldData?.humidity || '-'} %</p>
                    </div>
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                      <p className="text-[10px] font-black text-slate-500 uppercase mb-1">Status Log</p>
                      <p className="text-xl font-black text-slate-900 uppercase">{selectedJob.status}</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                       <Hash className="w-4 h-4" /> Verifikasi Botol Sampel ({jobSamples.length})
                    </h3>
                    
                    <div className="grid grid-cols-1 gap-4">
                      {jobSamples.length === 0 ? (
                        <div className="p-12 text-center border-2 border-dashed border-slate-100 rounded-3xl text-slate-300">
                           Tidak ada data sampel ditemukan
                        </div>
                      ) : (
                        jobSamples.map((sample) => (
                          <div 
                            key={sample.id}
                            id={`sample-card-${sample.id}`}
                            className={cn(
                              "p-5 rounded-2xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-6",
                              sample.status === 'VERIFIED' ? "bg-emerald-50/30 border-emerald-200" : "bg-white border-slate-200 shadow-sm"
                            )}
                          >
                            <div className="flex items-center gap-4">
                               <div className={cn(
                                 "w-12 h-12 rounded-xl flex items-center justify-center shrink-0",
                                 sample.status === 'VERIFIED' ? "bg-emerald-100 text-emerald-600" : "bg-blue-100 text-blue-600"
                               )}>
                                 <Package className="w-6 h-6" />
                               </div>
                               <div>
                                 <h4 className="font-black text-slate-900 uppercase tracking-tight">{sample.sampleName}</h4>
                                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{sample.type}</p>
                               </div>
                            </div>

                            <div className="flex-1 flex flex-col md:flex-row items-center gap-4">
                              <div className="w-full md:w-auto">
                                <select
                                  disabled={sample.status !== 'PENDING'}
                                  value={verificationData[sample.id]?.chiller || ''}
                                  onChange={(e) => setVerificationData({...verificationData, [sample.id]: { ...verificationData[sample.id], chiller: e.target.value }})}
                                  className="w-full md:w-40 px-4 py-2 text-sm font-bold rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white cursor-pointer"
                                >
                                  <option value="">Pilih Chiller...</option>
                                  <option value="C-01">Chiller C-01</option>
                                  <option value="C-02">Chiller C-02</option>
                                </select>
                              </div>

                              <div className="w-full md:w-auto">
                                <select
                                  disabled={sample.status !== 'PENDING'}
                                  value={verificationData[sample.id]?.labType || ''}
                                  onChange={(e) => setVerificationData({...verificationData, [sample.id]: { ...verificationData[sample.id], labType: e.target.value }})}
                                  className="w-full md:w-40 px-4 py-2 text-sm font-bold rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white cursor-pointer"
                                >
                                  <option value="">Plot ke Lab...</option>
                                  <option value="udara">Lab Udara</option>
                                  <option value="air">Lab Air</option>
                                  <option value="b3_tanah">Lab B3 & Tanah</option>
                                  <option value="mikrobiologi">Lab Mikro</option>
                                </select>
                              </div>
                              
                              {sample.status === 'PENDING' ? (
                                <button
                                  onClick={() => handleVerifySample(sample.id)}
                                  className="w-full md:w-auto px-6 py-2 bg-blue-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2"
                                >
                                  Verifikasi
                                </button>
                              ) : (
                                <div className="flex items-center gap-2 text-emerald-600 font-black text-[10px] uppercase tracking-widest bg-emerald-100 px-3 py-2 rounded-xl border border-emerald-200">
                                  <ShieldCheck className="w-4 h-4" /> Terverifikasi
                                </div>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="mt-12 pt-8 border-t border-slate-100 flex justify-end">
                    <button
                      onClick={handleCompleteJobReception}
                      disabled={jobSamples.length === 0}
                      className="px-10 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-slate-800 shadow-2xl transition-all flex items-center gap-3 disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" /> Selesaikan Penerimaan
                    </button>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="empty-login"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="h-[500px] flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 rounded-[40px] bg-slate-50/30"
              >
                <div className="w-24 h-24 bg-white rounded-3xl flex items-center justify-center shadow-xl mb-6 transform rotate-3">
                  <Scan className="w-12 h-12 text-slate-200" />
                </div>
                <h3 className="text-xl font-black text-slate-600 uppercase tracking-tight">Menunggu Pengiriman</h3>
                <p className="text-slate-400 max-w-xs text-center mt-2 text-sm">Pilih data dari panel samping untuk memulai proses verifikasi fisik dan alokasi ruang penyimpanan sampel.</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* QR Scanner Modal */}
      <AnimatePresence>
        {showScanner && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-[32px] overflow-hidden w-full max-w-md"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-50 rounded-xl">
                    <Scan className="w-5 h-5 text-blue-600" />
                  </div>
                  <h3 className="font-black text-slate-900 uppercase tracking-tighter">Scan Label Sampel</h3>
                </div>
                <button onClick={() => setShowScanner(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>
              <div className="p-8">
                <div id="login-reader" className="overflow-hidden rounded-2xl border-4 border-slate-100" />
                <p className="mt-4 text-center text-xs text-slate-400 font-medium italic">
                  Arahkan barcode/QR pada label botol ke kamera untuk verifikasi cepat.
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default LabLoginDashboard;
