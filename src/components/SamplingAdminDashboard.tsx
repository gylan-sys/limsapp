import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Users, 
  MapPin, 
  Calendar, 
  UserPlus, 
  Trash2, 
  Save,
  ChevronRight,
  ClipboardList,
  User as UserIcon,
  Search,
  CheckCircle2,
  Clock,
  Briefcase,
  AlertCircle,
  FileUp,
  QrCode,
  Printer,
  X,
  Info
} from 'lucide-react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  addDoc,
  Timestamp,
  getDocs,
  deleteDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';
import * as XLSX from 'xlsx';
import { QRCodeCanvas } from 'qrcode.react';

interface SamplingAdminDashboardProps {
  user: any;
  onNotify: (title: string, message: string, type: 'success' | 'info' | 'error') => void;
}

const SamplingAdminDashboard: React.FC<SamplingAdminDashboardProps> = ({ user, onNotify }) => {
  const [jobs, setJobs] = useState<any[]>([]);
  const [officers, setOfficers] = useState<any[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showQRModal, setShowQRModal] = useState(false);
  const [selectedJobForQR, setSelectedJobForQR] = useState<any>(null);
  const [jobSamplesForQR, setJobSamplesForQR] = useState<any[]>([]);

  // Form State
  const [newJob, setNewJob] = useState({
    customerName: '',
    location: '',
    stpsNumber: '',
    plannedDate: '',
    assignedTo: '',
    deadlineDate: '',
    status: 'PLANNED' as const
  });
  const [samples, setSamples] = useState<any[]>([{ sampleName: '', type: 'air', method: '' }]);

  useEffect(() => {
    // Fetch Jobs
    const qJobs = query(collection(db, 'sampling_jobs'));
    const unsubJobs = onSnapshot(qJobs, (snapshot) => {
      setJobs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });

    // Fetch Sampling Officers
    const qOfficers = query(
      collection(db, 'users'),
      where('role', '==', 'sampling_officer')
    );
    const unsubOfficers = onSnapshot(qOfficers, (snapshot) => {
      setOfficers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => { unsubJobs(); unsubOfficers(); };
  }, []);

  const handleCreateJob = async () => {
    if (!newJob.customerName || !newJob.assignedTo) {
      onNotify('Info', 'Mohon lengkapi data penugasan', 'info');
      return;
    }

    try {
      // 1. Generate COC Number based on current month/year and job count
      const now = new Date();
      const yy = now.getFullYear().toString().slice(-2);
      const mm = (now.getMonth() + 1).toString().padStart(2, '0');
      
      // Query jobs for the current month locally for simplicity in this implementation
      const monthPrefix = `MI-COC${yy}${mm}`;
      const existingInMonth = jobs.filter(j => j.cocNumber && j.cocNumber.startsWith(monthPrefix));
      const nextSequence = (existingInMonth.length + 1).toString().padStart(4, '0');
      const generatedCocNumber = `${monthPrefix}${nextSequence}`;

      // 1. Create the Sampling Job
      const jobRef = await addDoc(collection(db, 'sampling_jobs'), {
        ...newJob,
        cocNumber: generatedCocNumber,
        createdAt: Timestamp.now()
      });

      // 2. Create associated Samples (bottles)
      let sampleIndex = 1;
      for (const sample of samples) {
        if (sample.sampleName) {
          const sampleId = `${generatedCocNumber}.${sampleIndex}`;
          await addDoc(collection(db, 'app_samples'), {
            jobId: jobRef.id,
            cocNumber: generatedCocNumber,
            sampleId: sampleId,
            sampleName: sample.sampleName,
            labType: sample.type,
            status: 'PENDING',
            method: sample.method || 'Standard Method',
            deadlineAt: newJob.deadlineDate ? Timestamp.fromDate(new Date(newJob.deadlineDate)) : null,
            createdAt: Timestamp.now(),
            qrCode: sampleId // Use Sample ID as the QR Code content
          });
          sampleIndex++;
        }
      }

      // 3. Notify the Officer
      await addDoc(collection(db, 'notifications'), {
        recipientId: newJob.assignedTo,
        title: 'Penugasan Sampling Baru',
        message: `Anda ditugaskan untuk mengambil sampel di ${newJob.customerName} pada ${newJob.plannedDate}.`,
        type: 'info',
        read: false,
        createdAt: Timestamp.now()
      });

      setShowAddModal(false);
      setNewJob({ customerName: '', location: '', stpsNumber: '', plannedDate: '', assignedTo: '', deadlineDate: '', status: 'PLANNED' as const });
      setSamples([{ sampleName: '', type: 'air', method: '' }]);
      onNotify('Berhasil', 'Penugasan sampling telah dibuat', 'success');
    } catch (error) {
      onNotify('Gagal', 'Gagal membuat penugasan', 'error');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data: any[] = XLSX.utils.sheet_to_json(ws);

        if (data.length > 0) {
          // Assume format: Client, STPS, Lokasi, Tgl Rencana, Parameter, Lab (udara/air/dst)
          const first = data[0];
          setNewJob({
            ...newJob,
            customerName: first.Client || first.Customer || '',
            stpsNumber: first.STPS || first['No STPS'] || '',
            location: first.Lokasi || first.Location || '',
            plannedDate: first['Tgl Rencana'] || first.Date || ''
          });

          // Extract unique samples/parameters
          const extractedSamples = data.map(row => ({
             sampleName: row.Parameter || row.Sample || 'Sample',
             type: (row.Lab || row.Type || 'air').toLowerCase(),
             method: row.Metode || row.Method || ''
          }));
          setSamples(extractedSamples);
          onNotify('Berhasil', `Data dari marketing berhasil dimuat (${data.length} baris)`, 'success');
        }
      } catch (error) {
        onNotify('Gagal', 'Format file excel tidak dikenali', 'error');
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleOpenQRStickers = async (job: any) => {
    setSelectedJobForQR(job);
    try {
      const q = query(collection(db, 'app_samples'), where('jobId', '==', job.id));
      const snap = await getDocs(q);
      setJobSamplesForQR(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setShowQRModal(true);
    } catch (error) {
      onNotify('Error', 'Gagal memuat data QR', 'error');
    }
  };

  const handlePrintQR = () => {
    window.print();
  };

  const addSampleField = () => setSamples([...samples, { sampleName: '', type: 'air' }]);
  const removeSampleField = (index: number) => setSamples(samples.filter((_, i) => i !== index));

  if (loading) return <div className="h-64 flex items-center justify-center text-slate-400">Loading...</div>;

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="relative z-10">
          <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase mb-2">Sampling Administrator</h1>
          <p className="text-slate-500 font-medium">Pengaturan tim lapangan, manajemen STPS, dan penugasan personil.</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="relative z-10 px-8 py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-emerald-700 shadow-xl shadow-emerald-500/20 transition-all flex items-center gap-2 group"
        >
          <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform" /> Buat Penugasan Baru
        </button>
        <div className="absolute top-0 right-0 p-8 text-emerald-50 opacity-10 pointer-events-none">
           <Briefcase className="w-32 h-32" />
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Penugasan" value={jobs.length} icon={ClipboardList} color="blue" />
        <StatCard title="Petugas Aktif" value={officers.length} icon={Users} color="emerald" />
        <StatCard title="Menunggu Field" value={jobs.filter(j => j.status === 'PLANNED').length} icon={Clock} color="amber" />
        <StatCard title="Selesai" value={jobs.filter(j => j.status === 'COMPLETED').length} icon={CheckCircle2} color="slate" />
      </div>

      <div className="bg-white rounded-[32px] border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <Search className="w-4 h-4" /> Monitoring Daftar Tugas
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                 <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Client / STPS</th>
                 <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Lokasi</th>
                 <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Tgl Terencana</th>
                 <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Team Petugas</th>
                 <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                 <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 italic font-medium">
              {jobs.map(job => (
                <tr key={job.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-5">
                    <div className="flex flex-col">
                      <span className="font-black text-slate-900 uppercase not-italic">{job.customerName}</span>
                      <div className="flex flex-col gap-0.5 mt-1">
                        <span className="text-[10px] text-slate-400 italic font-mono uppercase tracking-tighter">COC: {job.cocNumber || 'N/A'}</span>
                        <span className="text-[10px] text-slate-400 italic font-mono uppercase tracking-tighter">STPS: {job.stpsNumber || '-'}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                       <MapPin className="w-3.5 h-3.5" /> {job.location}
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                       <Calendar className="w-3.5 h-3.5" /> {job.plannedDate}
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-2 border border-slate-200 rounded-full px-3 py-1 w-fit bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase">
                       <UserIcon className="w-3.5 h-3.5" /> {officers.find(o => o.uid === job.assignedTo)?.email.split('@')[0] || 'Unknown'}
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <span className={cn(
                      "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tight",
                      job.status === 'PLANNED' ? "bg-blue-100 text-blue-700" :
                      job.status === 'IN_FIELD' ? "bg-amber-100 text-amber-700" :
                      job.status === 'SUBMITTED' ? "bg-emerald-100 text-emerald-700" :
                      "bg-slate-100 text-slate-700 hover:scale-105 transition-transform cursor-default"
                    )}>
                      {job.status}
                    </span>
                  </td>
                  <td className="px-6 py-5 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                     <div className="flex justify-end gap-2">
                       <button 
                         onClick={() => handleOpenQRStickers(job)}
                         className="p-2 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-xl transition-all"
                         title="Persiapkan QR Stiker"
                       >
                          <QrCode className="w-4 h-4" />
                       </button>
                       <button className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all">
                          <Trash2 className="w-4 h-4" />
                       </button>
                     </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Job Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[40px] shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col md:flex-row h-[90vh] md:h-auto max-h-[90vh]"
            >
              {/* Left Side: Basic Info */}
              <div className="md:w-1/2 p-8 lg:p-12 space-y-8 bg-slate-50/50 border-r border-slate-200 overflow-y-auto custom-scrollbar">
                <div className="space-y-1">
                  <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Buat Penugasan Baru</h3>
                  <p className="text-slate-500 text-sm italic font-medium">Lengkapi rincian STPS dan assign team petugas.</p>
                </div>

                <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl border-dashed">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Excel Import (Marketing)</span>
                    <label className="cursor-pointer bg-white px-3 py-1 rounded-lg border border-emerald-200 text-[10px] font-black uppercase text-emerald-600 hover:bg-emerald-100 transition-colors">
                      <FileUp className="w-3 h-3 inline mr-1" /> Pilih File
                      <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleFileUpload} />
                    </label>
                  </div>
                  <p className="text-[9px] text-emerald-600/70 font-medium">Upload file dari team marketing untuk auto-fill data customer & sampling.</p>
                </div>

                <div className="grid grid-cols-1 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nama Customer / Project</label>
                    <input 
                      value={newJob.customerName}
                      onChange={e => setNewJob({...newJob, customerName: e.target.value})}
                      className="w-full px-5 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 font-bold"
                      placeholder="e.g. PT. Alam Sejahtera"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">No. STPS</label>
                      <input 
                        value={newJob.stpsNumber}
                        onChange={e => setNewJob({...newJob, stpsNumber: e.target.value})}
                        className="w-full px-5 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 font-bold"
                        placeholder="STPS/2024/001"
                      />
                    </div>
                    <div className="space-y-1.5 flex flex-col justify-end">
                      <div className="p-3 bg-slate-100 rounded-2xl border border-slate-200 border-dashed">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Preview Format COC</p>
                        <p className="text-xs font-mono font-bold text-slate-600">MI-COC{new Date().getFullYear().toString().slice(-2)}{(new Date().getMonth() + 1).toString().padStart(2, '0')}XXXX</p>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tgl Rencana</label>
                      <input 
                        type="date"
                        value={newJob.plannedDate}
                        onChange={e => setNewJob({...newJob, plannedDate: e.target.value})}
                        className="w-full px-5 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 font-bold"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-rose-500 uppercase tracking-widest ml-1 italic flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Target Selesai Lab (TAT)
                      </label>
                      <input 
                        type="date"
                        value={newJob.deadlineDate}
                        onChange={e => setNewJob({...newJob, deadlineDate: e.target.value})}
                        className="w-full px-5 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:ring-4 focus:ring-rose-500/10 font-bold text-rose-600"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Lokasi Sampling</label>
                    <input 
                      value={newJob.location}
                      onChange={e => setNewJob({...newJob, location: e.target.value})}
                      className="w-full px-5 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 font-bold"
                      placeholder="e.g. Kawasan Industri Kendal"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 text-emerald-600 italic flex items-center gap-1">
                      <UserPlus className="w-3 h-3" /> Pilih Team Petugas
                    </label>
                    <select 
                      value={newJob.assignedTo}
                      onChange={e => setNewJob({...newJob, assignedTo: e.target.value})}
                      className="w-full px-5 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 font-black uppercase text-xs"
                    >
                      <option value="">Pilih Team...</option>
                      {officers.map(o => (
                        <option key={o.id} value={o.uid}>{o.email} ({o.displayName || 'No Name'})</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Right Side: Samples (Bottles) */}
              <div className="md:w-1/2 p-8 lg:p-12 space-y-8 flex flex-col overflow-y-auto custom-scrollbar">
                <div className="flex-1 space-y-6">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                      <Plus className="w-3 h-3" /> Daftar Botol Sampel (Kapasitas Lab)
                    </h4>
                    <button 
                      onClick={addSampleField}
                      className="text-[10px] font-black text-blue-600 uppercase hover:underline"
                    >
                      + Tambah Botol
                    </button>
                  </div>

                  <div className="space-y-3">
                    {samples.map((s, i) => (
                      <div key={i} className="flex flex-col gap-2 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                        <div className="flex gap-2">
                          <input 
                            value={s.sampleName}
                            onChange={e => {
                              const newSamples = [...samples];
                              newSamples[i].sampleName = e.target.value;
                              setSamples(newSamples);
                            }}
                            placeholder="Parameter (e.g. TSS)"
                            className="flex-1 px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-500 text-sm font-bold italic"
                          />
                          <select 
                            value={s.type}
                            onChange={e => {
                              const newSamples = [...samples];
                              newSamples[i].type = e.target.value;
                              setSamples(newSamples);
                            }}
                            className="px-3 py-2 rounded-xl border border-slate-200 text-[10px] font-black uppercase"
                          >
                            <option value="udara">Udara</option>
                            <option value="air">Air</option>
                            <option value="b3_tanah">Tanah</option>
                            <option value="mikrobiologi">Mikro</option>
                          </select>
                          {samples.length > 1 && (
                            <button onClick={() => removeSampleField(i)} className="p-2 text-slate-300 hover:text-rose-500 transition-opacity">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        <input 
                          value={s.method}
                          onChange={e => {
                            const newSamples = [...samples];
                            newSamples[i].method = e.target.value;
                            setSamples(newSamples);
                          }}
                          placeholder="Metode Pengujian (e.g. SNI 01-2345-2006)"
                          className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 text-[10px] font-medium"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-8 border-t border-slate-100 flex gap-4">
                  <button 
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-900 transition-colors"
                  >
                    Batal
                  </button>
                  <button 
                    onClick={handleCreateJob}
                    className="flex-[2] px-6 py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-emerald-700 shadow-xl shadow-emerald-500/20 transition-all"
                  >
                    Simpan & Assign Tugas
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* QR Sticker Modal */}
      <AnimatePresence>
        {showQRModal && selectedJobForQR && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-[40px] shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col h-[80vh]"
            >
              <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-white print:hidden">
                <div>
                  <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Persiapan QR Stiker Sampel</h3>
                  <p className="text-slate-500 text-sm font-medium">{selectedJobForQR.customerName} - {selectedJobForQR.stpsNumber}</p>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={handlePrintQR}
                    className="p-3 bg-emerald-600 text-white rounded-2xl hover:bg-emerald-700 shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2 font-black text-xs uppercase"
                  >
                    <Printer className="w-4 h-4" /> Print Stiker
                  </button>
                  <button 
                    onClick={() => setShowQRModal(false)}
                    className="p-3 bg-slate-100 text-slate-500 rounded-2xl hover:bg-slate-200 transition-all"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="flex-1 p-8 overflow-y-auto bg-slate-50/30 print:bg-white print:overflow-visible custom-scrollbar">
                <div className="grid grid-cols-2 gap-6 print:grid-cols-3 print:gap-4">
                  {jobSamplesForQR.map((sample) => (
                    <div key={sample.id} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col items-center gap-4 border-dashed relative print:border-slate-300 print:shadow-none print:p-4">
                      <QRCodeCanvas 
                        value={sample.qrCode || sample.id} 
                        size={120}
                        level="H"
                        includeMargin={true}
                        className="print:w-24 print:h-24"
                      />
                      <div className="text-center">
                        <p className="text-xs font-black text-slate-900 uppercase tracking-tight truncate max-w-[180px]">{sample.sampleName}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">{sample.type}</p>
                        <div className="mt-2 text-[8px] font-mono font-bold text-slate-300 border border-slate-100 px-2 py-0.5 rounded uppercase tracking-tighter">
                          {sample.qrCode || sample.id}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-8 p-6 bg-blue-50 border border-blue-100 rounded-3xl print:hidden">
                  <h4 className="flex items-center gap-2 text-blue-700 font-bold text-sm mb-2">
                    <Info className="w-4 h-4" /> Panduan Cetak Stiker
                  </h4>
                  <ul className="text-xs text-blue-600 space-y-1 ml-6 list-disc opacity-80">
                    <li>Gunakan kertas sticker A4 atau label thermal.</li>
                    <li>Satu set stiker mewakili label identitas fisik botol di lapangan.</li>
                    <li>Petugas lapangan akan menempelkan stiker ini saat sampling.</li>
                    <li>Team Login akan memindai QR ini untuk verifikasi cepat di lab.</li>
                  </ul>
                </div>
              </div>
              
              <footer className="p-6 border-t border-slate-100 bg-slate-50/50 text-center print:hidden">
                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest italic">QR System Integrated with STPS-LIMS</p>
              </footer>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const StatCard = ({ title, value, icon: Icon, color }: any) => {
  const colors: any = {
    blue: "bg-blue-50 text-blue-600 border-blue-100 shadow-blue-500/5",
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-100 shadow-emerald-500/5",
    amber: "bg-amber-50 text-amber-600 border-amber-100 shadow-amber-500/5",
    slate: "bg-slate-50 text-slate-600 border-slate-100 shadow-slate-500/5"
  };

  return (
    <div className={cn("p-6 rounded-[24px] border shadow-xl transition-all hover:scale-[1.02]", colors[color])}>
       <div className="flex items-center justify-between mb-4">
          <Icon className="w-6 h-6 opacity-60" />
          <span className="text-[10px] font-black uppercase tracking-[0.2em]">Live Data</span>
       </div>
       <p className="text-3xl font-black text-slate-900 leading-none mb-1">{value}</p>
       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">{title}</p>
    </div>
  );
};

export default SamplingAdminDashboard;
