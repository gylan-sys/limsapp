import React, { useState, useEffect } from 'react';
import { 
  ClipboardCheck, 
  MapPin, 
  Calendar, 
  Thermometer, 
  Droplets, 
  Navigation,
  CheckCircle2,
  Clock,
  ArrowRight,
  Package,
  Camera,
  Search,
  AlertCircle,
  Scan,
  Check,
  X,
  FileSignature,
  QrCode
} from 'lucide-react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  updateDoc,
  Timestamp,
  getDocs,
  addDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';
import { Html5QrcodeScanner } from 'html5-qrcode';

interface SamplingDashboardProps {
  user: any;
  onNotify: (title: string, message: string, type: 'success' | 'info' | 'error') => void;
}

const SamplingDashboard: React.FC<SamplingDashboardProps> = ({ user, onNotify }) => {
  const [jobs, setJobs] = useState<any[]>([]);
  const [selectedJob, setSelectedJob] = useState<any | null>(null);
  const [jobSamples, setJobSamples] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showScanner, setShowScanner] = useState(false);
  const [showSignature, setShowSignature] = useState(false);
  const [isSigned, setIsSigned] = useState(false);

  const [fieldData, setFieldData] = useState({
    temperature: '',
    humidity: '',
    coordinates: '',
    notes: ''
  });

  useEffect(() => {
    if (!user?.uid) return;

    const q = query(
      collection(db, 'sampling_jobs'),
      where('assignedTo', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const jobData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setJobs(jobData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!selectedJob) return;

    const q = query(
      collection(db, 'app_samples'),
      where('jobId', '==', selectedJob.id)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setJobSamples(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => unsubscribe();
  }, [selectedJob]);

  useEffect(() => {
    if (showScanner) {
      const scanner = new Html5QrcodeScanner(
        "reader",
        { fps: 10, qrbox: { width: 250, height: 250 } },
        /* verbose= */ false
      );

      scanner.render((decodedText) => {
        handleScanSuccess(decodedText);
        scanner.clear();
        setShowScanner(false);
      }, (error) => {
        // console.warn(error);
      });

      return () => {
        scanner.clear();
      };
    }
  }, [showScanner]);

  const handleScanSuccess = async (qrData: string) => {
    // qrData is jobId-sampleName-timestamp (from previous implementation)
    const bottle = jobSamples.find(s => s.qrCode === qrData);
    if (bottle) {
      try {
        await updateDoc(doc(db, 'app_samples', bottle.id), {
          status: 'COLLECTED',
          collectedAt: Timestamp.now()
        });
        onNotify('Berhasil', `Sampel ${bottle.sampleName} berhasil di-scan dan ditandai terambil.`, 'success');
      } catch (error) {
        onNotify('Error', 'Gagal update status botol', 'error');
      }
    } else {
      onNotify('Info', 'QR tidak dikenali atau tidak ada di daftar tugas ini.', 'info');
    }
  };

  const markCollected = async (id: string, name: string) => {
    try {
      await updateDoc(doc(db, 'app_samples', id), {
        status: 'COLLECTED',
        collectedAt: Timestamp.now()
      });
      onNotify('Berhasil', `Sampel ${name} ditandai terambil.`, 'success');
    } catch (error) {
      onNotify('Error', 'Gagal update status botol', 'error');
    }
  };

  const handleUpdateFieldData = async () => {
    if (!selectedJob) return;
    try {
      await updateDoc(doc(db, 'sampling_jobs', selectedJob.id), {
        fieldData: {
          ...fieldData,
          updatedAt: Timestamp.now()
        },
        status: 'IN_FIELD'
      });
      onNotify('Berhasil', 'Data lapangan telah disimpan', 'success');
    } catch (error) {
      onNotify('Gagal', 'Gagal menyimpan data lapangan', 'error');
    }
  };

  const handleSubmitToLab = async () => {
    if (!selectedJob) return;
    
    const uncollected = jobSamples.filter(s => s.status === 'PENDING');
    if (uncollected.length > 0) {
      onNotify('Peringatan', `Masih ada ${uncollected.length} botol yang belum terambil.`, 'error');
      return;
    }

    if (!isSigned) {
      onNotify('Info', 'Mohon lakukan tanda tangan digital (CoC) sebelum mengirim.', 'info');
      setShowSignature(true);
      return;
    }

    try {
      await updateDoc(doc(db, 'sampling_jobs', selectedJob.id), {
        status: 'SUBMITTED',
        submittedAt: Timestamp.now(),
        signedBy: user.email,
        isCoCSigned: true
      });

      // Create notification for Login Team
      await addDoc(collection(db, 'notifications'), {
        recipientId: 'system_login_team', // Or specific logic
        title: 'Sampel Masuk!',
        message: `Tugas sampling dari ${selectedJob.customerName} telah dikirim ke laboratorium.`,
        type: 'info',
        read: false,
        createdAt: Timestamp.now()
      });

      setSelectedJob(null);
      onNotify('Berhasil', 'Tugas telah dikirim ke Lab Login', 'success');
    } catch (error) {
      onNotify('Gagal', 'Gagal memproses pengiriman', 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-emerald-600">
        <Clock className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard Petugas Sampling</h1>
          <p className="text-slate-500">Kelola dan input data pengambilan sampel di lapangan.</p>
        </div>
        <div className="flex gap-2">
          <div className="px-4 py-2 bg-emerald-50 text-emerald-700 rounded-lg text-sm font-medium border border-emerald-100 flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4" />
            {jobs.filter(j => j.status !== 'COMPLETED').length} Tugas Aktif
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Jobs List */}
        <div className="lg:col-span-1 space-y-4">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
            <Package className="w-4 h-4" /> Daftar Penugasan
          </h2>
          <div className="space-y-3">
            {jobs.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-xl border border-dashed border-slate-300">
                <p className="text-slate-400 text-sm">Belum ada tugas yang diberikan.</p>
              </div>
            ) : (
              jobs.map(job => (
                <motion.button
                  key={job.id}
                  layoutId={job.id}
                  onClick={() => {
                    setSelectedJob(job);
                    if (job.fieldData) setFieldData(job.fieldData);
                  }}
                  className={cn(
                    "w-full text-left p-4 rounded-xl border transition-all duration-200 group",
                    selectedJob?.id === job.id 
                      ? "bg-emerald-50 border-emerald-500 shadow-md ring-1 ring-emerald-500" 
                      : "bg-white border-slate-200 hover:border-emerald-300 hover:shadow-sm"
                  )}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
                      job.status === 'PLANNED' ? "bg-blue-100 text-blue-700" :
                      job.status === 'IN_FIELD' ? "bg-amber-100 text-amber-700" :
                      job.status === 'SUBMITTED' ? "bg-emerald-100 text-emerald-700" :
                      "bg-slate-100 text-slate-700"
                    )}>
                      {job.status}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">{job.stpsNumber || 'NO-STPS'}</span>
                  </div>
                  <h3 className="font-bold text-slate-900 group-hover:text-emerald-700 transition-colors uppercase truncate">
                    {job.customerName}
                  </h3>
                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <MapPin className="w-3.5 h-3.5" /> {job.location}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Calendar className="w-3.5 h-3.5" /> {job.plannedDate}
                    </div>
                  </div>
                </motion.button>
              ))
            )}
          </div>
        </div>

        {/* Job Detail & Form */}
        <div className="lg:col-span-2">
          <AnimatePresence mode="wait">
            {selectedJob ? (
              <motion.div
                key="detail"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
              >
                <div className="p-6 border-bottom border-slate-100 bg-slate-50/50">
                  <div className="flex justify-between items-start">
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">{selectedJob.customerName}</h2>
                      <p className="text-slate-500 text-sm">{selectedJob.location}</p>
                    </div>
                    <button 
                      onClick={() => setSelectedJob(null)}
                      className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                    >
                      <ArrowRight className="w-5 h-5 text-slate-400" />
                    </button>
                  </div>
                </div>

                <div className="p-6 space-y-8">
                  {/* Field Data Sections */}
                  <section className="space-y-4">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Navigation className="w-4 h-4 text-emerald-600" /> Data Parameter Lapangan
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-500 uppercase">Suhu Air (°C)</label>
                        <div className="relative">
                          <Thermometer className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input 
                            type="number"
                            value={fieldData.temperature}
                            onChange={e => setFieldData({...fieldData, temperature: e.target.value})}
                            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all"
                            placeholder="0.0"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-500 uppercase">Kelembaban (%)</label>
                        <div className="relative">
                          <Droplets className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input 
                            type="number"
                            value={fieldData.humidity}
                            onChange={e => setFieldData({...fieldData, humidity: e.target.value})}
                            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all"
                            placeholder="0.0"
                          />
                        </div>
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <label className="text-xs font-semibold text-slate-500 uppercase">Titik Koordinat (GPS)</label>
                        <div className="relative">
                          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input 
                            type="text"
                            value={fieldData.coordinates}
                            onChange={e => setFieldData({...fieldData, coordinates: e.target.value})}
                            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all"
                            placeholder="Latitude, Longitude"
                          />
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <QrCode className="w-4 h-4 text-emerald-600" /> Checklist Botol Sampel
                      </h3>
                      <button 
                        onClick={() => setShowScanner(true)}
                        className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-black uppercase tracking-widest flex items-center gap-2 hover:bg-blue-700 shadow-lg shadow-blue-500/20 transition-all"
                      >
                        <Scan className="w-3.5 h-3.5" /> Scan QR Botol
                      </button>
                    </div>

                    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {jobSamples.map(s => (
                            <div key={s.id} className="bg-white p-3 rounded-xl border border-slate-200 flex items-center justify-between group">
                                <div className="flex items-center gap-3">
                                   <div className={cn(
                                     "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                                     s.status === 'COLLECTED' ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-400"
                                   )}>
                                      {s.status === 'COLLECTED' ? <CheckCircle2 className="w-4 h-4" /> : <Package className="w-4 h-4" />}
                                   </div>
                                   <div>
                                      <p className="text-xs font-black text-slate-900 uppercase tracking-tight">{s.sampleName}</p>
                                      <p className="text-[10px] font-bold text-slate-400 uppercase italic">Standar Prosedur</p>
                                   </div>
                                </div>
                                {s.status === 'PENDING' && (
                                   <button 
                                     onClick={() => markCollected(s.id, s.sampleName)}
                                     className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                     title="Selesai Diambil"
                                   >
                                      <Check className="w-4 h-4" />
                                   </button>
                                )}
                            </div>
                          ))}
                       </div>
                    </div>
                  </section>

                  {/* Chain of Custody (CoC) Signature */}
                  <section className="space-y-4">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                       <FileSignature className="w-4 h-4 text-emerald-600" /> Tanda Tangan Lapangan (CoC)
                    </h3>
                    <div 
                      onClick={() => !isSigned && setShowSignature(true)}
                      className={cn(
                        "w-full h-32 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center transition-all cursor-pointer",
                        isSigned ? "bg-emerald-50 border-emerald-200" : "bg-slate-50 border-slate-300 hover:border-emerald-400"
                      )}
                    >
                       {isSigned ? (
                         <div className="text-center">
                            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                            <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">CoC Ditandatangani</p>
                            <p className="text-[9px] text-emerald-600 italic mt-0.5">{user.email}</p>
                         </div>
                       ) : (
                         <div className="text-center space-y-2">
                            <FileSignature className="w-8 h-8 text-slate-300 mx-auto" />
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ketuk untuk Verifikasi CoC</p>
                         </div>
                       )}
                    </div>
                  </section>

                  <section className="space-y-4">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 text-slate-700">
                      <Camera className="w-4 h-4 text-emerald-600" /> Bukti Lapangan & Catatan
                    </h3>
                    <textarea 
                      value={fieldData.notes}
                      onChange={e => setFieldData({...fieldData, notes: e.target.value})}
                      rows={3}
                      className="w-full p-4 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all text-sm"
                      placeholder="Catatan kondisi lokasi, cuaca, atau kendala lainnya..."
                    />
                  </section>

                  <div className="pt-6 border-t border-slate-100 flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={handleUpdateFieldData}
                      disabled={selectedJob.status === 'SUBMITTED'}
                      className="flex-1 px-6 py-3 bg-white border border-emerald-600 text-emerald-600 rounded-xl font-bold hover:bg-emerald-50 transition-colors disabled:opacity-50"
                    >
                      Simpan Draft
                    </button>
                    <button
                      onClick={handleSubmitToLab}
                      disabled={selectedJob.status === 'SUBMITTED'}
                      className="flex-[2] px-6 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 group disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-5 h-5" />
                      {selectedJob.status === 'SUBMITTED' ? 'Telah Terkirim' : 'Kirim Ke Laboratorium'}
                    </button>
                  </div>

                  {selectedJob.status === 'SUBMITTED' && (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex gap-3 text-amber-800 text-sm italic">
                      <AlertCircle className="w-5 h-5 shrink-0" />
                      Status pekerjaan ini sudah SUBMITTED. Anda tidak dapat mengubah data lapangan kecuali diminta revisi oleh Admin.
                    </div>
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="h-[400px] flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50"
              >
                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-4">
                  <Search className="w-8 h-8 text-slate-300" />
                </div>
                <p className="font-medium text-slate-500">Pilih penugasan dari daftar di samping</p>
                <p className="text-sm">Silakan pilih salah satu tugas untuk mulai mengisi data.</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* QR Scanner Modal */}
      <AnimatePresence>
        {showScanner && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-[40px] shadow-2xl w-full max-w-lg overflow-hidden flex flex-col"
            >
              <div className="p-6 border-bottom border-slate-100 flex items-center justify-between">
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Scan Botol Sampel</h3>
                <button onClick={() => setShowScanner(false)} className="p-2 bg-slate-100 text-slate-500 rounded-2xl hover:bg-slate-200 transition-all">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6">
                <div id="reader" className="w-full overflow-hidden rounded-3xl border-4 border-slate-100"></div>
                <div className="mt-6 p-4 bg-blue-50 border border-blue-100 rounded-2xl text-center">
                   <p className="text-xs text-blue-700 font-bold uppercase tracking-widest">Arahkan kamera ke QR Stiker Botol</p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Signature Modal */}
      <AnimatePresence>
        {showSignature && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="bg-white rounded-[40px] shadow-2xl w-full max-w-md overflow-hidden flex flex-col"
            >
              <div className="p-6 border-bottom border-slate-100 text-center">
                <FileSignature className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">E-Signature (CoC)</h3>
                <p className="text-slate-500 text-xs mt-1">Saya menyatakan data lapangan ini benar dan akurat.</p>
              </div>
              <div className="p-8 space-y-6">
                <div className="h-40 bg-slate-50 border-2 border-dashed border-slate-300 rounded-3xl flex items-center justify-center relative group">
                   <span className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] group-hover:hidden">Area Tanda Tangan</span>
                   <div className="absolute inset-4 border-b border-slate-300 pointer-events-none"></div>
                </div>
                
                <div className="space-y-3">
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Ditandatangani oleh: {user.email}</p>
                   <button 
                     onClick={() => { setIsSigned(true); setShowSignature(false); }}
                     className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-emerald-700 shadow-xl shadow-emerald-500/20 transition-all"
                   >
                     Submit Signature
                   </button>
                   <button 
                     onClick={() => setShowSignature(false)}
                     className="w-full py-4 text-[10px] font-black uppercase tracking-widest text-slate-400"
                   >
                     Cancel
                   </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SamplingDashboard;
