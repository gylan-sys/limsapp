import React, { Component, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { 
  LayoutDashboard, 
  Wind, 
  Droplets, 
  Trash2, 
  Microscope, 
  Package, 
  Warehouse, 
  Settings, 
  Settings as SettingsIcon,
  LogOut, 
  Menu, 
  X,
  User as UserIcon,
  Users,
  Layout as LayoutIcon,
  Palette,
  ShieldAlert,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  AlertTriangle,
  ClipboardList,
  Download,
  Database,
  Upload,
  FileSpreadsheet,
  FileText,
  FileUp,
  ChevronDown,
  ChevronRight,
  History,
  ClipboardCheck,
  Key,
  UserPlus,
  Save,
  Beaker,
  TrendingUp,
  TrendingDown,
  Calendar,
  Mail,
  Lock,
  ArrowRightLeft,
  RefreshCw,
  Shield,
  Eye,
  EyeOff,
  QrCode,
  Maximize,
  Printer,
  Edit2,
  Edit3,
  ShoppingCart,
  Truck,
  XCircle,
  Camera,
  MessageSquare,
  Image as ImageIcon,
  Bell,
  MoreVertical,
  ArrowUpRight,
  ArrowDownRight,
  Info,
  Zap,
  Scan,
  Briefcase,
  MapPin,
  ThermometerSnowflake
} from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import QRCode from 'qrcode';
import { Html5QrcodeScanner, Html5Qrcode } from 'html5-qrcode';
import { auth, db } from './firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User, signInWithEmailAndPassword, sendPasswordResetEmail, createUserWithEmailAndPassword, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { initializeApp, deleteApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';
import { doc, getDoc, setDoc, collection, onSnapshot, query, where, addDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from './lib/utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area, Legend } from 'recharts';
import SamplingDashboard from './components/SamplingDashboard';
import LabLoginDashboard from './components/LabLoginDashboard';
import SamplingAdminDashboard from './components/SamplingAdminDashboard';

// --- Types ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null) => {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
};

const handleApiError = async (response: Response, context: string) => {
  let errorData;
  try {
    errorData = await response.json();
  } catch {
    errorData = { error: 'Unknown API error' };
  }
  
  const errorMessage = `API Error [${context}]: ${response.status} - ${errorData.error || response.statusText}`;
  console.error(errorMessage, {
    status: response.status,
    url: response.url,
    data: errorData
  });
  throw new Error(errorMessage);
};

type UserRole = 'admin' | 'analyst' | 'warehouse_manager' | 'purchasing' | 'sampling_admin' | 'sampling_officer' | 'login_team';

interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  permissions?: string[];
  createdAt: any;
}

interface LabSample {
  id: string;
  type: 'udara' | 'air' | 'b3_tanah' | 'mikrobiologi';
  sampleName: string;
  status: 'pending' | 'in-progress' | 'completed';
  analystId: string;
  result?: string;
  createdAt: any;
}

interface StockItem {
  id: number;
  name: string;
  brand?: string;
  lotNumber?: string;
  materialCode?: string;
  category: string;
  quantity: number;
  minStock: number;
  unit: string; // Packaging Unit (Pack, Pcs, Botol)
  contentPerUnit?: number; // Amount per package (e.g. 500)
  contentUnit?: string; // Unit per package (Gram, ML, Pcs)
  totalContent?: number; // Total amount in contentUnit
  arrivalDate?: string;
  expiryDate?: string;
  coaFile?: string; // Base64 PDF
  location: 'lab' | 'warehouse';
  labType?: 'udara' | 'air' | 'b3_tanah' | 'mikrobiologi' | 'general';
  rejectionReason?: string;
  updatedAt: any;
}

interface Requisition {
  id: number;
  reagentName: string;
  quantity: number;
  unit: string;
  labType: string;
  type: 'warehouse' | 'purchasing';
  status: 'pending' | 'po' | 'shipped' | 'received' | 'rejected' | 'lab_rejected';
  requestedBy: string;
  approvedBy?: string;
  rejectionReason?: string;
  purchasingNote?: string;
  receivedPhoto?: string; // Base64 or URL
  createdAt: string;
  updatedAt?: string;
}

interface DailyUse {
  id: number;
  reagentName: string;
  quantity: number;
  unit: string;
  labType: string;
  userName: string;
  purpose: string;
  parameter: string;
  date: string;
}

interface ReagentTransfer {
  id: number;
  reagentName: string;
  quantity: number;
  unit: string;
  sourceLab: string;
  destinationLab: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedBy: string;
  approvedBy?: string;
  createdAt: string;
}

interface SamplingJob {
  id: string;
  customerName: string;
  status: 'PLANNED' | 'IN_FIELD' | 'SUBMITTED' | 'RECEIVED' | 'COMPLETED';
  assignedTo: string; // UID
  location: string;
  stpsNumber: string;
  plannedDate: string;
  fieldData: any;
  createdAt: any;
}

interface AppSample {
  id: string;
  jobId: string;
  sampleName: string;
  type: 'udara' | 'air' | 'b3_tanah' | 'mikrobiologi';
  status: 'PENDING' | 'VERIFIED' | 'ANALYZING' | 'COMPLETED';
  analystId?: string;
  chillerLocation?: string;
  labResults?: any;
  verifiedAt?: any;
  completedAt?: any;
}

interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  timestamp: Date;
  read: boolean;
  link?: string;
}

// --- QR Code Components ---

const BulkQRCodeModal = ({ items, onClose }: { items: StockItem[], onClose: () => void }) => {
  const [isPrinting, setIsPrinting] = useState(false);
  const [qrUrls, setQrUrls] = useState<Record<number, string>>({});

  useEffect(() => {
    const generateQRs = async () => {
      const urls: Record<number, string> = {};
      for (const item of items) {
        const qrData = JSON.stringify({
          id: item.id,
          name: item.name,
          lot: item.lotNumber,
          expiry: item.expiryDate
        });
        try {
          const url = await QRCode.toDataURL(qrData, { margin: 1, width: 300 });
          urls[item.id] = url;
        } catch (err) {
          console.error('QR Generation error:', err);
        }
      }
      setQrUrls(urls);
    };
    generateQRs();
  }, [items]);

  const handlePrint = async () => {
    setIsPrinting(true);
    const win = window.open('', '_blank');
    if (!win) {
      setIsPrinting(false);
      return;
    }

    let html = `
      <html>
        <head>
          <title>Print Bulk QR Codes</title>
          <style>
            @page { 
              size: 70mm 50mm; 
              margin: 0; 
            }
            * { -webkit-print-color-adjust: exact; box-sizing: border-box; }
            body { 
              margin: 0; 
              padding: 0;
              background: white;
              font-family: 'Inter', -apple-system, sans-serif;
            }
            .label-page {
              width: 70mm; 
              height: 50mm; 
              padding: 5mm; 
              display: flex; 
              align-items: center; 
              gap: 6mm; 
              overflow: hidden;
              page-break-after: always;
            }
            .label-page:last-child {
              page-break-after: auto;
            }
            .qr-container { 
              width: 35mm;
              height: 35mm;
              flex-shrink: 0;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .qr-container img { 
              width: 100%; 
              height: 100%; 
              display: block; 
            }
            .info-container { 
              flex: 1;
              display: flex; 
              flex-direction: column; 
              justify-content: center; 
              min-width: 0;
            }
            .item-name {
              font-weight: 900;
              font-size: 14pt;
              line-height: 1.1;
              color: black;
              margin-bottom: 2mm;
              word-break: break-word;
              display: -webkit-box;
              -webkit-line-clamp: 2;
              -webkit-box-orient: vertical;
              overflow: hidden;
            }
            .item-detail {
              font-weight: 700;
              font-size: 10pt;
              color: #333;
              margin-bottom: 1mm;
            }
            .item-exp {
              font-weight: 900;
              font-size: 11pt;
              color: black;
              margin-top: 2mm;
              font-family: monospace;
            }
          </style>
        </head>
        <body>
    `;

    for (const item of items) {
      const url = qrUrls[item.id];
      if (url) {
        html += `
          <div class="label-page">
            <div class="qr-container">
              <img src="${url}" />
            </div>
            <div class="info-container">
              <div class="item-name">${item.name}</div>
              <div class="item-detail">Lot: ${item.lotNumber || '-'}</div>
              <div class="item-detail">Code: ${item.materialCode || '-'}</div>
              <div class="item-exp">EXP: ${item.expiryDate || '-'}</div>
            </div>
          </div>
        `;
      }
    }

    html += `
          <script>
            window.onload = () => {
              setTimeout(() => {
                window.print();
                window.close();
              }, 500);
            };
          </script>
        </body>
      </html>
    `;

    win.document.write(html);
    win.document.close();
    setIsPrinting(false);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden"
      >
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            <QrCode size={20} className="text-blue-600" />
            Cetak Massal Label QR (${items.length} Item)
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-6">
          <div className="max-h-[40vh] overflow-y-auto mb-6 space-y-2 pr-2 custom-scrollbar">
            {items.map((item, idx) => (
              <div key={idx} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center border border-slate-200 shrink-0">
                  <QrCode size={20} className="text-slate-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-900 text-sm truncate">{item.name}</p>
                  <p className="text-xs text-slate-500 truncate">Lot: {item.lotNumber || '-'} | Exp: {item.expiryDate || '-'}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-blue-50 p-4 rounded-2xl mb-6 space-y-2">
            <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wider flex items-center gap-1">
              <Printer size={12} /> Tips Cetak Massal SATO CG408:
            </p>
            <ul className="text-[10px] text-blue-600 space-y-1 list-disc pl-3">
              <li>Printer akan mencetak satu label per halaman secara otomatis.</li>
              <li>Pastikan <b>Margins: None</b> dan <b>Background Graphics: On</b>.</li>
              <li>Gunakan kertas stiker label ukuran 70x50mm.</li>
            </ul>
          </div>

          <div className="flex gap-3">
            <button 
              onClick={onClose}
              className="flex-1 px-6 py-4 rounded-2xl font-bold text-slate-600 hover:bg-slate-100 transition-all border border-slate-200"
            >
              Batal
            </button>
            <button 
              onClick={handlePrint}
              disabled={isPrinting || Object.keys(qrUrls).length < items.length}
              className="flex-[2] bg-blue-600 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 disabled:opacity-50"
            >
              {isPrinting ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <Printer size={20} />
              )}
              Cetak {items.length} Label
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

const QRCodeModal = ({ item, onClose }: { item: StockItem, onClose: () => void }) => {
  const qrData = JSON.stringify({
    id: item.id,
    name: item.name,
    code: item.materialCode,
    lot: item.lotNumber,
    expiry: item.expiryDate
  });

  const handlePrint = () => {
    const canvas = document.getElementById('qr-canvas') as HTMLCanvasElement;
    if (!canvas) return;
    const url = canvas.toDataURL();
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <html>
        <head>
          <title>Print QR Code - ${item.name}</title>
          <style>
            @page { 
              size: 70mm 50mm; 
              margin: 0; 
            }
            * { -webkit-print-color-adjust: exact; box-sizing: border-box; }
            body { 
              margin: 0; 
              padding: 0;
              background: white;
              font-family: 'Inter', -apple-system, sans-serif;
            }
            .label-page {
              width: 70mm; 
              height: 50mm; 
              padding: 5mm; 
              display: flex; 
              align-items: center; 
              gap: 6mm; 
              overflow: hidden;
            }
            .qr-container { 
              width: 35mm;
              height: 35mm;
              flex-shrink: 0;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .qr-container img { 
              width: 100%; 
              height: 100%; 
              display: block; 
            }
            .info-container { 
              flex: 1;
              display: flex; 
              flex-direction: column; 
              justify-content: center; 
              min-width: 0;
            }
            .item-name {
              font-weight: 900;
              font-size: 14pt;
              line-height: 1.1;
              color: black;
              margin-bottom: 2mm;
              word-break: break-word;
              display: -webkit-box;
              -webkit-line-clamp: 2;
              -webkit-box-orient: vertical;
              overflow: hidden;
            }
            .item-detail {
              font-weight: 700;
              font-size: 10pt;
              color: #333;
              margin-bottom: 1mm;
            }
            .item-exp {
              font-weight: 900;
              font-size: 11pt;
              color: black;
              margin-top: 2mm;
              font-family: monospace;
            }
          </style>
        </head>
        <body onload="setTimeout(() => { window.print(); window.close(); }, 300)">
          <div class="label-page">
            <div class="qr-container">
              <img src="${url}" />
            </div>
            <div class="info-container">
              <div class="item-name">${item.name}</div>
              <div class="item-detail">Lot: ${item.lotNumber || '-'}</div>
              <div class="item-detail">Code: ${item.materialCode || '-'}</div>
              <div class="item-exp">EXP: ${item.expiryDate || '-'}</div>
            </div>
          </div>
        </body>
      </html>
    `);
    win.document.close();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden"
      >
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            <QrCode size={20} className="text-blue-600" />
            Cetak Label QR
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-6 flex flex-col items-center gap-6">
          <div className="p-4 bg-white border-2 border-slate-100 rounded-2xl shadow-inner">
            <QRCodeCanvas 
              id="qr-canvas"
              value={qrData} 
              size={180}
              level="H"
              includeMargin={false}
            />
          </div>
          <div className="text-center space-y-1 w-full px-2">
            <p className="font-bold text-slate-900 text-base leading-tight break-words line-clamp-3">{item.name}</p>
            <p className="text-sm text-slate-500 font-mono">Lot: {item.lotNumber || '-'}</p>
            <p className="text-sm text-slate-500 font-mono">Exp: {item.expiryDate || '-'}</p>
          </div>
          
          <div className="w-full bg-blue-50 p-4 rounded-2xl space-y-2">
            <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wider flex items-center gap-1">
              <Printer size={12} /> Tips Cetak SATO CG408:
            </p>
            <ul className="text-[10px] text-blue-600 space-y-1 list-disc pl-3">
              <li>Gunakan Kertas Label 70x50mm.</li>
              <li>Set <b>Margins: None</b> di dialog print browser.</li>
              <li>Aktifkan <b>Background Graphics</b>.</li>
              <li>Pastikan driver printer diset ke ukuran 70mm x 50mm.</li>
            </ul>
          </div>

          <button 
            onClick={handlePrint}
            className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
          >
            <Printer size={20} />
            Cetak Sekarang
          </button>
        </div>
      </motion.div>
    </div>
  );
};

const QRScannerModal = ({ onScan, onClose }: { onScan: (data: any) => void, onClose: () => void }) => {
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const onScanRef = useRef(onScan);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    let isMounted = true;
    let html5QrCode: Html5Qrcode | null = null;

    const startScanner = async (retryCount = 0) => {
      if (!isMounted) return;
      
      try {
        // Ensure the element exists
        const element = document.getElementById("reader");
        if (!element) {
          if (retryCount < 5) {
            setTimeout(() => startScanner(retryCount + 1), 200);
          }
          return;
        }

        html5QrCode = new Html5Qrcode("reader");
        scannerRef.current = html5QrCode;

        const config = { 
          fps: 10, 
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            const qrboxSize = Math.floor(minEdge * 0.7);
            return { width: qrboxSize, height: qrboxSize };
          }
        };

        await html5QrCode.start(
          { facingMode: "environment" },
          config,
          (decodedText) => {
            if (!isMounted) return;
            try {
              const data = JSON.parse(decodedText);
              onScanRef.current(data);
            } catch (e) {
              console.error("Invalid QR Code data", e);
            }
          },
          () => {} // Ignore scan errors
        );
      } catch (err: any) {
        if (!isMounted) return;
        
        // If it's a NotReadableError, retry once after a short delay
        if ((err.name === 'NotReadableError' || err.message?.includes('video source')) && retryCount < 3) {
          console.warn(`Camera busy, retrying... (${retryCount + 1})`);
          setTimeout(() => startScanner(retryCount + 1), 500);
          return;
        }

        console.error("Error starting camera:", err);
        let userMessage = "Gagal mengakses kamera.";
        if (err.name === 'NotAllowedError') {
          userMessage = "Izin kamera ditolak. Silakan berikan izin akses kamera di pengaturan browser Anda.";
        } else if (err.name === 'NotFoundError') {
          userMessage = "Kamera tidak ditemukan pada perangkat ini.";
        } else if (err.name === 'NotReadableError' || err.message?.includes('video source')) {
          userMessage = "Kamera sedang digunakan oleh aplikasi lain atau tidak dapat dimulai. Silakan tutup aplikasi lain yang menggunakan kamera dan coba lagi.";
        }
        setError(userMessage);
      }
    };

    // Small delay to allow DOM to settle and previous camera sessions to close
    const timer = setTimeout(() => {
      startScanner();
    }, 300);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      if (html5QrCode) {
        const scanner = html5QrCode;
        if (scanner.isScanning) {
          scanner.stop().then(() => {
            try { scanner.clear(); } catch (e) {}
          }).catch(err => {
            console.error("Failed to stop scanner on cleanup", err);
          });
        } else {
          try { scanner.clear(); } catch (e) {}
        }
      }
    };
  }, []); // Only run on mount

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden"
      >
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            <Maximize size={20} className="text-blue-600" />
            Scan QR Code Bahan
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-6">
          {!window.isSecureContext && (
            <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
              <AlertCircle className="text-amber-600 shrink-0" size={20} />
              <div className="text-sm text-amber-800">
                <p className="font-bold">Kamera Tidak Tersedia</p>
                <p>Akses kamera memerlukan koneksi aman (HTTPS). Silakan buka aplikasi di tab baru atau pastikan Anda menggunakan HTTPS.</p>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
              <AlertTriangle className="text-red-600 shrink-0" size={20} />
              <div className="text-sm text-red-800">
                <p className="font-bold">Error Kamera</p>
                <p>{error}</p>
                <button 
                  onClick={() => window.location.reload()}
                  className="mt-2 text-red-700 font-bold underline"
                >
                  Muat Ulang Halaman
                </button>
              </div>
            </div>
          )}

          <div className="relative aspect-square overflow-hidden rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50">
            <div id="reader" className="w-full h-full" />
            {!error && !scannerRef.current?.isScanning && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-2 bg-slate-50">
                <RefreshCw className="animate-spin" size={24} />
                <p className="text-xs">Menghubungkan ke kamera...</p>
              </div>
            )}
          </div>
          
          <p className="mt-4 text-center text-sm text-slate-500">
            Arahkan kamera ke QR Code yang ada pada kemasan bahan.
          </p>
        </div>
      </motion.div>
    </div>
  );
};

const BulkUpdateModal = ({ 
  isOpen, 
  onClose, 
  onUpdate, 
  selectedCount,
  location 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onUpdate: (updates: any) => void;
  selectedCount: number;
  location: 'warehouse' | 'lab';
}) => {
  const [updates, setUpdates] = useState<any>({});
  const [activeFields, setActiveFields] = useState<string[]>([]);

  if (!isOpen) return null;

  const toggleField = (field: string) => {
    if (activeFields.includes(field)) {
      setActiveFields(activeFields.filter(f => f !== field));
      const newUpdates = { ...updates };
      delete newUpdates[field];
      setUpdates(newUpdates);
    } else {
      setActiveFields([...activeFields, field]);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden"
      >
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h3 className="text-xl font-bold text-slate-900">Bulk Update Stock</h3>
            <p className="text-xs text-slate-500 font-medium">{selectedCount} items selected for update</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-200 rounded-full transition-colors">
            <X size={24} />
          </button>
        </div>
        
        <div className="p-6 max-h-[70vh] overflow-y-auto space-y-6 custom-scrollbar">
          <div className="grid grid-cols-1 gap-4">
            {/* Min Stock Field */}
            <div className={cn(
              "flex items-start gap-3 p-4 rounded-2xl border transition-all",
              activeFields.includes('minStock') ? "border-blue-200 bg-blue-50/30" : "border-slate-100 bg-white"
            )}>
              <input 
                type="checkbox" 
                checked={activeFields.includes('minStock')}
                onChange={() => toggleField('minStock')}
                className="mt-1 w-5 h-5 rounded-lg border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <div className="flex-1 space-y-1.5">
                <label className="text-sm font-bold text-slate-700">Minimum Stock Level</label>
                <input 
                  type="number"
                  disabled={!activeFields.includes('minStock')}
                  value={updates.minStock || ''}
                  onChange={(e) => setUpdates({...updates, minStock: parseFloat(e.target.value)})}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-slate-50 disabled:opacity-50 text-sm font-medium"
                  placeholder="Enter new min stock..."
                />
              </div>
            </div>

            {/* Lab Type / Location Reassignment */}
            <div className={cn(
              "flex items-start gap-3 p-4 rounded-2xl border transition-all",
              activeFields.includes('labType') ? "border-blue-200 bg-blue-50/30" : "border-slate-100 bg-white"
            )}>
              <input 
                type="checkbox" 
                checked={activeFields.includes('labType')}
                onChange={() => toggleField('labType')}
                className="mt-1 w-5 h-5 rounded-lg border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <div className="flex-1 space-y-1.5">
                <label className="text-sm font-bold text-slate-700">Reassign to Lab</label>
                <select 
                  disabled={!activeFields.includes('labType')}
                  value={updates.labType || ''}
                  onChange={(e) => setUpdates({...updates, labType: e.target.value})}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-slate-50 disabled:opacity-50 text-sm font-bold text-slate-700"
                >
                  <option value="">Select Lab...</option>
                  <option value="udara">Lab Udara</option>
                  <option value="air">Lab Air</option>
                  <option value="b3_tanah">Lab B3 & Tanah</option>
                  <option value="mikrobiologi">Lab Mikrobiologi</option>
                  <option value="general">General / Umum</option>
                </select>
              </div>
            </div>

            {/* Category Field */}
            <div className={cn(
              "flex items-start gap-3 p-4 rounded-2xl border transition-all",
              activeFields.includes('category') ? "border-blue-200 bg-blue-50/30" : "border-slate-100 bg-white"
            )}>
              <input 
                type="checkbox" 
                checked={activeFields.includes('category')}
                onChange={() => toggleField('category')}
                className="mt-1 w-5 h-5 rounded-lg border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <div className="flex-1 space-y-1.5">
                <label className="text-sm font-bold text-slate-700">Category</label>
                <select 
                  disabled={!activeFields.includes('category')}
                  value={updates.category || ''}
                  onChange={(e) => setUpdates({...updates, category: e.target.value})}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-slate-50 disabled:opacity-50 text-sm font-bold text-slate-700"
                >
                  <option value="">Select Category...</option>
                  <option value="Bahan">Bahan</option>
                  <option value="Reagent">Reagent</option>
                  <option value="Media">Media</option>
                  <option value="Standard">Standard</option>
                  <option value="Consumable">Consumable</option>
                </select>
              </div>
            </div>

            {/* Brand Field */}
            <div className={cn(
              "flex items-start gap-3 p-4 rounded-2xl border transition-all",
              activeFields.includes('brand') ? "border-blue-200 bg-blue-50/30" : "border-slate-100 bg-white"
            )}>
              <input 
                type="checkbox" 
                checked={activeFields.includes('brand')}
                onChange={() => toggleField('brand')}
                className="mt-1 w-5 h-5 rounded-lg border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <div className="flex-1 space-y-1.5">
                <label className="text-sm font-bold text-slate-700">Brand / Merek</label>
                <input 
                  type="text"
                  disabled={!activeFields.includes('brand')}
                  value={updates.brand || ''}
                  onChange={(e) => setUpdates({...updates, brand: e.target.value})}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-slate-50 disabled:opacity-50 text-sm font-medium"
                  placeholder="Enter new brand..."
                />
              </div>
            </div>

            {/* Unit Field */}
            <div className={cn(
              "flex items-start gap-3 p-4 rounded-2xl border transition-all",
              activeFields.includes('unit') ? "border-blue-200 bg-blue-50/30" : "border-slate-100 bg-white"
            )}>
              <input 
                type="checkbox" 
                checked={activeFields.includes('unit')}
                onChange={() => toggleField('unit')}
                className="mt-1 w-5 h-5 rounded-lg border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <div className="flex-1 space-y-1.5">
                <label className="text-sm font-bold text-slate-700">Packaging Unit</label>
                <input 
                  type="text"
                  disabled={!activeFields.includes('unit')}
                  value={updates.unit || ''}
                  onChange={(e) => setUpdates({...updates, unit: e.target.value})}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-slate-50 disabled:opacity-50 text-sm font-medium"
                  placeholder="e.g. Pack, Pcs, Botol"
                />
              </div>
            </div>

            {/* Location Field */}
            <div className={cn(
              "flex items-start gap-3 p-4 rounded-2xl border transition-all",
              activeFields.includes('location') ? "border-blue-200 bg-blue-50/30" : "border-slate-100 bg-white"
            )}>
              <input 
                type="checkbox" 
                checked={activeFields.includes('location')}
                onChange={() => toggleField('location')}
                className="mt-1 w-5 h-5 rounded-lg border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <div className="flex-1 space-y-1.5">
                <label className="text-sm font-bold text-slate-700">Physical Location</label>
                <select 
                  disabled={!activeFields.includes('location')}
                  value={updates.location || ''}
                  onChange={(e) => setUpdates({...updates, location: e.target.value})}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-slate-50 disabled:opacity-50 text-sm font-bold text-slate-700"
                >
                  <option value="">Select Location...</option>
                  <option value="warehouse">Warehouse (Gudang)</option>
                  <option value="lab">Laboratory (Lab)</option>
                </select>
              </div>
            </div>
          </div>

          <div className="pt-4 flex gap-3 sticky bottom-0 bg-white pb-2">
            <button 
              onClick={onClose}
              className="flex-1 py-3 px-4 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-all border border-slate-200"
            >
              Cancel
            </button>
            <button 
              disabled={activeFields.length === 0}
              onClick={() => onUpdate(updates)}
              className="flex-1 py-3 px-4 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 disabled:opacity-50 disabled:shadow-none"
            >
              Update {selectedCount} Items
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

// --- Components ---

interface AppSettingsData {
  appName: string;
  appLogo: string;
  loginBackground: string;
  themeColor: string;
  loginTitle: string;
  loginSubtitle: string;
  loginWelcomeText: string;
  loginWelcomeSubtext: string;
  sidebarLabTitle: string;
  sidebarBackground: string;
  labNames: {
    udara: string;
    air: string;
    b3_tanah: string;
    mikrobiologi: string;
  };
  rolePermissions: Record<UserRole, string[]>;
}

const DEFAULT_SETTINGS: AppSettingsData = {
  appName: 'LabInfo LIMS',
  appLogo: '',
  loginBackground: 'https://images.unsplash.com/photo-1581093588401-fbb62a02f120?auto=format&fit=crop&q=80&w=2070',
  themeColor: '#2563eb',
  loginTitle: 'LabInfo LIMS',
  loginSubtitle: 'Laboratory Information Management System. Please sign in to access the system.',
  loginWelcomeText: 'Welcome Back',
  loginWelcomeSubtext: 'Please enter your details to sign in.',
  sidebarLabTitle: 'Laboratory',
  sidebarBackground: '',
  labNames: {
    udara: 'Lab Udara',
    air: 'Lab Air',
    b3_tanah: 'Lab B3 & Tanah',
    mikrobiologi: 'Lab Mikrobiologi'
  },
  rolePermissions: {
    admin: ['dashboard', 'lab', 'stock_lab', 'stock_warehouse', 'master_data', 'purchasing', 'settings', 'sampling_admin', 'sampling_officer', 'login_team', 'analyst_lab'],
    warehouse_manager: ['dashboard', 'stock_warehouse', 'master_data'],
    purchasing: ['dashboard', 'purchasing'],
    analyst: ['dashboard', 'lab', 'stock_lab', 'settings'],
    sampling_admin: ['dashboard', 'sampling_admin', 'settings'],
    sampling_officer: ['dashboard', 'sampling_officer', 'settings'],
    login_team: ['dashboard', 'login_team', 'lab', 'settings']
  }
};

const PhotoCaptureModal = ({ onClose, onCapture }: { onClose: () => void; onCapture: (photo: string) => void }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  const startCamera = async (retryCount = 0) => {
    if (isStarting) return;
    setIsStarting(true);
    setError(null);
    try {
      // Stop any existing stream first
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }

      let s: MediaStream;
      try {
        s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      } catch (e) {
        // Fallback to any video source
        s = await navigator.mediaDevices.getUserMedia({ video: true });
      }
      setStream(s);
      if (videoRef.current) {
        videoRef.current.srcObject = s;
      }
    } catch (err: any) {
      // Retry logic for busy camera
      if ((err.name === 'NotReadableError' || err.message?.includes('video source')) && retryCount < 3) {
        console.warn(`Camera busy, retrying capture... (${retryCount + 1})`);
        setIsStarting(false);
        setTimeout(() => startCamera(retryCount + 1), 500);
        return;
      }

      console.error('Error accessing camera:', err);
      let userMessage = 'Gagal mengakses kamera. Pastikan izin diberikan.';
      if (err.name === 'NotReadableError' || err.message?.includes('video source')) {
        userMessage = 'Kamera sedang digunakan oleh aplikasi lain. Silakan tutup aplikasi lain dan coba lagi.';
      }
      setError(userMessage);
    } finally {
      setIsStarting(false);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8); // Compress slightly
        setCapturedPhoto(dataUrl);
        stopCamera();
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCapturedPhoto(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUsePhoto = async () => {
    if (capturedPhoto) {
      setIsProcessing(true);
      try {
        await onCapture(capturedPhoto);
      } catch (err) {
        console.error('Error in onCapture:', err);
        setError('Gagal memproses foto. Silakan coba lagi.');
        setIsProcessing(false);
      }
    }
  };

  useEffect(() => {
    return () => stopCamera();
  }, [stream]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
      <canvas ref={canvasRef} className="hidden" />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white w-full max-w-md rounded-3xl overflow-hidden shadow-2xl"
      >
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-xl font-bold text-slate-900">Bukti Penerimaan</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {!capturedPhoto ? (
            <div className="space-y-4">
              {stream ? (
                <div className="relative aspect-video bg-black rounded-2xl overflow-hidden shadow-inner">
                  <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                  <button 
                    onClick={capturePhoto}
                    className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white p-4 rounded-full shadow-xl hover:scale-110 transition-transform"
                  >
                    <Camera size={24} className="text-blue-600" />
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  <button 
                    onClick={startCamera}
                    className="flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed border-slate-200 rounded-3xl hover:border-blue-400 hover:bg-blue-50 transition-all group"
                  >
                    <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl group-hover:bg-blue-100 transition-colors">
                      <Camera size={32} />
                    </div>
                    <div className="text-center">
                      <p className="font-bold text-slate-900">Gunakan Kamera</p>
                      <p className="text-xs text-slate-500">Ambil foto bukti secara langsung</p>
                    </div>
                  </button>

                  <label className="flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed border-slate-200 rounded-3xl hover:border-emerald-400 hover:bg-emerald-50 transition-all group cursor-pointer">
                    <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                    <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl group-hover:bg-emerald-100 transition-colors">
                      <ImageIcon size={32} />
                    </div>
                    <div className="text-center">
                      <p className="font-bold text-slate-900">Upload Foto</p>
                      <p className="text-xs text-slate-500">Pilih dari galeri perangkat</p>
                    </div>
                  </label>
                </div>
              )}
              {error && <p className="text-center text-rose-500 text-xs font-medium">{error}</p>}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="aspect-video bg-slate-100 rounded-2xl overflow-hidden border border-slate-200 shadow-inner">
                <img src={capturedPhoto} alt="Captured" className="w-full h-full object-cover" />
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => {
                    setCapturedPhoto(null);
                    startCamera();
                  }}
                  disabled={isProcessing}
                  className="flex-1 py-3 px-4 border border-slate-200 text-slate-600 font-bold rounded-2xl hover:bg-slate-50 transition-all disabled:opacity-50"
                >
                  Ulangi
                </button>
                <button 
                  onClick={handleUsePhoto}
                  disabled={isProcessing}
                  className="flex-1 py-3 px-4 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isProcessing ? (
                    <>
                      <RefreshCw size={18} className="animate-spin" />
                      Memproses...
                    </>
                  ) : (
                    'Gunakan Foto'
                  )}
                </button>
              </div>
              {error && <p className="text-center text-rose-500 text-xs font-medium">{error}</p>}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

const UserContext = React.createContext<{ 
  user: User | null; 
  profile: UserProfile | null;
  expiryThreshold: number;
  setExpiryThreshold: (val: number) => void;
  settings: AppSettingsData;
  refreshSettings: () => Promise<void>;
  notifications: AppNotification[];
  markNotificationAsRead: (id: string) => void;
  addNotification: (title: string, message: string, type: 'info' | 'warning' | 'error' | 'success') => void;
}>({ 
  user: null, 
  profile: null, 
  expiryThreshold: 30, 
  setExpiryThreshold: () => {},
  settings: DEFAULT_SETTINGS,
  refreshSettings: async () => {},
  notifications: [],
  markNotificationAsRead: () => {},
  addNotification: () => {}
});

const AuthGuard = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<AppSettingsData>(DEFAULT_SETTINGS);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [expiryThreshold, setExpiryThreshold] = useState(() => {
    const saved = localStorage.getItem('expiryThreshold');
    return saved ? parseInt(saved, 10) : 30;
  });

  const refreshSettings = async (retries = 3) => {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const fetchedSettings = await res.json();
        setSettings(prev => ({ ...prev, ...fetchedSettings }));
      } else {
        throw new Error(`Server responded with ${res.status}`);
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
      if (retries > 0) {
        console.log(`Retrying fetch settings... (${retries} retries left)`);
        setTimeout(() => refreshSettings(retries - 1), 2000);
      }
    }
  };

  useEffect(() => {
    // Give the server a moment to start up if it's currently syncing DB
    const timer = setTimeout(() => {
      refreshSettings();
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  // Fetch notifications (mock logic for low stock)
  useEffect(() => {
    const fetchNotifications = async (retries = 3) => {
      try {
        const res = await fetch('/api/stocks?limit=1000');
        if (res.ok) {
          const { data: stocks } = await res.json();
          const lowStockItems = stocks.filter((s: StockItem) => s.quantity <= (s.minStock || 5));
          
          const newNotifications: AppNotification[] = lowStockItems.map((item: StockItem) => ({
            id: `low-stock-${item.id}`,
            title: 'Stok Menipis',
            message: `${item.name} hanya tersisa ${item.quantity} ${item.unit}.`,
            type: 'warning',
            timestamp: new Date(),
            read: false,
            link: item.location === 'warehouse' ? '/stock/warehouse' : '/stock/lab'
          }));

          setNotifications(newNotifications);
        } else {
          throw new Error(`Server responded with ${res.status}`);
        }
      } catch (error) {
        console.error('Error fetching notifications:', error);
        if (retries > 0) {
          console.log(`Retrying fetch notifications... (${retries} retries left)`);
          setTimeout(() => fetchNotifications(retries - 1), 2000);
        }
      }
    };

    if (user) {
      fetchNotifications();
      const interval = setInterval(() => fetchNotifications(), 60000); // Check every minute
      return () => clearInterval(interval);
    }
  }, [user]);

  const markNotificationAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const addNotification = (title: string, message: string, type: 'info' | 'warning' | 'error' | 'success' = 'info') => {
    setNotifications(prev => [{
      id: Math.random().toString(36).substr(2, 9),
      title,
      message,
      type,
      timestamp: new Date(),
      read: false
    }, ...prev]);
  };

  useEffect(() => {
    localStorage.setItem('expiryThreshold', expiryThreshold.toString());
  }, [expiryThreshold]);

  useEffect(() => {
    document.title = settings.appName;
  }, [settings.appName]);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      if (u) {
        // Sync user with our backend
        const syncUser = async (retries = 3) => {
          try {
            const res = await fetch('/api/auth/sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                uid: u.uid,
                email: u.email,
                displayName: u.displayName || 'User',
              }),
            });
            if (res.ok) {
              const profileData = await res.json();
              setProfile(profileData);
            } else {
              console.error('Auth sync failed:', res.status);
            }
          } catch (error) {
            console.error('Error syncing auth:', error);
            if (retries > 0) {
              console.log(`Retrying auth sync... (${retries} retries left)`);
              setTimeout(() => syncUser(retries - 1), 2000);
            }
          }
        };
        syncUser();
        setUser(u);
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });
  }, []);

  if (loading) return (
    <div className="h-screen w-screen flex items-center justify-center bg-slate-50">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    </div>
  );

  return (
    <UserContext.Provider value={{ 
      user, 
      profile, 
      expiryThreshold, 
      setExpiryThreshold, 
      settings, 
      refreshSettings,
      notifications,
      markNotificationAsRead,
      addNotification
    }}>
      {!user ? <Login /> : children}
    </UserContext.Provider>
  );
};

const Login = () => {
  const { settings } = React.useContext(UserContext);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReset, setShowReset] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [regData, setRegData] = useState({ displayName: '', email: '', password: '' });

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      if (err.code === 'auth/invalid-credential') {
        setError('Email atau Password salah.');
      } else if (err.code === 'auth/user-not-found') {
        setError('Akun tidak ditemukan.');
      } else if (err.code === 'auth/wrong-password') {
        setError('Password salah.');
      } else {
        setError('Gagal masuk: ' + (err.message || 'Error tidak diketahui'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regData.displayName || !regData.email || !regData.password) {
      setError('Mohon isi semua bidang.');
      return;
    }
    if (regData.password.length < 6) {
      setError('Password minimal 6 karakter.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, regData.email, regData.password);
      // Update profile with display name
      const { updateProfile } = await import('firebase/auth');
      await updateProfile(userCredential.user, {
        displayName: regData.displayName
      });
      // Wait for Auth Sync useEffect to trigger automatically
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        setError('Email sudah digunakan.');
      } else if (err.code === 'auth/operation-not-allowed') {
        setError('Pendaftaran Email/Password belum diaktifkan di Firebase Console.');
      } else {
        setError('Gagal mendaftar: ' + (err.message || 'Error tidak diketahui'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await sendPasswordResetEmail(auth, resetEmail);
      setResetSent(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-50 overflow-hidden">
      {/* Left Side - Visual/Branding (Hidden on mobile) */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-slate-900">
        <motion.div 
          initial={{ scale: 1.1, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 1.5 }}
          className="absolute inset-0 z-0"
          style={{ 
            backgroundImage: `url(${settings.loginBackground})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/80 via-slate-900/60 to-slate-900/90 backdrop-blur-[2px]"></div>
        </motion.div>

        {/* Floating Elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...Array(6)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ 
                opacity: [0.1, 0.3, 0.1], 
                scale: [1, 1.2, 1],
                x: [0, Math.random() * 50 - 25, 0],
                y: [0, Math.random() * 50 - 25, 0]
              }}
              transition={{ 
                duration: 10 + Math.random() * 10, 
                repeat: Infinity,
                delay: i * 2
              }}
              className="absolute rounded-full bg-emerald-400/20 blur-3xl"
              style={{
                width: `${200 + Math.random() * 300}px`,
                height: `${200 + Math.random() * 300}px`,
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
              }}
            />
          ))}
        </div>

        <div className="relative z-10 flex flex-col justify-between p-16 w-full">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 }}
            className="flex items-center gap-3"
          >
            <div className={cn(
              "w-12 h-12 flex items-center justify-center",
              settings.appLogo ? "bg-transparent" : "bg-emerald-600 rounded-xl shadow-lg shadow-emerald-500/20"
            )}>
              {settings.appLogo ? (
                <img src={settings.appLogo} alt="Logo" className="w-full h-full object-contain" />
              ) : (
                <Beaker className="w-7 h-7 text-white" />
              )}
            </div>
            <span className="text-2xl font-bold text-white tracking-tight">{settings.appName}</span>
          </motion.div>

          <div className="max-w-lg">
            <motion.h2 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
              className="text-5xl font-bold text-white mb-6 leading-tight"
            >
              {settings.loginTitle}
            </motion.h2>
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9 }}
              className="text-xl text-slate-300 leading-relaxed"
            >
              {settings.loginSubtitle}
            </motion.p>
          </div>

          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.1 }}
            className="text-slate-500 text-sm"
          >
            &copy; {new Date().getFullYear()} {settings.appName}. All rights reserved.
          </motion.div>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-white lg:bg-slate-50">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md space-y-8"
        >
          <div className="lg:hidden text-center mb-8">
            <div className={cn(
              "w-16 h-16 flex items-center justify-center mx-auto mb-4",
              settings.appLogo ? "bg-transparent" : "bg-blue-600 rounded-2xl shadow-lg shadow-blue-500/20"
            )}>
              {settings.appLogo ? (
                <img src={settings.appLogo} alt="Logo" className="w-full h-full object-contain" />
              ) : (
                <Beaker className="w-8 h-8 text-white" />
              )}
            </div>
            <h1 className="text-2xl font-bold text-slate-900">{settings.appName}</h1>
          </div>

          <div className="space-y-2">
            <h3 className="text-2xl font-bold text-slate-900">{settings.loginWelcomeText}</h3>
            <p className="text-slate-500">{settings.loginWelcomeSubtext}</p>
          </div>

          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 bg-rose-50 border border-rose-100 text-rose-600 rounded-xl text-sm flex items-center gap-3"
            >
              <AlertCircle size={18} />
              {error}
            </motion.div>
          )}

          {!showReset ? (
            <>
              {!isRegister ? (
                <form onSubmit={handleEmailLogin} className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">Username / Email</label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                      <input 
                        type="email" 
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="admin@lims.com"
                        className="w-full pl-12 pr-4 py-3.5 rounded-2xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all bg-slate-50/50 focus:bg-white"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-sm font-bold text-slate-700">Password</label>
                      <button 
                        type="button"
                        onClick={() => setShowReset(true)}
                        className="text-xs font-bold text-emerald-600 hover:text-emerald-700 transition-colors"
                      >
                        Lupa Password?
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                      <input 
                        type={showPassword ? "text" : "password"} 
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-12 pr-12 py-3.5 rounded-2xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all bg-slate-50/50 focus:bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Masuk ke Sistem'}
                  </button>

                  <div className="text-center pt-2">
                    <button 
                      type="button"
                      onClick={() => setIsRegister(true)}
                      className="text-sm font-semibold text-slate-500 hover:text-emerald-600 transition-colors"
                    >
                      Belum punya akun? <span className="text-emerald-600 underline">Daftar sekarang</span>
                    </button>
                  </div>

              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200"></div>
                </div>
                <div className="relative flex justify-center text-xs uppercase tracking-widest font-bold">
                  <span className="px-4 bg-white lg:bg-slate-50 text-slate-400">Pilihan Lain</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 bg-white border border-slate-200 text-slate-600 py-3 px-6 rounded-2xl hover:bg-slate-50 hover:border-emerald-300 transition-all duration-300 font-semibold text-sm shadow-sm"
              >
                <img src="https://www.google.com/favicon.ico" alt="Google" className="w-4 h-4 grayscale opacity-70" />
                Masuk dengan Google
              </button>
            </form>
          ) : (
            <form onSubmit={handleEmailRegister} className="space-y-5">
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-slate-900">Buat Akun Baru</h3>
                <p className="text-sm text-slate-500">Mulai gunakan EnviroLIMS dengan mendaftar di bawah ini.</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Nama Lengkap</label>
                  <input 
                    type="text" 
                    required
                    value={regData.displayName}
                    onChange={(e) => setRegData({...regData, displayName: e.target.value})}
                    placeholder="Contoh: Budi Santoso"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Username / Email</label>
                  <input 
                    type="email" 
                    required
                    value={regData.email}
                    onChange={(e) => setRegData({...regData, email: e.target.value})}
                    placeholder="email@perusahaan.com"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Kata Sandi</label>
                  <input 
                    type="password" 
                    required
                    value={regData.password}
                    onChange={(e) => setRegData({...regData, password: e.target.value})}
                    placeholder="Min. 6 karakter"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-emerald-600 text-white py-4 rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                >
                  {loading ? 'Mendaftarkan...' : 'Daftar Sekarang'}
                </button>
              </div>

              <div className="text-center pt-2">
                <button 
                  type="button"
                  onClick={() => setIsRegister(false)}
                  className="text-sm font-bold text-slate-500 hover:text-emerald-600"
                >
                  Sudah punya akun? <span className="text-emerald-600 underline">Masuk di sini</span>
                </button>
              </div>
            </form>
          )}
        </>
      ) : (
            <form onSubmit={handleResetPassword} className="space-y-6">
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-slate-900">Reset Password</h3>
                <p className="text-sm text-slate-500">Enter your email and we'll send you a link to reset your password.</p>
              </div>

              {resetSent ? (
                <div className="p-4 bg-emerald-50 border border-emerald-100 text-emerald-600 rounded-xl text-sm">
                  Reset link sent! Please check your email inbox.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">Email Address</label>
                    <input 
                      type="email" 
                      required
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      placeholder="name@company.com"
                      className="w-full px-4 py-3.5 rounded-2xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-slate-50/50 focus:bg-white"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50"
                  >
                    {loading ? 'Sending...' : 'Send Reset Link'}
                  </button>
                </div>
              )}

              <button 
                type="button"
                onClick={() => {
                  setShowReset(false);
                  setResetSent(false);
                }}
                className="w-full text-center text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors"
              >
                Back to Login
              </button>
            </form>
          )}

          <div className="lg:hidden pt-8 text-center">
            <p className="text-slate-400 text-xs">
              &copy; {new Date().getFullYear()} {settings.appName}. All rights reserved.
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

const Sidebar = ({ isOpen, setIsOpen }: { isOpen: boolean, setIsOpen: (open: boolean) => void }) => {
  const { profile, settings } = React.useContext(UserContext);
  const location = useLocation();
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [labMenuOpen, setLabMenuOpen] = useState(true);

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      setWindowWidth(width);
      if (width > 1024) setIsOpen(true);
      else setIsOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [setIsOpen]);

  // Close sidebar on mobile when navigating
  useEffect(() => {
    if (window.innerWidth <= 1024) setIsOpen(false);
  }, [location.pathname, setIsOpen]);

  const labItems = [
    { name: settings.labNames.udara, icon: Wind, path: '/lab/udara', id: 'lab' },
    { name: settings.labNames.air, icon: Droplets, path: '/lab/air', id: 'lab' },
    { name: settings.labNames.b3_tanah, icon: Trash2, path: '/lab/b3_tanah', id: 'lab' },
    { name: settings.labNames.mikrobiologi, icon: Microscope, path: '/lab/mikrobiologi', id: 'lab' },
  ];

  const allMenuItems = [
    { name: 'Overview', icon: LayoutDashboard, path: '/', id: 'dashboard' },
    { name: 'Admin Sampling', icon: ClipboardList, path: '/sampling/admin', id: 'sampling_admin' },
    { name: 'Tugas Sampling', icon: Briefcase, path: '/sampling/officer', id: 'sampling_officer' },
    { name: 'Penerimaan Lab', icon: Scan, path: '/lab/login', id: 'login_team' },
    { 
      name: settings.sidebarLabTitle, 
      icon: Microscope, 
      isSubMenu: true,
      isOpen: labMenuOpen,
      setIsOpen: setLabMenuOpen,
      items: labItems,
      id: 'lab'
    },
    { name: 'Stock Lab', icon: Package, path: '/stock/lab', id: 'stock_lab' },
    { name: 'Stock Warehouse', icon: Warehouse, path: '/stock/warehouse', id: 'stock_warehouse' },
    { name: 'Usage Reports', icon: TrendingUp, path: '/reports', id: 'reports' },
    { name: 'Purchasing', icon: ShoppingCart, path: '/purchasing', id: 'purchasing' },
    { name: 'Settings', icon: Settings, path: '/settings', id: 'settings' },
  ];

  const allowedMenus = profile ? (profile.permissions && profile.permissions.length > 0 ? profile.permissions : settings.rolePermissions[profile.role] || []) : [];
  const menuItems = allMenuItems.filter(item => allowedMenus.includes(item.id));

  return (
    <>
      {/* Mobile Bottom Nav */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-xl border-t border-slate-200 px-2 py-2 flex items-center justify-around shadow-[0_-10px_30px_rgba(0,0,0,0.05)]">
        {menuItems.filter((item: any) => !item.isSubMenu).slice(0, 4).map((item: any) => {
          const isActive = location.pathname === item.path;
          
          return (
            <Link 
              key={item.id || item.name} 
              to={item.path || '#'}
              className="flex-1 flex flex-col items-center gap-1 relative group min-w-0"
            >
              <motion.div
                whileTap={{ scale: 0.9 }}
                className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
                  isActive ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30" : "text-slate-400 hover:text-slate-600"
                )}
              >
                <item.icon size={20} />
              </motion.div>
              <span className={cn(
                "text-[8px] sm:text-[9px] font-bold uppercase tracking-wider text-center w-full truncate px-1 transition-all",
                isActive ? "text-blue-600" : "text-slate-400"
              )}>
                {item.name}
              </span>
            </Link>
          );
        })}
        <button 
          onClick={() => setIsOpen(true)}
          className="flex-1 flex flex-col items-center gap-1 text-slate-400 min-w-0"
        >
          <div className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-slate-100 transition-all">
            <Menu size={20} />
          </div>
          <span className="text-[8px] sm:text-[9px] font-bold uppercase tracking-wider text-center w-full">
            Menu
          </span>
        </button>
      </div>

      {/* Mobile Overlay */}
      <AnimatePresence>
        {isOpen && window.innerWidth <= 1024 && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] lg:hidden"
            onClick={() => setIsOpen(false)}
          />
        )}
      </AnimatePresence>

      <motion.aside 
        initial={false}
        animate={{ 
          x: isOpen ? 0 : -300,
          opacity: isOpen ? 1 : 0,
          width: windowWidth > 1024 ? 280 : (isOpen ? '85%' : 0)
        }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className={cn(
          "h-screen bg-white flex flex-col overflow-hidden fixed lg:sticky top-0 z-[70] border-r border-slate-200/60 shadow-2xl lg:shadow-none",
          windowWidth <= 1024 && "rounded-r-[40px]"
        )}
      >
        {settings.sidebarBackground && (
          <img 
            src={settings.sidebarBackground} 
            alt="Sidebar Background" 
            className="absolute inset-0 w-full h-full object-cover opacity-[0.08] pointer-events-none" 
          />
        )}
        <div className="relative z-10 flex flex-col h-full">
          <div className="p-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              "flex items-center justify-center min-w-[40px] min-h-[40px]",
              settings.appLogo ? "bg-transparent" : "shadow-lg shadow-blue-500/20 rounded-xl bg-blue-600",
            )}>
              {settings.appLogo ? (
                <img src={settings.appLogo} alt="Logo" className="w-8 h-8 object-contain" />
              ) : (
                <Microscope className="text-white" size={20} />
              )}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-base font-black text-slate-900 whitespace-nowrap overflow-hidden text-ellipsis tracking-tight leading-tight uppercase">{settings.appName}</span>
            </div>
          </div>
          <button 
            onClick={() => setIsOpen(false)}
            className="lg:hidden p-2 text-slate-400 hover:text-slate-900"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 px-4 space-y-1 overflow-y-auto custom-scrollbar py-2">
          {menuItems.map((item: any) => {
            if (item.isSubMenu) {
              const isAnyChildActive = item.items.some((child: any) => location.pathname === child.path);
              return (
                <div key={item.name} className="space-y-1">
                  <button
                    onClick={() => item.setIsOpen(!item.isOpen)}
                    className={cn(
                      "w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all group whitespace-nowrap",
                      isAnyChildActive ? "text-blue-600 bg-blue-50/50" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <item.icon size={18} className={cn(isAnyChildActive ? "text-blue-600" : "text-slate-400 group-hover:text-slate-600")} />
                      <span className="font-semibold text-sm tracking-tight">{item.name}</span>
                    </div>
                    {item.isOpen ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
                  </button>
                  
                  <AnimatePresence>
                    {item.isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden pl-4 space-y-1"
                      >
                        {item.items.map((child: any) => {
                          const isActive = location.pathname === child.path;
                          return (
                            <Link 
                              key={child.path}
                              to={child.path}
                              className={cn(
                                "flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all group whitespace-nowrap text-xs relative",
                                isActive ? "text-blue-600 bg-blue-50/50" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                              )}
                            >
                              {isActive && (
                                <motion.div 
                                  layoutId="sidebarActive"
                                  className="absolute left-0 w-1 h-4 bg-blue-600 rounded-full"
                                />
                              )}
                              <child.icon size={14} className={cn(isActive ? "text-blue-600" : "text-slate-400 group-hover:text-slate-600")} />
                              <span className="font-semibold uppercase tracking-wider">{child.name}</span>
                            </Link>
                          );
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            }

            const isActive = location.pathname === item.path;
            return (
              <Link 
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl transition-all group whitespace-nowrap text-sm relative",
                  isActive ? "text-blue-600 bg-blue-50/50" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                {isActive && (
                  <motion.div 
                    layoutId="sidebarActive"
                    className="absolute left-0 w-1 h-6 bg-blue-600 rounded-full"
                  />
                )}
                <item.icon size={18} className={cn(isActive ? "text-blue-600" : "text-slate-400 group-hover:text-slate-600")} />
                <span className="font-semibold tracking-tight">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-100">
          <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100 group">
            <div className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-900 font-black text-sm shadow-sm">
              {profile?.displayName?.charAt(0) || 'U'}
            </div>
            <div className="flex flex-col min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate leading-tight">{profile?.displayName || 'User'}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">{profile?.role?.replace('_', ' ') || 'Staff'}</p>
            </div>
            <button 
              onClick={() => signOut(auth)}
              className="ml-auto p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
              title="Logout"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </div>
    </motion.aside>
    </>
  );
};

const Topbar = ({ onMenuClick }: { onMenuClick: () => void }) => {
  const { profile, settings, notifications, markNotificationAsRead } = React.useContext(UserContext);
  const [showNotifications, setShowNotifications] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter(n => !n.read).length;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="h-20 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 sticky top-0 z-40 px-6 lg:px-10 flex items-center justify-between">
      <div className="flex items-center gap-4 flex-1">
        <div className="hidden md:flex items-center gap-3 bg-slate-100/50 border border-slate-200/60 px-4 py-2 rounded-2xl w-full max-w-md group focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
          <Search size={18} className="text-slate-400 group-focus-within:text-blue-500 transition-colors" />
          <input 
            type="text" 
            placeholder="Search reagents, lots, or reports..." 
            className="bg-transparent border-none outline-none text-sm font-medium text-slate-900 w-full placeholder:text-slate-400"
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-slate-200 bg-white text-[10px] font-bold text-slate-400">
            <span className="text-xs">⌘</span>K
          </kbd>
        </div>
      </div>

      <div className="flex items-center gap-2 lg:gap-4">
        <div className="relative" ref={notificationRef}>
          <button 
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2.5 text-slate-500 hover:bg-slate-100 rounded-xl transition-all relative group"
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className="absolute top-2.5 right-2.5 w-4 h-4 bg-rose-500 border-2 border-white rounded-full text-[10px] text-white font-bold flex items-center justify-center">
                {unreadCount}
              </span>
            )}
            <span className="absolute -bottom-10 left-1/2 -translate-x-1/2 px-2 py-1 bg-slate-900 text-white text-[10px] font-bold rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
              Notifications
            </span>
          </button>

          <AnimatePresence>
            {showNotifications && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute -right-6 sm:right-0 mt-2 w-[calc(100vw-2rem)] sm:w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-50"
              >
                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <h3 className="font-bold text-slate-900">Notifications</h3>
                  <span className="text-[10px] font-black bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full uppercase tracking-wider">
                    {unreadCount} New
                  </span>
                </div>
                <div className="max-h-[400px] overflow-y-auto">
                  {notifications.length > 0 ? (
                    notifications.map((n) => (
                      <div 
                        key={n.id}
                        onClick={() => markNotificationAsRead(n.id)}
                        className={cn(
                          "p-4 border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-pointer relative",
                          !n.read && "bg-blue-50/30"
                        )}
                      >
                        {!n.read && <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500" />}
                        <div className="flex gap-3">
                          <div className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                            n.type === 'warning' ? "bg-amber-100 text-amber-600" : "bg-blue-100 text-blue-600"
                          )}>
                            {n.type === 'warning' ? <AlertTriangle size={16} /> : <Info size={16} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-900 leading-tight mb-1">{n.title}</p>
                            <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{n.message}</p>
                            <p className="text-[10px] text-slate-400 mt-2 font-medium">
                              {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-8 text-center">
                      <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <Bell size={20} className="text-slate-400" />
                      </div>
                      <p className="text-sm font-medium text-slate-500">No new notifications</p>
                    </div>
                  )}
                </div>
                {notifications.length > 0 && (
                  <div className="p-3 bg-slate-50 border-t border-slate-100 text-center">
                    <button className="text-[11px] font-bold text-blue-600 hover:underline">
                      View All Activity
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="h-8 w-[1px] bg-slate-200 mx-2 hidden sm:block" />

        <div className="flex items-center gap-3 pl-2 group cursor-pointer">
          <div className="flex flex-col items-end hidden sm:flex">
            <p className="text-sm font-bold text-slate-900 leading-none">{profile?.displayName || 'User'}</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{profile?.role?.replace('_', ' ') || 'Staff'}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-black text-sm shadow-lg shadow-blue-500/20 group-hover:scale-105 transition-transform">
            {profile?.displayName?.charAt(0) || 'U'}
          </div>
        </div>
      </div>
    </header>
  );
};

const Dashboard = () => {
  const { profile } = React.useContext(UserContext);
  const navigate = React.useMemo(() => (path: string) => window.location.pathname = path, []);
  /* Auto-redirect based on role if they hit the main dashboard */
  React.useEffect(() => {
    if (!profile) return;
    if (profile.role === 'sampling_officer') window.location.pathname = '/sampling/officer';
    if (profile.role === 'sampling_admin') window.location.pathname = '/sampling/admin';
    if (profile.role === 'login_team') window.location.pathname = '/lab/login';
  }, [profile]);

  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [dailyUses, setDailyUses] = useState<DailyUse[]>([]);
  const [samples, setSamples] = useState<LabSample[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vitals, setVitals] = useState({
    inField: 0,
    waitingLogin: 0,
    labProgress: 0
  });

  useEffect(() => {
    const unsubJobs = onSnapshot(collection(db, 'sampling_jobs'), (snap) => {
      const docs = snap.docs.map(d => d.data());
      setVitals(prev => ({
        ...prev,
        inField: docs.filter(d => d.status === 'IN_FIELD').length,
        waitingLogin: docs.filter(d => d.status === 'SUBMITTED').length
      }));
    });

    const unsubSamples = onSnapshot(collection(db, 'app_samples'), (snap) => {
      const docs = snap.docs.map(d => d.data());
      setVitals(prev => ({
        ...prev,
        labProgress: docs.filter(d => d.status === 'IN_PROGRESS').length
      }));
    });

    return () => { unsubJobs(); unsubSamples(); };
  }, []);

  const fetchData = async (retries = 3) => {
    try {
      setLoading(true);
      setError(null);
      const endpoints = [
        { name: 'Stocks', url: '/api/stocks?limit=1000' },
        { name: 'Requisitions', url: '/api/requisitions?limit=1000' },
        { name: 'Daily Use', url: '/api/daily-use?limit=1000' },
        { name: 'Samples', url: '/api/samples?limit=1000' }
      ];

      const responses = await Promise.all(endpoints.map(e => fetch(e.url)));
      
      const results = await Promise.all(responses.map(async (res, i) => {
        if (!res.ok) throw new Error(`${endpoints[i].name} API failed`);
        return res.json();
      }));

      setStocks(results[0].data || []);
      setRequisitions(results[1].data || []);
      setDailyUses(results[2].data || []);
      setSamples(results[3].data || []);
    } catch (error: any) {
      console.error('Error fetching dashboard data:', error);
      if (retries > 0) {
        console.log(`Retrying fetch dashboard data... (${retries} retries left)`);
        setTimeout(() => fetchData(retries - 1), 2000);
      } else {
        setError(error.message || 'Gagal mengambil data dashboard');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const lowStockItems = stocks.filter(s => s.quantity <= (s.minStock || 5));
  
  const stats = [
    { 
      name: 'Total Item Stok', 
      value: stocks.length, 
      icon: Package, 
      color: 'text-blue-600', 
      bg: 'bg-blue-50',
      trend: '+12%',
      trendUp: true,
      description: 'Total reagents across all labs'
    },
    { 
      name: 'Stok Menipis', 
      value: lowStockItems.length, 
      icon: AlertTriangle, 
      color: 'text-orange-600', 
      bg: 'bg-orange-50',
      trend: '-2',
      trendUp: false,
      description: 'Items below minimum threshold'
    },
    { 
      name: 'Total Sampel', 
      value: samples.length, 
      icon: Microscope, 
      color: 'text-indigo-600', 
      bg: 'bg-indigo-50',
      trend: '+5%',
      trendUp: true,
      description: 'Active samples being processed'
    },
    { 
      name: 'Total Penggunaan', 
      value: dailyUses.length, 
      icon: TrendingUp, 
      color: 'text-emerald-600', 
      bg: 'bg-emerald-50',
      trend: '+18%',
      trendUp: true,
      description: 'Reagent usage in last 30 days'
    },
  ];

  const labStockData = [
    { name: 'Udara', value: stocks.filter(s => s.labType === 'udara').length },
    { name: 'Air', value: stocks.filter(s => s.labType === 'air').length },
    { name: 'B3/Tanah', value: stocks.filter(s => s.labType === 'b3_tanah').length },
    { name: 'Mikro', value: stocks.filter(s => s.labType === 'mikrobiologi').length },
    { name: 'Gudang', value: stocks.filter(s => s.location === 'warehouse').length },
  ];

  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return d.toISOString().split('T')[0];
  }).reverse();

  const usageTrendData = last7Days.map(date => ({
    date: new Date(date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
    count: dailyUses.filter(u => u.date.startsWith(date)).length
  }));

  const insights = [
    { 
      text: stocks.filter(s => s.location === 'warehouse').length > stocks.filter(s => s.location === 'lab').length 
        ? "Gudang memiliki stok terbanyak saat ini." 
        : "Lab memiliki perputaran stok yang tinggi.",
      icon: Zap,
      color: 'text-amber-500'
    },
    { 
      text: `Terdapat ${lowStockItems.length} item yang perlu segera di-restock.`,
      icon: AlertCircle,
      color: 'text-rose-500'
    },
    { 
      text: "Penggunaan reagent meningkat 12% minggu ini.",
      icon: TrendingUp,
      color: 'text-emerald-500'
    }
  ];

  if (loading && !stocks.length) return (
    <div className="space-y-8">
      <div className="h-10 w-64 bg-slate-200 animate-pulse rounded-lg" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-32 bg-white rounded-[20px] border border-slate-200 animate-pulse" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="h-[400px] bg-white rounded-[20px] border border-slate-200 animate-pulse" />
        <div className="h-[400px] bg-white rounded-[20px] border border-slate-200 animate-pulse" />
      </div>
    </div>
  );

  const DashboardStat = ({ title, value, sub, icon: Icon, color, trend }: any) => {
    const variants: any = {
      blue: "bg-blue-50 text-blue-600 border-blue-100 shadow-blue-500/5",
      emerald: "bg-emerald-50 text-emerald-600 border-emerald-100 shadow-emerald-500/5",
      amber: "bg-amber-50 text-amber-600 border-amber-100 shadow-amber-500/5",
      rose: "bg-rose-50 text-rose-600 border-rose-100 shadow-rose-500/5"
    };
    return (
      <motion.div 
        whileHover={{ y: -5 }}
        className={cn("p-6 rounded-[32px] border shadow-sm transition-all bg-white flex flex-col justify-between h-full", variants[color])}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="p-2 rounded-xl bg-white shadow-sm">
             <Icon size={20} />
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest opacity-60 italic">{trend}</span>
        </div>
        <div>
           <h4 className="text-3xl font-black text-slate-900 leading-none mb-1">{value}</h4>
           <p className="text-xs font-bold text-slate-600 uppercase tracking-tight">{title}</p>
           <p className="text-[10px] text-slate-400 font-medium italic mt-2">{sub}</p>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="space-y-10 pb-10">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="relative z-10">
          <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase mb-1">Operational Command</h1>
          <p className="text-slate-500 font-medium italic">Sistem Monitoring Terpadu: Lapangan, Laboratorium, dan Inventaris.</p>
        </div>
        <div className="hidden lg:flex items-center gap-4 relative z-10 bg-slate-50 p-2 rounded-2xl border border-slate-100">
           <div className="flex -space-x-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="w-8 h-8 rounded-full border-2 border-white bg-blue-100 flex items-center justify-center text-[10px] font-black text-blue-600">
                  U{i}
                </div>
              ))}
           </div>
           <div className="h-8 w-px bg-slate-200 mx-2" />
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <div className="absolute top-0 right-0 p-8 text-blue-50 opacity-10 pointer-events-none">
           <LayoutDashboard className="w-32 h-32" />
        </div>
      </header>

      {/* KPI Vitals */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
         <DashboardStat 
           title="Field Ops" 
           value={vitals.inField} 
           sub="Tim Sampling Aktif" 
           icon={MapPin} 
           color="emerald" 
           trend="Live" 
         />
         <DashboardStat 
           title="Sample Reception" 
           value={vitals.waitingLogin} 
           sub="Antrian Verifikasi Login" 
           icon={Scan} 
           color="amber" 
           trend="Pending" 
         />
         <DashboardStat 
           title="Lab Progress" 
           value={vitals.labProgress} 
           sub="Sampel sedang di-Analisa" 
           icon={Beaker} 
           color="blue" 
           trend="In Work" 
         />
         <DashboardStat 
           title="Critical Items" 
           value={lowStockItems.length} 
           sub="Stok Reagent Menipis" 
           icon={Package} 
           color="rose" 
           trend="Action" 
         />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Chart */}
        <div className="lg:col-span-2 premium-card p-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">Usage Trends</h2>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Daily reagent consumption</p>
            </div>
            <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg">
              <button className="px-3 py-1 bg-white text-blue-600 text-[10px] font-bold rounded-md shadow-sm">Usage</button>
              <button className="px-3 py-1 text-slate-500 text-[10px] font-bold hover:text-slate-900 transition-colors">Samples</button>
            </div>
          </div>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={usageTrendData}>
                <defs>
                  <linearGradient id="colorUsage" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }} 
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }} 
                  dx={-10}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '16px', border: '1px solid #f1f5f9', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                  itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="count" 
                  stroke="#3b82f6" 
                  strokeWidth={4} 
                  fillOpacity={1} 
                  fill="url(#colorUsage)" 
                  animationDuration={1500}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Insights & Distribution */}
        <div className="space-y-8">
          <div className="premium-card p-8">
            <h2 className="text-xl font-black text-slate-900 tracking-tight mb-6">Smart Insights</h2>
            <div className="space-y-4">
              {insights.map((insight, i) => (
                <div key={i} className="flex items-start gap-4 p-4 rounded-2xl bg-slate-50/50 border border-slate-100 group hover:bg-white hover:border-blue-100 transition-all cursor-default">
                  <div className={cn("mt-1 p-2 rounded-lg bg-white shadow-sm", insight.color)}>
                    <insight.icon size={16} />
                  </div>
                  <p className="text-sm font-semibold text-slate-600 leading-relaxed group-hover:text-slate-900 transition-colors">
                    {insight.text}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="premium-card p-8">
            <h2 className="text-xl font-black text-slate-900 tracking-tight mb-6">Lab Distribution</h2>
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={labStockData} layout="vertical">
                  <XAxis type="number" hide />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#64748b', fontSize: 11, fontWeight: 700 }} 
                    width={80}
                  />
                  <Tooltip 
                    cursor={{ fill: 'transparent' }}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar 
                    dataKey="value" 
                    fill="#3b82f6" 
                    radius={[0, 10, 10, 0]} 
                    barSize={12}
                  >
                    {labStockData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#3b82f6' : '#6366f1'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* Low Stock Alert Section */}
      <div className="premium-card overflow-hidden">
        <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/30">
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">Critical Stock Alerts</h2>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Immediate action required</p>
          </div>
          <Link to="/stock/lab" className="text-blue-600 text-xs font-bold hover:underline flex items-center gap-1">
            Manage Inventory <ArrowUpRight size={14} />
          </Link>
        </div>
        <div className="p-4 sm:p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {lowStockItems.length > 0 ? lowStockItems.slice(0, 6).map((item) => (
              <div key={item.id} className="flex items-center justify-between p-4 rounded-2xl bg-white border border-slate-100 hover:border-rose-200 hover:shadow-lg hover:shadow-rose-500/5 transition-all group">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-rose-50 group-hover:text-rose-500 transition-colors">
                    <Package size={20} />
                  </div>
                  <div>
                    <p className="font-bold text-slate-900 text-sm">{item.name}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{item.location} • {item.labType || 'General'}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-rose-600">{item.quantity} {item.unit}</p>
                  <div className="w-16 h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden">
                    <div 
                      className="h-full bg-rose-500 rounded-full" 
                      style={{ width: `${(item.quantity / (item.minStock || 10)) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            )) : (
              <div className="col-span-full flex flex-col items-center justify-center py-12 text-slate-400 gap-3">
                <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-500">
                  <CheckCircle2 size={32} />
                </div>
                <p className="font-bold text-sm">All stock levels are optimal.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Inventory Workflow Info */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-[24px] p-8 text-white shadow-xl shadow-blue-500/20 relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
          <div className="p-4 bg-white/10 rounded-3xl backdrop-blur-md border border-white/20">
            <Info size={40} className="text-white" />
          </div>
          <div className="flex-1 space-y-4">
            <div>
              <h3 className="text-xl font-black tracking-tight">Inventory Management Workflow</h3>
              <p className="text-blue-100 text-sm font-medium mt-1">Understanding how reagents flow through our laboratory system.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white/10 p-4 rounded-2xl border border-white/10 backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-full bg-blue-400 text-blue-900 flex items-center justify-center text-[10px] font-black">1</div>
                  <p className="font-bold text-sm">Warehouse Storage</p>
                </div>
                <p className="text-[11px] text-blue-50 leading-relaxed">All physical stock is centrally stored in the Warehouse. New arrivals are logged here first.</p>
              </div>
              <div className="bg-white/10 p-4 rounded-2xl border border-white/10 backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-full bg-blue-400 text-blue-900 flex items-center justify-center text-[10px] font-black">2</div>
                  <p className="font-bold text-sm">Lab Distribution</p>
                </div>
                <p className="text-[11px] text-blue-50 leading-relaxed">Labs request materials from the Warehouse. Stock is transferred to Lab Inventory for daily use.</p>
              </div>
              <div className="bg-white/10 p-4 rounded-2xl border border-white/10 backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-full bg-blue-400 text-blue-900 flex items-center justify-center text-[10px] font-black">3</div>
                  <p className="font-bold text-sm">Purchasing Request</p>
                </div>
                <p className="text-[11px] text-blue-50 leading-relaxed">When Lab stock is depleted, a request is sent to Purchasing to initiate new procurement.</p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

const LabStockOpnameView = () => {
  const [stock, setStock] = useState<StockItem[]>([]);
  const [warehouseStock, setWarehouseStock] = useState<StockItem[]>([]);
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLab, setFilterLab] = useState<string>('all');
  const [selectedQRItem, setSelectedQRItem] = useState<StockItem | null>(null);
  const [selectedItems, setSelectedItems] = useState<number[]>([]);
  const [showBulkQR, setShowBulkQR] = useState(false);
  const [showBulkUpdate, setShowBulkUpdate] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [newRequest, setNewRequest] = useState({ reagentName: '', quantity: 0, unit: 'pcs', type: 'warehouse' as 'warehouse' | 'purchasing' });
  const [receivingId, setReceivingId] = useState<string | null>(null);
  const [showPhotoCapture, setShowPhotoCapture] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [labRejectionReason, setLabRejectionReason] = useState('');
  const { profile, expiryThreshold } = React.useContext(UserContext);

  const fetchStock = async () => {
    try {
      const res = await fetch('/api/stocks?location=lab&limit=100');
      if (res.ok) {
        const result = await res.json();
        setStock(result.data || []);
      } else {
        await handleApiError(res, 'Lab Stock');
      }
    } catch (error) {
      console.error('Error fetching lab stock:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchWarehouseStock = async () => {
    try {
      const res = await fetch('/api/stocks?location=warehouse&limit=100');
      if (res.ok) {
        const result = await res.json();
        setWarehouseStock(result.data || []);
      } else {
        await handleApiError(res, 'Warehouse Stock');
      }
    } catch (error) {
      console.error('Error fetching warehouse stock:', error);
    }
  };

  const fetchRequisitions = async () => {
    try {
      // Fetch all requisitions for general lab
      const rRes = await fetch('/api/requisitions?limit=50');
      if (rRes.ok) {
        const result = await rRes.json();
        setRequisitions(result.data || []);
      } else {
        await handleApiError(rRes, 'Requisitions');
      }
    } catch (error) {
      console.error('Error fetching requisitions:', error);
    }
  };

  const handleReceive = async (id: string, photo?: string) => {
    try {
      const res = await fetch(`/api/requisitions/${id}/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          receivedBy: profile?.displayName,
          receivedPhoto: photo
        }),
      });
      if (res.ok) {
        fetchRequisitions();
        fetchStock();
        setReceivingId(null);
        setShowPhotoCapture(false);
      } else {
        const err = await res.json();
        alert(err.error || 'Gagal menerima barang');
      }
    } catch (error) {
      console.error('Error receiving requisition:', error);
    }
  };

  const handleLabReject = async (id: string, photo?: string) => {
    if (!labRejectionReason.trim()) {
      alert('Alasan penolakan harus diisi');
      return;
    }
    try {
      const res = await fetch(`/api/requisitions/${id}/lab-reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          rejectedBy: profile?.displayName,
          rejectionReason: labRejectionReason,
          rejectionPhoto: photo
        }),
      });
      if (res.ok) {
        fetchRequisitions();
        setReceivingId(null);
        setShowPhotoCapture(false);
        setIsRejecting(false);
        setLabRejectionReason('');
      } else {
        const err = await res.json();
        alert(err.error || 'Gagal menolak barang');
      }
    } catch (error) {
      console.error('Error rejecting requisition:', error);
    }
  };

  useEffect(() => { 
    fetchStock(); 
    fetchWarehouseStock();
    fetchRequisitions();
  }, []);

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRequest.reagentName || newRequest.quantity <= 0) return;

    try {
      const res = await fetch('/api/requisitions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newRequest,
          labType: 'general',
          requestedBy: profile?.displayName || 'Lab Manager'
        }),
      });

      if (res.ok) {
        setShowRequestModal(false);
        setNewRequest({ reagentName: '', quantity: 0, unit: 'pcs', type: 'warehouse' });
        fetchRequisitions();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to request from warehouse');
      }
    } catch (error) {
      console.error('Error requesting from warehouse:', error);
    }
  };

  const filteredStock = stock.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (item.brand?.toLowerCase().includes(searchTerm.toLowerCase())) ||
                         (item.lotNumber?.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesLab = filterLab === 'all' || item.labType === filterLab;
    return matchesSearch && matchesLab;
  });

  const getStatus = (item: StockItem) => {
    const isLow = item.quantity <= item.minStock;
    const isExpiring = item.expiryDate && (new Date(item.expiryDate).getTime() - new Date().getTime()) < (expiryThreshold * 24 * 60 * 60 * 1000);
    const isExpired = item.expiryDate && new Date(item.expiryDate) < new Date();

    if (isExpired) return { label: 'Expired', color: 'bg-red-100 text-red-700' };
    if (isExpiring) return { label: 'Expiring Soon', color: 'bg-orange-100 text-orange-700' };
    if (isLow) return { label: 'Low Stock', color: 'bg-amber-100 text-amber-700' };
    return { label: 'Good', color: 'bg-emerald-100 text-emerald-700' };
  };

  const exportToExcel = () => {
    const dataToExport = filteredStock.map(item => ({
      'Nama Reagent': item.name,
      'Kode': item.materialCode || '-',
      'Merek': item.brand || '-',
      'Nomor LOT': item.lotNumber || '-',
      'Stok Lab': item.quantity,
      'Satuan': item.unit,
      'Batas Min': item.minStock,
      'Kedatangan': item.arrivalDate || '-',
      'Expired': item.expiryDate || '-',
      'Lab': item.labType || 'General',
      'Status': getStatus(item).label
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stok Lab");
    XLSX.writeFile(wb, `Stok_Lab_${new Date().toLocaleDateString()}.xlsx`);
  };

  const handleBulkUpdate = async (updates: any) => {
    if (selectedItems.length === 0) return;
    
    try {
      const res = await fetch('/api/stocks-bulk/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: selectedItems,
          updates
        }),
      });

      if (res.ok) {
        alert('Bulk update successful!');
        setShowBulkUpdate(false);
        setSelectedItems([]);
        fetchStock();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to perform bulk update');
      }
    } catch (error) {
      console.error('Error in bulk update:', error);
      alert('An error occurred during bulk update');
    }
  };

  const toggleSelectAll = () => {
    if (selectedItems.length === filteredStock.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(filteredStock.map(i => i.id));
    }
  };

  const toggleSelectItem = (id: number) => {
    if (selectedItems.includes(id)) {
      setSelectedItems(selectedItems.filter(i => i !== id));
    } else {
      setSelectedItems([...selectedItems, id]);
    }
  };

  return (
    <div className="space-y-8 pb-20">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Lab Inventory</h1>
          <p className="text-slate-500 font-medium">Manage and monitor reagent stocks across all laboratory units.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {selectedItems.length > 0 && (
            <div className="flex items-center gap-2">
              <motion.button 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={() => setShowBulkQR(true)}
                className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 text-sm"
              >
                <Printer size={18} />
                Print {selectedItems.length} QR
              </motion.button>
              <motion.button 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={() => setShowBulkUpdate(true)}
                className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20 text-sm"
              >
                <Edit3 size={18} />
                Bulk Update ({selectedItems.length})
              </motion.button>
            </div>
          )}
          <button 
            onClick={exportToExcel}
            className="bg-white border border-slate-200 text-slate-600 px-5 py-2.5 rounded-xl flex items-center gap-2 hover:bg-slate-50 transition-all font-bold text-sm shadow-sm"
          >
            <FileSpreadsheet size={18} />
            Export
          </button>
          <button 
            onClick={() => setShowRequestModal(true)}
            className="bg-slate-900 text-white px-5 py-2.5 rounded-xl flex items-center gap-2 hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/10 font-bold text-sm"
          >
            <Plus size={18} />
            Request from Warehouse
          </button>
        </div>
      </header>

      <AnimatePresence>
        <BulkUpdateModal 
          isOpen={showBulkUpdate}
          onClose={() => setShowBulkUpdate(false)}
          onUpdate={handleBulkUpdate}
          selectedCount={selectedItems.length}
          location="lab"
        />
        {showRequestModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900">Permintaan Bahan</h3>
                <button onClick={() => setShowRequestModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X size={24} />
                </button>
              </div>
              <form onSubmit={handleRequest} className="p-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Tipe Permintaan</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button 
                      type="button"
                      onClick={() => setNewRequest({...newRequest, type: 'warehouse'})}
                      className={cn(
                        "py-2 rounded-xl text-xs font-bold border transition-all",
                        newRequest.type === 'warehouse' ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-500/20" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                      )}
                    >
                      Dari Gudang
                    </button>
                    <button 
                      type="button"
                      onClick={() => setNewRequest({...newRequest, type: 'purchasing'})}
                      className={cn(
                        "py-2 rounded-xl text-xs font-bold border transition-all",
                        newRequest.type === 'purchasing' ? "bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-500/20" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                      )}
                    >
                      Ke Purchasing
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Nama Bahan</label>
                  {newRequest.type === 'warehouse' ? (
                    <select 
                      value={newRequest.reagentName}
                      onChange={(e) => {
                        const selected = warehouseStock.find(i => i.name === e.target.value);
                        setNewRequest({ ...newRequest, reagentName: e.target.value, unit: selected?.unit || 'pcs' });
                      }}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
                      required
                    >
                      <option value="">Pilih Bahan dari Gudang...</option>
                      {warehouseStock.map(item => (
                        <option key={item.id} value={item.name}>{item.name} ({item.quantity} {item.unit} tersedia)</option>
                      ))}
                    </select>
                  ) : (
                    <input 
                      type="text"
                      placeholder="Masukkan nama bahan yang ingin dibeli..."
                      value={newRequest.reagentName}
                      onChange={(e) => setNewRequest({...newRequest, reagentName: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
                      required
                    />
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">Jumlah</label>
                    <input 
                      type="number" 
                      value={newRequest.quantity}
                      onChange={(e) => setNewRequest({ ...newRequest, quantity: parseFloat(e.target.value) })}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
                      required
                      min="0.1"
                      step="0.1"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">Satuan</label>
                    {newRequest.type === 'warehouse' ? (
                      <input 
                        type="text" 
                        value={newRequest.unit}
                        readOnly
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-100 text-slate-500 outline-none"
                      />
                    ) : (
                      <select 
                        value={newRequest.unit}
                        onChange={(e) => setNewRequest({...newRequest, unit: e.target.value})}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
                        required
                      >
                        <option value="Pack">Pack</option>
                        <option value="Pcs">Pcs</option>
                        <option value="Botol">Botol</option>
                        <option value="Box">Box</option>
                        <option value="Can">Can</option>
                      </select>
                    )}
                  </div>
                </div>
                <div className="pt-4 flex gap-3">
                  <button 
                    type="button" 
                    onClick={() => setShowRequestModal(false)}
                    className="flex-1 py-3 px-4 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-all border border-slate-200"
                  >
                    Batal
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-3 px-4 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
                  >
                    Kirim Permintaan
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Search reagents, brands, or LOT..." 
            className="w-full pl-12 pr-4 py-3.5 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/10 transition-all shadow-sm font-medium"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <select 
              className="pl-10 pr-10 py-3.5 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/10 transition-all shadow-sm appearance-none min-w-[180px] font-bold text-slate-700 text-sm"
              value={filterLab}
              onChange={(e) => setFilterLab(e.target.value)}
            >
              <option value="all">All Laboratories</option>
              <option value="udara">Lab Udara</option>
              <option value="air">Lab Air</option>
              <option value="b3_tanah">Lab B3 & Tanah</option>
              <option value="mikrobiologi">Lab Mikrobiologi</option>
              <option value="general">General</option>
            </select>
            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
          </div>
        </div>
      </div>

      <div className="premium-card overflow-hidden">
        <div className="overflow-x-auto hidden lg:block">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/30 border-b border-slate-100">
                <th className="px-8 py-5 w-10">
                  <input 
                    type="checkbox" 
                    checked={selectedItems.length === filteredStock.length && filteredStock.length > 0}
                    onChange={toggleSelectAll}
                    className="w-5 h-5 rounded-lg border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Reagent Info</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Brand & code</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Arrival</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Stock</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Expiry</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                <th className="px-6 py-5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr><td colSpan={8} className="px-8 py-20 text-center text-slate-400 font-bold animate-pulse">Loading stock data...</td></tr>
              ) : filteredStock.length === 0 ? (
                <tr><td colSpan={8} className="px-8 py-20 text-center text-slate-400 font-bold italic">No reagents found in lab inventory.</td></tr>
              ) : filteredStock.map((item) => {
                const status = getStatus(item);
                return (
                  <tr key={item.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-8 py-5">
                      <input 
                        type="checkbox" 
                        checked={selectedItems.includes(item.id)}
                        onChange={() => toggleSelectItem(item.id)}
                        className="w-5 h-5 rounded-lg border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600 transition-all shadow-sm border border-slate-200/50">
                          <Package size={20} />
                        </div>
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-900 text-sm leading-tight">{item.name}</span>
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">{item.labType || 'general'}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex flex-col gap-1.5">
                        <span className="text-slate-600 font-bold text-xs">{item.brand || '-'}</span>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Code: {item.materialCode || '-'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-slate-500 text-xs font-bold">
                      {item.arrivalDate ? new Date(item.arrivalDate).toLocaleDateString('id-ID') : '-'}
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex flex-col items-center">
                        <span className={cn(
                          "text-lg font-black",
                          item.quantity <= (item.minStock || 5) ? "text-rose-600" : "text-blue-600"
                        )}>{item.quantity}</span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{item.unit}</span>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-2 text-slate-600 font-bold text-xs">
                        <Clock size={14} className="text-slate-400" />
                        {item.expiryDate ? new Date(item.expiryDate).toLocaleDateString() : '-'}
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <span className={cn("px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest border", status.color)}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => setSelectedQRItem(item)}
                          className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
                          title="View QR Code"
                        >
                          <QrCode size={18} />
                        </button>
                        <button className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all">
                          <MoreVertical size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile View */}
        <div className="lg:hidden divide-y divide-slate-50">
          {loading ? (
            <div className="p-12 text-center">
              <div className="w-10 h-10 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-sm text-slate-400 font-bold">Loading data...</p>
            </div>
          ) : filteredStock.length === 0 ? (
            <div className="p-12 text-center text-slate-300">
              <Database size={48} className="mx-auto mb-4 opacity-50" />
              <p className="text-sm font-bold uppercase tracking-widest">No reagents found</p>
            </div>
          ) : filteredStock.map((item) => {
            const status = getStatus(item);
            return (
              <div key={item.id} className="p-6 space-y-5 hover:bg-slate-50/50 transition-colors">
                <div className="flex justify-between items-start gap-4">
                  <div className="flex items-start gap-4">
                    <input 
                      type="checkbox" 
                      checked={selectedItems.includes(item.id)}
                      onChange={() => toggleSelectItem(item.id)}
                      className="w-6 h-6 rounded-lg border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <h4 className="font-black text-slate-900 uppercase tracking-tight leading-tight truncate">{item.name}</h4>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[10px] font-bold text-slate-500 font-mono bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200 uppercase">{item.materialCode || 'NO-CODE'}</span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{item.brand || 'No Brand'}</span>
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setSelectedQRItem(item)} className="p-2.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all shadow-sm border border-slate-200/50"><QrCode size={18} /></button>
                </div>
                
                <div className="grid grid-cols-2 gap-4 bg-slate-50/50 p-5 rounded-2xl border border-slate-100">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Stock Level</p>
                    <p className={cn("font-black text-lg", item.quantity <= (item.minStock || 5) ? "text-rose-600" : "text-blue-600")}>{item.quantity} {item.unit}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Expiration</p>
                    <div className="flex items-center gap-2 text-slate-600 font-bold text-xs">
                      <Clock size={14} className="text-slate-400" />
                      {item.expiryDate ? new Date(item.expiryDate).toLocaleDateString('id-ID') : '-'}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center justify-between pt-3 border-t border-slate-200/50">
                  <span className={cn("px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest border shadow-sm", status.color)}>
                    {status.label}
                  </span>
                  {item.coaFile && (
                    <button 
                      onClick={() => {
                        const win = window.open();
                        if (win) win.document.write(`<iframe src="${item.coaFile}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
                      }}
                      className="text-blue-600 text-[10px] font-black uppercase flex items-center gap-1.5 bg-blue-50 px-3 py-1.5 rounded-full hover:bg-blue-100 transition-colors"
                    >
                      <FileText size={14} /> View COA
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedQRItem && (
        <QRCodeModal 
          item={selectedQRItem} 
          onClose={() => setSelectedQRItem(null)} 
        />
      )}

      {/* Active Requisitions Section */}
      <div className="premium-card overflow-hidden">
        <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/30">
          <div>
            <h3 className="text-xl font-black text-slate-900 tracking-tight">Active Requisitions</h3>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Status of reagents requested from warehouse</p>
          </div>
          <span className="px-4 py-1.5 bg-blue-50 text-blue-600 text-[10px] font-black rounded-full uppercase tracking-widest border border-blue-100">
            {requisitions.filter(r => r.status !== 'received').length} Active
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/30 border-b border-slate-100">
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date Requested</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Material</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Quantity</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Current Status</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {requisitions.length === 0 ? (
                <tr><td colSpan={5} className="px-8 py-16 text-center text-slate-400 font-bold italic">No active requisitions found.</td></tr>
              ) : requisitions.map((req) => (
                <tr key={req.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-8 py-5 text-xs font-bold text-slate-500">
                    {req.createdAt ? new Date(req.createdAt).toLocaleDateString('id-ID') : '-'}
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">{req.reagentName}</span>
                        <span className={cn(
                          "px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest border",
                          req.type === 'purchasing' ? "bg-indigo-50 text-indigo-600 border-indigo-100" : "bg-blue-50 text-blue-600 border-blue-100"
                        )}>
                          {req.type || 'Warehouse'}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Lab {req.labType}</span>
                    </div>
                  </td>
                  <td className="px-6 py-5 text-center">
                    <div className="font-black text-slate-900 text-sm">{req.quantity} {req.unit}</div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex flex-col gap-1.5">
                      {req.status === 'pending' && <span className="w-fit px-3 py-1 bg-amber-50 text-amber-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-amber-100">Pending</span>}
                      {req.status === 'po' && (
                        <div className="space-y-1">
                          <span className="w-fit px-3 py-1 bg-blue-50 text-blue-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-blue-100">Processing PO</span>
                          {req.purchasingNote && (
                            <motion.div 
                              whileHover={{ scale: 1.05, x: 5 }}
                              className="mt-1 p-2 bg-blue-50/50 rounded-lg border border-blue-100 flex items-start gap-1.5 max-w-[180px] shadow-sm"
                            >
                              <MessageSquare size={10} className="text-blue-500 shrink-0 mt-0.5" />
                              <p className="text-[9px] text-blue-600 italic leading-tight">{req.purchasingNote}</p>
                            </motion.div>
                          )}
                        </div>
                      )}
                      {req.status === 'shipped' && <span className="w-fit px-3 py-1 bg-indigo-50 text-indigo-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-indigo-100 animate-pulse">In Transit</span>}
                      {req.status === 'received' && <span className="w-fit px-3 py-1 bg-emerald-50 text-emerald-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-emerald-100">Received</span>}
                      {req.status === 'rejected' && (
                        <div className="space-y-1">
                          <span className="w-fit px-3 py-1 bg-rose-50 text-rose-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-rose-100">Rejected</span>
                          {req.rejectionReason && (
                            <p className="text-[9px] text-rose-500 italic leading-tight max-w-[150px]">"{req.rejectionReason}"</p>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    {req.status === 'shipped' && (
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => { setReceivingId(req.id); setIsRejecting(false); setShowPhotoCapture(true); }}
                          className="px-4 py-2 bg-emerald-600 text-white text-[10px] font-black rounded-lg uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-md shadow-emerald-500/10"
                        >
                          Receive
                        </button>
                        <button 
                          onClick={() => { setReceivingId(req.id); setIsRejecting(true); }}
                          className="px-4 py-2 bg-rose-50 text-rose-600 text-[10px] font-black rounded-lg uppercase tracking-widest hover:bg-rose-100 transition-all"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                    {receivingId === req.id && isRejecting && !showPhotoCapture && (
                      <div className="mt-2 p-3 bg-rose-50 rounded-xl border border-rose-100 space-y-2">
                        <textarea 
                          value={labRejectionReason}
                          onChange={(e) => setLabRejectionReason(e.target.value)}
                          placeholder="Reason for rejection..."
                          className="w-full p-2 text-xs border border-rose-200 rounded-lg focus:ring-1 focus:ring-rose-500 outline-none resize-none bg-white"
                          rows={2}
                        />
                        <div className="flex gap-2">
                          <button 
                            onClick={() => setShowPhotoCapture(true)}
                            disabled={!labRejectionReason.trim()}
                            className="flex-1 bg-rose-600 text-white py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-rose-700 disabled:opacity-50"
                          >
                            Capture & Send
                          </button>
                          <button 
                            onClick={() => { setReceivingId(null); setIsRejecting(false); setLabRejectionReason(''); }}
                            className="px-3 py-1.5 bg-white text-slate-500 rounded-lg text-[10px] font-black uppercase tracking-widest border border-slate-200"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                    {req.status === 'received' && req.receivedPhoto && (
                      <button 
                        onClick={() => {
                          const win = window.open();
                          if (win) win.document.write(`<img src="${req.receivedPhoto}" style="max-width:100%; height:auto;" />`);
                        }}
                        className="text-[10px] font-bold text-slate-400 hover:text-blue-600 flex items-center gap-1 transition-colors"
                      >
                        <ImageIcon size={10} /> View Proof
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showPhotoCapture && receivingId && (
        <PhotoCaptureModal 
          onClose={() => { setShowPhotoCapture(false); setReceivingId(null); setIsRejecting(false); }}
          onCapture={(photo) => isRejecting ? handleLabReject(receivingId, photo) : handleReceive(receivingId, photo)}
        />
      )}
    </div>
  );
};

const WarehouseStockView = () => {
  const [stock, setStock] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editingItem, setEditingItem] = useState<StockItem | null>(null);
  const [selectedQRItem, setSelectedQRItem] = useState<StockItem | null>(null);
  const [selectedItems, setSelectedItems] = useState<number[]>([]);
  const [showBulkQR, setShowBulkQR] = useState(false);
  const [showBulkUpdate, setShowBulkUpdate] = useState(false);
  const [showStockCheck, setShowStockCheck] = useState(false);
  const [selectedCheckItem, setSelectedCheckItem] = useState<StockItem | null>(null);
  const [showCheckHistory, setShowCheckHistory] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [checkHistory, setCheckHistory] = useState<any[]>([]);
  const [checkForm, setCheckForm] = useState({ physicalQuantity: 0, notes: '', updateStock: true });
  const [searchTerm, setSearchTerm] = useState('');
  const [newItem, setNewItem] = useState({ 
    name: '', 
    brand: '', 
    lotNumber: '', 
    materialCode: '',
    category: 'Bahan', 
    quantity: 0, 
    minStock: 0, 
    unit: 'Pack', // Packaging Unit (Pack, Pcs, Botol)
    contentPerUnit: 1, // Amount per package (e.g. 500)
    contentUnit: 'Gram', // Unit per package (Gram, ML, Pcs)
    arrivalDate: '',
    expiryDate: '',
    coaFile: ''
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coaInputRef = useRef<HTMLInputElement>(null);

  const { profile, expiryThreshold } = React.useContext(UserContext);

  const fetchStock = async () => {
    setError(null);
    try {
      const res = await fetch('/api/stocks?location=warehouse&limit=100');
      if (res.ok) {
        const result = await res.json();
        setStock(result.data || []);
      } else {
        await handleApiError(res, 'Warehouse Stock');
      }
    } catch (error: any) {
      console.error('Error fetching stock:', error);
      setError(error.message || 'Gagal terhubung ke server. Silakan periksa koneksi internet Anda.');
    } finally {
      setLoading(false);
    }
  };

  const fetchCheckHistory = async (stockItemId?: number) => {
    try {
      const url = stockItemId ? `/api/stock-checks?stockItemId=${stockItemId}` : '/api/stock-checks';
      const res = await fetch(url);
      if (res.ok) {
        setCheckHistory(await res.json());
      }
    } catch (error) {
      console.error('Error fetching check history:', error);
    }
  };

  const handleStockCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCheckItem) return;

    try {
      const discrepancy = checkForm.physicalQuantity - selectedCheckItem.quantity;
      const res = await fetch('/api/stock-checks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stockItemId: selectedCheckItem.id,
          reagentName: selectedCheckItem.name,
          lotNumber: selectedCheckItem.lotNumber,
          systemQuantity: selectedCheckItem.quantity,
          physicalQuantity: checkForm.physicalQuantity,
          discrepancy,
          checkedBy: profile?.displayName || profile?.email || 'Unknown',
          notes: checkForm.notes,
          updateStock: checkForm.updateStock
        }),
      });

      if (res.ok) {
        alert('Pengecekan stok berhasil dicatat!');
        setShowStockCheck(false);
        setSelectedCheckItem(null);
        setCheckForm({ physicalQuantity: 0, notes: '', updateStock: true });
        fetchStock();
      }
    } catch (error) {
      console.error('Error submitting stock check:', error);
      alert('Gagal mencatat pengecekan stok');
    }
  };

  const handleScan = useCallback((data: any) => {
    if (data && data.id) {
      const item = stock.find(s => s.id === data.id);
      if (item) {
        setSelectedCheckItem(item);
        setCheckForm({ physicalQuantity: item.quantity, notes: '', updateStock: true });
        setShowStockCheck(true);
        setShowScanner(false);
      } else {
        alert('Bahan tidak ditemukan di database gudang.');
      }
    }
  }, [stock]);

  useEffect(() => { fetchStock(); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editingItem ? `/api/stocks/${editingItem.id}` : '/api/stocks';
      const method = editingItem ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newItem, location: 'warehouse' }),
      });
      if (res.ok) {
        setShowAdd(false);
        setEditingItem(null);
        setNewItem({ 
          name: '', 
          brand: '', 
          lotNumber: '', 
          materialCode: '',
          category: 'Bahan', 
          quantity: 0, 
          minStock: 0, 
          unit: 'Pack', 
          contentPerUnit: 1,
          contentUnit: 'Gram',
          arrivalDate: '',
          expiryDate: '',
          coaFile: ''
        });
        fetchStock();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to save item');
      }
    } catch (error) {
      console.error('Error saving item:', error);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus bahan ini?')) return;
    try {
      const res = await fetch(`/api/stocks/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchStock();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to delete item');
      }
    } catch (error) {
      console.error('Error deleting item:', error);
    }
  };

  const handleBulkUpdate = async (updates: any) => {
    if (selectedItems.length === 0) return;
    
    try {
      const res = await fetch('/api/stocks-bulk/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: selectedItems,
          updates
        }),
      });

      if (res.ok) {
        alert('Bulk update successful!');
        setShowBulkUpdate(false);
        setSelectedItems([]);
        fetchStock();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to perform bulk update');
      }
    } catch (error) {
      console.error('Error in bulk update:', error);
      alert('An error occurred during bulk update');
    }
  };

  useEffect(() => {
    if (editingItem) {
      setNewItem({
        name: editingItem.name,
        brand: editingItem.brand || '',
        lotNumber: editingItem.lotNumber || '',
        materialCode: editingItem.materialCode || '',
        category: editingItem.category || 'Bahan',
        quantity: editingItem.quantity,
        minStock: editingItem.minStock,
        unit: editingItem.unit,
        contentPerUnit: editingItem.contentPerUnit || 1,
        contentUnit: editingItem.contentUnit || 'Gram',
        arrivalDate: editingItem.arrivalDate || '',
        expiryDate: editingItem.expiryDate || '',
        coaFile: editingItem.coaFile || ''
      });
      setShowAdd(true);
    }
  }, [editingItem]);

  const handleCoaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.type !== 'application/pdf') {
      alert('Hanya file PDF yang diperbolehkan untuk COA');
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      const base64 = evt.target?.result as string;
      setNewItem({ ...newItem, coaFile: base64 });
    };
    reader.readAsDataURL(file);
  };

  const downloadTemplate = () => {
    const template = [
      {
        'Nama Bahan': 'Contoh Bahan A',
        'Kode Bahan': 'B-001',
        'Merek': 'Merck',
        'Nomor LOT': 'LOT123456',
        'Jumlah Stok': 100,
        'Batas Stok Min': 10,
        'Satuan (Pack/Pcs/Botol)': 'Pack',
        'Satuan Per Kemasan (Gram/ML/Pcs)': 'Gram',
        'Tanggal Kedatangan (YYYY-MM-DD)': '2024-01-01',
        'Tanggal Expired (YYYY-MM-DD)': '2025-12-31'
      }
    ];
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "Template_Upload_Stok_Bahan.xlsx");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'array' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        const itemsToCreate = (data as any[]).map(row => ({
          name: row['Nama Bahan'],
          materialCode: row['Kode Bahan'],
          brand: row['Merek'],
          lotNumber: row['Nomor LOT'],
          quantity: parseFloat(row['Jumlah Stok']),
          minStock: parseFloat(row['Batas Stok Min']),
          unit: row['Satuan (Pack/Pcs/Botol)'],
          contentUnit: row['Satuan Per Kemasan (Gram/ML/Pcs)'],
          arrivalDate: row['Tanggal Kedatangan (YYYY-MM-DD)'],
          expiryDate: row['Tanggal Expired (YYYY-MM-DD)'],
          category: 'Bahan',
          location: 'warehouse'
        })).filter(item => item.name && !isNaN(item.quantity));

        if (itemsToCreate.length > 0) {
          const res = await fetch('/api/stocks/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(itemsToCreate),
          });
          if (!res.ok) throw new Error('Gagal menyimpan data ke server');
        }

        fetchStock();
        alert('Upload berhasil!');
      } catch (error) {
        console.error('Error processing file:', error);
        alert('Gagal memproses file Excel');
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const exportToExcel = () => {
    const dataToExport = filteredStock.map(item => ({
      'Nama Bahan': item.name,
      'Kode Bahan': item.materialCode || '-',
      'Merek': item.brand || '-',
      'Nomor LOT': item.lotNumber || '-',
      'Stok': item.quantity,
      'Satuan': item.unit,
      'Batas Min': item.minStock,
      'Kedatangan': item.arrivalDate || '-',
      'Expired': item.expiryDate || '-',
      'Status': item.quantity <= item.minStock ? 'Menipis' : 
                (item.expiryDate && new Date(item.expiryDate) < new Date() ? 'Expired' : 'Aman')
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stok Gudang");
    XLSX.writeFile(wb, `Stok_Gudang_${new Date().toLocaleDateString()}.xlsx`);
  };

  const filteredStock = stock.filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.materialCode && item.materialCode.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (item.brand && item.brand.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const toggleSelectAll = () => {
    if (selectedItems.length === filteredStock.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(filteredStock.map(i => i.id));
    }
  };

  const toggleSelectItem = (id: number) => {
    if (selectedItems.includes(id)) {
      setSelectedItems(selectedItems.filter(i => i !== id));
    } else {
      setSelectedItems([...selectedItems, id]);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-500 font-medium animate-pulse">Memuat data gudang...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-8 bg-white rounded-3xl border border-slate-200 shadow-sm space-y-6">
        <div className="p-4 bg-rose-50 text-rose-500 rounded-2xl">
          <AlertCircle size={48} />
        </div>
        <div className="text-center space-y-2">
          <h3 className="text-xl font-bold text-slate-900">Terjadi Kesalahan</h3>
          <p className="text-slate-500 max-w-md">{error}</p>
        </div>
        <button 
          onClick={() => fetchStock()}
          className="px-8 py-3 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 flex items-center gap-2"
        >
          <RefreshCw size={20} />
          Coba Lagi
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Warehouse Inventory</h1>
          <p className="text-slate-500 font-medium">Centralized control for material arrivals and stock management.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={18} />
            <input 
              type="text"
              placeholder="Search reagent or material..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none w-full md:w-64 transition-all font-medium text-sm shadow-sm"
            />
          </div>
          {selectedItems.length > 0 && (
            <div className="flex items-center gap-2">
              <motion.button 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={() => setShowBulkQR(true)}
                className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 text-sm"
              >
                <Printer size={18} />
                Print {selectedItems.length} Labels
              </motion.button>
              <motion.button 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={() => setShowBulkUpdate(true)}
                className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20 text-sm"
              >
                <Edit3 size={18} />
                Bulk Update ({selectedItems.length})
              </motion.button>
            </div>
          )}
          <button 
            onClick={() => setShowScanner(true)}
            className="bg-white border border-slate-200 text-slate-600 px-5 py-2.5 rounded-xl flex items-center gap-2 hover:bg-slate-50 transition-all font-bold text-sm shadow-sm"
          >
            <Maximize size={18} /> Scan QR
          </button>
          <button 
            onClick={() => { setShowCheckHistory(true); fetchCheckHistory(); }}
            className="bg-white border border-slate-200 text-slate-600 px-5 py-2.5 rounded-xl flex items-center gap-2 hover:bg-slate-50 transition-all font-bold text-sm shadow-sm"
          >
            <History size={18} /> Logbook
          </button>
          <button 
            onClick={downloadTemplate}
            className="bg-white border border-slate-200 text-slate-600 px-5 py-2.5 rounded-xl flex items-center gap-2 hover:bg-slate-50 transition-all font-bold text-sm shadow-sm"
          >
            <Download size={18} /> Template
          </button>
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="bg-white border border-slate-200 text-slate-600 px-5 py-2.5 rounded-xl flex items-center gap-2 hover:bg-slate-50 transition-all font-bold text-sm shadow-sm"
          >
            <FileUp size={18} /> Import Excel
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            className="hidden" 
            accept=".xlsx, .xls" 
          />
          <button 
            onClick={exportToExcel}
            className="bg-white border border-slate-200 text-slate-600 px-5 py-2.5 rounded-xl flex items-center gap-2 hover:bg-slate-50 transition-all font-bold text-sm shadow-sm"
          >
            <FileSpreadsheet size={18} /> Export
          </button>
          <button 
            onClick={() => setShowAdd(true)}
            className="bg-slate-900 text-white px-5 py-2.5 rounded-xl flex items-center gap-2 hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/10 font-bold text-sm"
          >
            <Plus size={18} /> Add Material
          </button>
        </div>
      </header>

      <BulkUpdateModal 
        isOpen={showBulkUpdate}
        onClose={() => setShowBulkUpdate(false)}
        onUpdate={handleBulkUpdate}
        selectedCount={selectedItems.length}
        location="warehouse"
      />

      {showAdd && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900 mb-4">{editingItem ? 'Edit Bahan' : 'Tambah Bahan Manual'}</h3>
          <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500">Nama Bahan</label>
              <input 
                type="text" placeholder="Nama" required
                className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500">Kode Bahan</label>
              <input 
                type="text" placeholder="Kode"
                className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                value={newItem.materialCode} onChange={e => setNewItem({...newItem, materialCode: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500">Merek</label>
              <input 
                type="text" placeholder="Merek"
                className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                value={newItem.brand} onChange={e => setNewItem({...newItem, brand: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500">Nomor LOT</label>
              <input 
                type="text" placeholder="LOT"
                className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                value={newItem.lotNumber} onChange={e => setNewItem({...newItem, lotNumber: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500">Jumlah Stok</label>
              <input 
                type="number" placeholder="Jumlah" required
                className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                value={newItem.quantity} onChange={e => setNewItem({...newItem, quantity: parseFloat(e.target.value)})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500">Satuan (Kemasan)</label>
              <select 
                className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                value={newItem.unit} onChange={e => setNewItem({...newItem, unit: e.target.value})}
              >
                <option value="Pack">Pack</option>
                <option value="Pcs">Pcs</option>
                <option value="Botol">Botol</option>
                <option value="Box">Box</option>
                <option value="Can">Can</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500">Isi Per Kemasan</label>
              <input 
                type="number" placeholder="Isi" required
                className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                value={newItem.contentPerUnit} onChange={e => setNewItem({...newItem, contentPerUnit: parseFloat(e.target.value)})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500">Satuan Isi</label>
              <select 
                className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                value={newItem.contentUnit} onChange={e => setNewItem({...newItem, contentUnit: e.target.value})}
              >
                <option value="Gram">Gram</option>
                <option value="ML">ML</option>
                <option value="Pcs">Pcs</option>
                <option value="Kg">Kg</option>
                <option value="Liter">Liter</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500">Batas Stok Min</label>
              <input 
                type="number" placeholder="Min"
                className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                value={newItem.minStock} onChange={e => setNewItem({...newItem, minStock: parseFloat(e.target.value)})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500">Tanggal Kedatangan</label>
              <input 
                type="date"
                className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                value={newItem.arrivalDate} onChange={e => setNewItem({...newItem, arrivalDate: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500">Tanggal Expired</label>
              <input 
                type="date"
                className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                value={newItem.expiryDate} onChange={e => setNewItem({...newItem, expiryDate: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500">Upload COA (PDF)</label>
              <input 
                type="file" accept=".pdf"
                ref={coaInputRef}
                onChange={handleCoaUpload}
                className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div className="flex items-end gap-2">
              <button type="submit" className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-bold hover:bg-blue-700 transition-all">
                {editingItem ? 'Update' : 'Simpan'}
              </button>
              <button type="button" onClick={() => { setShowAdd(false); setEditingItem(null); }} className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-all">Batal</button>
            </div>
          </form>
        </motion.div>
      )}


      <div className="premium-card overflow-hidden">
        {/* Desktop Table */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/30 border-b border-slate-100">
                <th className="px-8 py-5 w-10">
                  <input 
                    type="checkbox" 
                    checked={selectedItems.length === filteredStock.length && filteredStock.length > 0}
                    onChange={toggleSelectAll}
                    className="w-5 h-5 rounded-lg border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Material Info</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Lot & Code</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Arrival</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Stock</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Expired</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                <th className="px-6 py-5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {stock.map((item) => {
                const isLow = item.quantity <= item.minStock;
                const isExpired = item.expiryDate && new Date(item.expiryDate) < new Date();
                const isNearingExpiry = item.expiryDate && 
                  new Date(item.expiryDate) > new Date() && 
                  new Date(item.expiryDate) < new Date(Date.now() + expiryThreshold * 24 * 60 * 60 * 1000);

                return (
                  <tr key={item.id} className={cn("hover:bg-slate-50/50 transition-colors group", (isLow || isExpired || isNearingExpiry) && "bg-rose-50/10")}>
                    <td className="px-8 py-5">
                      <input 
                        type="checkbox" 
                        checked={selectedItems.includes(item.id)}
                        onChange={() => toggleSelectItem(item.id)}
                        className="w-5 h-5 rounded-lg border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-900 text-sm">{item.name}</span>
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{item.brand || 'Generic'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex flex-col gap-1">
                        <span className="font-mono text-xs text-slate-600 font-bold bg-slate-100 px-2 py-0.5 rounded w-fit">{item.materialCode || 'N/A'}</span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Lot: {item.lotNumber || '-'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-slate-500 text-xs font-bold">
                      {item.arrivalDate ? new Date(item.arrivalDate).toLocaleDateString('id-ID') : '-'}
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex flex-col items-center">
                        <span className={cn(
                          "text-lg font-black",
                          isLow ? "text-rose-600" : "text-blue-600"
                        )}>{item.quantity}</span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{item.unit}</span>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className={cn("flex items-center gap-2 font-bold text-xs", (isExpired || isNearingExpiry) ? "text-rose-600" : "text-slate-600")}>
                        <Clock size={14} className="text-slate-400" />
                        {item.expiryDate ? new Date(item.expiryDate).toLocaleDateString('id-ID') : '-'}
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex flex-col gap-1">
                        {isLow && <span className="px-2 py-0.5 bg-rose-50 text-rose-600 rounded text-[9px] font-black uppercase tracking-widest border border-rose-100 w-fit">Low Stock</span>}
                        {isExpired && <span className="px-2 py-0.5 bg-rose-600 text-white rounded text-[9px] font-black uppercase tracking-widest w-fit">Expired</span>}
                        {isNearingExpiry && <span className="px-2 py-0.5 bg-amber-50 text-amber-600 rounded text-[9px] font-black uppercase tracking-widest border border-amber-100 w-fit">Expiring Soon</span>}
                        {!isLow && !isExpired && !isNearingExpiry && <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded text-[9px] font-black uppercase tracking-widest border border-emerald-100 w-fit">Healthy</span>}
                      </div>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => { setSelectedCheckItem(item); setCheckForm({ ...checkForm, physicalQuantity: item.quantity }); setShowStockCheck(true); }}
                          className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition-all"
                          title="Stock Check"
                        >
                          <ClipboardCheck size={18} />
                        </button>
                        <button 
                          onClick={() => setSelectedQRItem(item)}
                          className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
                          title="QR Code"
                        >
                          <QrCode size={18} />
                        </button>
                        <button 
                          onClick={() => setEditingItem(item)}
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                          title="Edit"
                        >
                          <Settings size={18} />
                        </button>
                        <button 
                          onClick={() => handleDelete(item.id)}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                          title="Delete"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {stock.length === 0 && (
                <tr><td colSpan={8} className="px-8 py-16 text-center text-slate-400 font-bold italic">No materials found in warehouse.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Card List */}
        <div className="lg:hidden divide-y divide-slate-50">
          {stock.map((item) => {
            const isLow = item.quantity <= item.minStock;
            const isExpired = item.expiryDate && new Date(item.expiryDate) < new Date();
            const isNearingExpiry = item.expiryDate && 
              new Date(item.expiryDate) > new Date() && 
              new Date(item.expiryDate) < new Date(Date.now() + expiryThreshold * 24 * 60 * 60 * 1000);

            return (
              <div key={item.id} className={cn("p-6 space-y-5 relative overflow-hidden group", (isLow || isExpired || isNearingExpiry) && "bg-rose-50/10")}>
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-black text-slate-900 leading-tight uppercase tracking-tight truncate">{item.name}</h4>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[10px] font-bold text-slate-500 font-mono bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200 uppercase">{item.materialCode || 'NO-CODE'}</span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{item.brand || 'Unknown Brand'}</span>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => setSelectedQRItem(item)} className="p-2.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"><QrCode size={18} /></button>
                    <button onClick={() => setEditingItem(item)} className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"><Settings size={18} /></button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100/50">
                    <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1.5">Stock Level</p>
                    <div className="flex items-baseline gap-1">
                      <p className={cn("text-xl font-black", isLow ? "text-rose-600" : "text-blue-600")}>{item.quantity}</p>
                      <p className="text-[10px] font-bold text-slate-500 uppercase">{item.unit}</p>
                    </div>
                  </div>
                  <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100/50">
                    <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1.5">Expiration</p>
                    <p className={cn("text-sm font-bold", (isExpired || isNearingExpiry) ? "text-rose-600" : "text-slate-700")}>
                      {item.expiryDate ? new Date(item.expiryDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100/50">
                  <div className="flex flex-wrap gap-2">
                    {isLow && <span className="px-2 py-1 bg-rose-50 text-rose-600 text-[9px] font-black uppercase tracking-wider rounded-lg border border-rose-100">Low Stock</span>}
                    {isExpired && <span className="px-2 py-1 bg-rose-600 text-white text-[9px] font-black uppercase tracking-wider rounded-lg">Expired</span>}
                    {isNearingExpiry && <span className="px-2 py-1 bg-amber-50 text-amber-600 text-[9px] font-black uppercase tracking-wider rounded-lg border border-amber-100">Expiring Soon</span>}
                    {!isLow && !isExpired && !isNearingExpiry && <span className="px-2 py-1 bg-emerald-50 text-emerald-600 text-[9px] font-black uppercase tracking-wider rounded-lg border border-emerald-100">Healthy</span>}
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => { setSelectedCheckItem(item); setCheckForm({ ...checkForm, physicalQuantity: item.quantity }); setShowStockCheck(true); }}
                      className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition-all"
                    >
                      <ClipboardCheck size={18} />
                    </button>
                    {item.coaFile && (
                      <button 
                        onClick={() => {
                          const win = window.open();
                          if (win) win.document.write(`<iframe src="${item.coaFile}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
                        }}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                      >
                        <FileText size={18} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {stock.length === 0 && (
            <div className="p-12 text-center text-slate-400 font-bold italic">No materials found in warehouse.</div>
          )}
        </div>
      </div>

      {selectedQRItem && (
        <QRCodeModal 
          item={selectedQRItem} 
          onClose={() => setSelectedQRItem(null)} 
        />
      )}

      {showBulkQR && (
        <BulkQRCodeModal 
          items={stock.filter(i => selectedItems.includes(i.id))}
          onClose={() => setShowBulkQR(false)}
        />
      )}

      <AnimatePresence>
        {showStockCheck && selectedCheckItem && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-amber-50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-100 text-amber-600 rounded-xl">
                    <ClipboardCheck size={24} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Pengecekan Stok Fisik</h3>
                    <p className="text-xs text-amber-700 font-medium">{selectedCheckItem.name}</p>
                  </div>
                </div>
                <button onClick={() => setShowStockCheck(false)} className="p-2 hover:bg-white/50 rounded-full transition-colors"><X size={20} /></button>
              </div>
              <form onSubmit={handleStockCheck} className="p-6 space-y-6">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Stok Sistem:</span>
                    <span className="font-bold text-slate-900">{selectedCheckItem.quantity} {selectedCheckItem.unit}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Nomor LOT:</span>
                    <span className="font-mono text-slate-900">{selectedCheckItem.lotNumber || '-'}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Jumlah Fisik Sebenarnya</label>
                  <div className="relative">
                    <input 
                      type="number" step="any" required
                      className="w-full pl-4 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none font-bold text-lg"
                      value={checkForm.physicalQuantity}
                      onChange={e => setCheckForm({ ...checkForm, physicalQuantity: parseFloat(e.target.value) })}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">{selectedCheckItem.unit}</span>
                  </div>
                  {checkForm.physicalQuantity !== selectedCheckItem.quantity && (
                    <p className={cn("text-xs font-bold", (checkForm.physicalQuantity - selectedCheckItem.quantity) < 0 ? "text-rose-500" : "text-emerald-500")}>
                      Selisih: {checkForm.physicalQuantity - selectedCheckItem.quantity} {selectedCheckItem.unit}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Catatan / Keterangan</label>
                  <textarea 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none h-24 resize-none"
                    placeholder="Contoh: Barang rusak, salah input sebelumnya, dll..."
                    value={checkForm.notes}
                    onChange={e => setCheckForm({ ...checkForm, notes: e.target.value })}
                  />
                </div>

                <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
                  <input 
                    type="checkbox"
                    checked={checkForm.updateStock}
                    onChange={e => setCheckForm({ ...checkForm, updateStock: e.target.checked })}
                    className="w-5 h-5 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-bold text-slate-900">Update Stok Sistem</p>
                    <p className="text-[10px] text-slate-500">Sesuaikan jumlah stok di sistem dengan jumlah fisik ini.</p>
                  </div>
                </label>

                <button 
                  type="submit"
                  className="w-full py-4 bg-amber-500 text-white rounded-2xl font-bold hover:bg-amber-600 transition-all shadow-lg shadow-amber-100 flex items-center justify-center gap-2"
                >
                  <Save size={20} /> Simpan Pengecekan
                </button>
              </form>
            </motion.div>
          </div>
        )}

        {showCheckHistory && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white text-amber-600 rounded-xl shadow-sm">
                    <History size={24} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Logbook Pengecekan Stok</h3>
                    <p className="text-xs text-slate-500">Riwayat audit dan verifikasi stok fisik gudang.</p>
                  </div>
                </div>
                <button onClick={() => setShowCheckHistory(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X size={20} /></button>
              </div>
              <div className="flex-1 overflow-auto p-6 custom-scrollbar">
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-white border-b border-slate-100">
                    <tr>
                      <th className="pb-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Waktu</th>
                      <th className="pb-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Bahan / Reagent</th>
                      <th className="pb-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Pemeriksa</th>
                      <th className="pb-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center">Sistem</th>
                      <th className="pb-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center">Fisik</th>
                      <th className="pb-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center">Selisih</th>
                      <th className="pb-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Catatan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {checkHistory.map((check) => (
                      <tr key={check.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-4 pr-4">
                          <div className="text-sm font-medium text-slate-900">{new Date(check.date).toLocaleDateString('id-ID')}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{new Date(check.date).toLocaleTimeString('id-ID')}</div>
                        </td>
                        <td className="py-4 pr-4">
                          <div className="text-sm font-bold text-slate-900">{check.reagentName}</div>
                          <div className="text-[10px] text-slate-500 font-mono">LOT: {check.lotNumber || '-'}</div>
                        </td>
                        <td className="py-4 pr-4">
                          <div className="text-sm text-slate-600">{check.checkedBy}</div>
                        </td>
                        <td className="py-4 text-center font-mono text-sm text-slate-500">{check.systemQuantity}</td>
                        <td className="py-4 text-center font-mono text-sm font-bold text-slate-900">{check.physicalQuantity}</td>
                        <td className="py-4 text-center">
                          <span className={cn(
                            "px-2 py-0.5 rounded-full text-xs font-black",
                            check.discrepancy === 0 ? "bg-emerald-100 text-emerald-700" : 
                            check.discrepancy < 0 ? "bg-rose-100 text-rose-700" : "bg-blue-100 text-blue-700"
                          )}>
                            {check.discrepancy > 0 ? `+${check.discrepancy}` : check.discrepancy}
                          </span>
                        </td>
                        <td className="py-4 max-w-xs">
                          <p className="text-xs text-slate-500 italic line-clamp-2" title={check.notes}>{check.notes || '-'}</p>
                        </td>
                      </tr>
                    ))}
                    {checkHistory.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-20 text-center text-slate-400 italic">Belum ada riwayat pengecekan stok.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>
          </div>
        )}
        {showScanner && (
          <QRScannerModal onScan={handleScan} onClose={() => setShowScanner(false)} />
        )}
      </AnimatePresence>
    </div>
  );
};

const PurchasingView = () => {
  const { profile, settings } = React.useContext(UserContext);
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [purchasingNote, setPurchasingNote] = useState('');
  const [filterLab, setFilterLab] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchRequisitions = async () => {
    setError(null);
    try {
      const res = await fetch('/api/requisitions?limit=100');
      if (res.ok) {
        const result = await res.json();
        setRequisitions(result.data.filter((r: Requisition) => r.status !== 'received' && r.status !== 'rejected') || []);
      } else {
        await handleApiError(res, 'Purchasing Requisitions');
      }
    } catch (error: any) {
      console.error('Error fetching requisitions:', error);
      setError(error.message || 'Gagal terhubung ke server. Silakan periksa koneksi internet Anda.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRequisitions(); }, []);

  const handleUpdateStatus = async (id: number, status?: Requisition['status'], reason?: string, note?: string) => {
    try {
      const body: any = {};
      if (status) body.status = status;
      if (profile?.displayName) body.approvedBy = profile.displayName;
      if (reason !== undefined) body.rejectionReason = reason;
      if (note !== undefined) body.purchasingNote = note;

      const res = await fetch(`/api/requisitions/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Action failed');
        return;
      }
      setRejectingId(null);
      setRejectionReason('');
      setEditingNoteId(null);
      setPurchasingNote('');
      fetchRequisitions();
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const getStatusBadge = (status: Requisition['status']) => {
    switch(status) {
      case 'pending': return <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-bold uppercase">Menunggu</span>;
      case 'po': return <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-bold uppercase">Proses PO</span>;
      case 'shipped': return <span className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-xs font-bold uppercase">Dikirim</span>;
      case 'received': return <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold uppercase">Diterima</span>;
      case 'lab_rejected': return <span className="bg-rose-100 text-rose-700 px-3 py-1 rounded-full text-xs font-bold uppercase">Ditolak Lab</span>;
      case 'rejected': return <span className="bg-rose-100 text-rose-700 px-3 py-1 rounded-full text-xs font-bold uppercase">Ditolak</span>;
      default: return <span className="bg-slate-100 text-slate-700 px-3 py-1 rounded-full text-xs font-bold uppercase">{status}</span>;
    }
  };

  const filteredRequisitions = requisitions.filter(req => {
    const matchesLab = filterLab === 'all' || req.labType === filterLab;
    const matchesStatus = filterStatus === 'all' || req.status === filterStatus;
    const matchesSearch = req.reagentName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         req.requestedBy.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesLab && matchesStatus && matchesSearch;
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-500 font-medium animate-pulse">Memuat data permintaan...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-8 bg-white rounded-3xl border border-slate-200 shadow-sm space-y-6">
        <div className="p-4 bg-rose-50 text-rose-500 rounded-2xl">
          <AlertCircle size={48} />
        </div>
        <div className="text-center space-y-2">
          <h3 className="text-xl font-bold text-slate-900">Terjadi Kesalahan</h3>
          <p className="text-slate-500 max-w-md">{error}</p>
        </div>
        <button 
          onClick={() => fetchRequisitions()}
          className="px-8 py-3 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 flex items-center gap-2"
        >
          <RefreshCw size={20} />
          Coba Lagi
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Manajemen Permintaan Reagent</h2>
          <p className="text-slate-500">Proses permintaan dari lab: Pending → PO → Dikirim.</p>
        </div>
        <button 
          onClick={fetchRequisitions}
          className="p-2 text-slate-400 hover:text-blue-600 transition-colors"
        >
          <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-[200px] relative">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari bahan atau peminta..."
            className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter size={16} className="text-slate-400" />
          <select 
            value={filterLab}
            onChange={(e) => setFilterLab(e.target.value)}
            className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-600 outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Semua Lab</option>
            <option value="udara">{settings.labNames.udara}</option>
            <option value="air">{settings.labNames.air}</option>
            <option value="b3_tanah">{settings.labNames.b3_tanah}</option>
            <option value="mikrobiologi">{settings.labNames.mikrobiologi}</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <Clock size={16} className="text-slate-400" />
          <select 
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-600 outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Semua Status</option>
            <option value="pending">Menunggu</option>
            <option value="po">Proses PO</option>
            <option value="shipped">Dikirim</option>
            <option value="lab_rejected">Ditolak Lab</option>
          </select>
        </div>

        <button 
          onClick={() => {
            setFilterLab('all');
            setFilterStatus('all');
            setSearchQuery('');
          }}
          className="p-3 text-slate-400 hover:text-rose-500 transition-colors rounded-xl hover:bg-rose-50"
          title="Reset Filter"
        >
          <XCircle size={20} />
        </button>
      </div>

      <div className="flex flex-col gap-8">
        {/* Main Content Area */}
        <main className="flex-1 min-w-0">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100">
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Tanggal</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Lab</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Bahan Reagent</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Jumlah</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Peminta</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredRequisitions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-20 text-center">
                        <div className="flex flex-col items-center gap-3 text-slate-400">
                          <CheckCircle2 size={48} className="opacity-20" />
                          <p className="font-medium italic">Tidak ada permintaan yang sesuai filter.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredRequisitions.map(req => (
                      <tr key={req.id} className="group hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-xs font-bold text-slate-500">
                            {new Date(req.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {new Date(req.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-1 rounded-lg bg-slate-100 text-slate-600 text-[10px] font-black uppercase tracking-tighter">
                            {req.labType.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-bold text-slate-900 leading-tight">{req.reagentName}</div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="text-sm font-black text-blue-600">{req.quantity}</div>
                          <div className="text-[10px] text-slate-400 font-bold uppercase">{req.unit}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500">
                              {req.requestedBy?.charAt(0)}
                            </div>
                            <span className="text-xs font-bold text-slate-700">{req.requestedBy}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-2">
                            <div>{getStatusBadge(req.status)}</div>
                            {req.purchasingNote && (
                              <motion.div 
                                whileHover={{ scale: 1.05, x: 5, zIndex: 50 }}
                                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                                className="p-2 bg-blue-50 rounded-lg border border-blue-100 flex items-start gap-2 max-w-[200px] cursor-help shadow-sm hover:shadow-md relative"
                              >
                                <MessageSquare size={12} className="text-blue-500 shrink-0 mt-0.5" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Catatan Purchasing:</p>
                                  <p className="text-[10px] text-blue-500 italic leading-relaxed break-words">{req.purchasingNote}</p>
                                </div>
                              </motion.div>
                            )}
                            {req.status === 'lab_rejected' && (
                              <motion.div 
                                whileHover={{ scale: 1.05, x: 5, zIndex: 50 }}
                                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                                className="p-2 bg-rose-50 rounded-lg border border-rose-100 flex items-start gap-2 max-w-[200px] cursor-help shadow-sm hover:shadow-md relative"
                              >
                                <AlertCircle size={12} className="text-rose-500 shrink-0 mt-0.5" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-[10px] font-bold text-rose-600 uppercase tracking-wider">Alasan Penolakan Lab:</p>
                                  <p className="text-[10px] text-rose-500 italic leading-relaxed break-words">{req.rejectionReason || 'Tidak ada alasan'}</p>
                                </div>
                              </motion.div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button 
                              onClick={() => {
                                setEditingNoteId(req.id);
                                setPurchasingNote(req.purchasingNote || '');
                              }}
                              className="p-2 bg-slate-50 text-slate-600 rounded-xl hover:bg-slate-200 transition-all"
                              title="Tambah/Edit Catatan"
                            >
                              <MessageSquare size={16} />
                            </button>

                            {req.status === 'pending' && (
                              <button 
                                onClick={() => handleUpdateStatus(req.id, 'po')}
                                className="p-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all shadow-sm"
                                title="Proses ke PO"
                              >
                                <ShoppingCart size={16} />
                              </button>
                            )}
                            
                            {req.status === 'po' && (profile?.role === 'admin' || profile?.role === 'purchasing') && (
                              <button 
                                onClick={() => handleUpdateStatus(req.id, 'shipped')}
                                className="p-2 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                                title="Kirim Barang"
                              >
                                <Truck size={16} />
                              </button>
                            )}

                            {req.status === 'lab_rejected' && (
                              <button 
                                onClick={() => handleUpdateStatus(req.id, 'po')}
                                className="p-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all shadow-sm"
                                title="Kirim Ulang (Proses PO)"
                              >
                                <RefreshCw size={16} />
                              </button>
                            )}

                            {(req.receivedPhoto || (req.status === 'lab_rejected' && req.receivedPhoto)) && (
                              <button 
                                onClick={() => {
                                  const win = window.open();
                                  if (win) win.document.write(`<img src="${req.receivedPhoto}" style="max-width:100%; height:auto;" />`);
                                }}
                                className="p-2 bg-slate-50 text-slate-600 rounded-xl hover:bg-slate-200 transition-all"
                                title="Lihat Bukti"
                              >
                                <ImageIcon size={16} />
                              </button>
                            )}

                            {req.status !== 'received' && req.status !== 'rejected' && (
                              <button 
                                onClick={() => setRejectingId(req.id)}
                                className="p-2 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-600 hover:text-white transition-all"
                                title="Tolak Permintaan"
                              >
                                <XCircle size={16} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>

      {/* Rejection Modal */}
      <AnimatePresence>
        {rejectingId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Alasan Penolakan</h3>
                <button onClick={() => { setRejectingId(null); setRejectionReason(''); }} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                  <X size={20} className="text-slate-400" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <textarea 
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Contoh: Stok gudang kosong, spesifikasi tidak sesuai..."
                  className="w-full h-32 p-4 border border-slate-200 rounded-2xl text-sm focus:ring-2 focus:ring-rose-500 outline-none resize-none transition-all"
                  autoFocus
                />
                <div className="flex gap-3">
                  <button 
                    onClick={() => { setRejectingId(null); setRejectionReason(''); }}
                    className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all"
                  >
                    Batal
                  </button>
                  <button 
                    onClick={() => handleUpdateStatus(rejectingId, 'rejected', rejectionReason)}
                    disabled={!rejectionReason.trim()}
                    className="flex-1 px-6 py-3 bg-rose-600 text-white rounded-2xl font-bold hover:bg-rose-700 disabled:opacity-50 shadow-lg shadow-rose-200 transition-all"
                  >
                    Konfirmasi Tolak
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {editingNoteId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Catatan Purchasing</h3>
                <button onClick={() => { setEditingNoteId(null); setPurchasingNote(''); }} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                  <X size={20} className="text-slate-400" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-xs text-slate-500">Tambahkan catatan mengenai keterlambatan atau kendala pembelian bahan ini.</p>
                <textarea 
                  value={purchasingNote}
                  onChange={(e) => setPurchasingNote(e.target.value)}
                  placeholder="Contoh: Sedang menunggu konfirmasi vendor, estimasi barang datang minggu depan..."
                  className="w-full h-32 p-4 border border-slate-200 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none transition-all"
                  autoFocus
                />
                <div className="flex gap-3">
                  <button 
                    onClick={() => { setEditingNoteId(null); setPurchasingNote(''); }}
                    className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all"
                  >
                    Batal
                  </button>
                  <button 
                    onClick={() => handleUpdateStatus(editingNoteId, undefined, undefined, purchasingNote)}
                    className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all"
                  >
                    Simpan Catatan
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

const LabModule = ({ type, title }: { type: LabSample['type'], title: string }) => {
  const [samples, setSamples] = useState<LabSample[]>([]);
  const [workflowSamples, setWorkflowSamples] = useState<any[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newSample, setNewSample] = useState({ sampleName: '' });
  const { profile, expiryThreshold } = React.useContext(UserContext);
  const [activeTab, setActiveTab] = useState<'samples' | 'reagents' | 'daily-use' | 'summary'>('summary');

  // Reagent States
  const [stock, setStock] = useState<StockItem[]>([]);
  const [warehouseStock, setWarehouseStock] = useState<StockItem[]>([]);
  const [generalLabStock, setGeneralLabStock] = useState<StockItem[]>([]);
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [dailyUses, setDailyUses] = useState<DailyUse[]>([]);
  const [showRequest, setShowRequest] = useState(false);
  const [showDailyUse, setShowDailyUse] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [newRequest, setNewRequest] = useState({ reagentName: '', quantity: 0, unit: '' });
  const [newDailyUse, setNewDailyUse] = useState({ reagentName: '', quantity: 0, unit: '', purpose: '', parameter: '' });
  const [receivingId, setReceivingId] = useState<string | null>(null);
  const [showPhotoCapture, setShowPhotoCapture] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [labRejectionReason, setLabRejectionReason] = useState('');
  const [selectedRequisitions, setSelectedRequisitions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  const fetchSamples = async () => {
    try {
      const res = await fetch(`/api/samples?type=${type}&limit=100`);
      if (res.ok) {
        const result = await res.json();
        setSamples(result.data || []);
        return true;
      } else {
        await handleApiError(res, 'Lab Samples');
        return false;
      }
    } catch (error) {
      console.error('Error fetching samples:', error);
      throw error;
    }
  };

  const fetchReagentData = async () => {
    try {
      const [sRes, wRes, gRes, rRes, dRes] = await Promise.all([
        fetch(`/api/stocks?location=lab&labType=${type}&limit=100`),
        fetch('/api/stocks?location=warehouse&limit=100'),
        fetch('/api/stocks?location=lab&labType=general&limit=100'),
        fetch(`/api/requisitions?labType=${type}&limit=100`),
        fetch(`/api/daily-use?labType=${type}&limit=100`)
      ]);
      
      const results = {
        stock: sRes.ok ? (await sRes.json()).data : null,
        warehouse: wRes.ok ? (await wRes.json()).data : null,
        general: gRes.ok ? (await gRes.json()).data : null,
        requisitions: rRes.ok ? (await rRes.json()).data : null,
        dailyUse: dRes.ok ? (await dRes.json()).data : null
      };

      if (results.stock !== null) setStock(results.stock);
      if (results.warehouse !== null) setWarehouseStock(results.warehouse);
      if (results.general !== null) setGeneralLabStock(results.general);
      if (results.requisitions !== null) setRequisitions(results.requisitions);
      if (results.dailyUse !== null) setDailyUses(results.dailyUse);

      if (!sRes.ok && !wRes.ok && !rRes.ok) {
        throw new Error('Gagal memuat data stok dan permintaan');
      }
      return true;
    } catch (error) {
      console.error('Error fetching reagent data:', error);
      throw error;
    }
  };

  const handleReceive = async (id: string, photo?: string) => {
    try {
      const res = await fetch(`/api/requisitions/${id}/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          receivedBy: profile?.displayName,
          receivedPhoto: photo 
        }),
      });
      if (res.ok) {
        fetchReagentData();
        setReceivingId(null);
        setShowPhotoCapture(false);
      } else {
        const err = await res.json();
        alert(err.error || 'Gagal menerima barang');
      }
    } catch (error) {
      console.error('Error receiving requisition:', error);
    }
  };

  const handleLabReject = async (id: string | string[], photo?: string) => {
    if (!labRejectionReason.trim()) {
      alert('Alasan penolakan harus diisi');
      return;
    }
    try {
      const ids = Array.isArray(id) ? id : [id];
      const results = await Promise.all(ids.map(async (reqId) => {
        const res = await fetch(`/api/requisitions/${reqId}/lab-reject`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            rejectedBy: profile?.displayName,
            rejectionReason: labRejectionReason,
            rejectionPhoto: photo
          }),
        });
        return res.ok;
      }));

      if (results.every(r => r)) {
        fetchReagentData();
        setReceivingId(null);
        setShowPhotoCapture(false);
        setIsRejecting(false);
        setLabRejectionReason('');
        setSelectedRequisitions([]);
      } else {
        alert('Beberapa permintaan gagal ditolak. Silakan coba lagi.');
        fetchReagentData();
      }
    } catch (error) {
      console.error('Error rejecting requisition:', error);
    }
  };

  const productivityData = useMemo(() => {
    const days: { [key: string]: number } = {};
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return d.toISOString().split('T')[0];
    }).reverse();

    last7Days.forEach(day => days[day] = 0);

    workflowSamples.forEach(s => {
      if (s.status === 'COMPLETED' && s.completedAt) {
        const day = new Date(s.completedAt.seconds * 1000).toISOString().split('T')[0];
        if (days[day] !== undefined) days[day]++;
      }
    });

    return Object.entries(days).map(([name, count]) => ({ name: new Date(name).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }), count }));
  }, [workflowSamples]);

  const loadAllData = async () => {
    setError(null);
    try {
      if (activeTab === 'samples') {
        await fetchSamples();
      } else if (activeTab === 'summary') {
        await Promise.all([fetchSamples(), fetchReagentData()]);
      } else {
        await fetchReagentData();
      }
    } catch (err: any) {
      setError(err.message || 'Gagal terhubung ke server. Silakan periksa koneksi internet Anda.');
    } finally {
      setIsInitialLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, [type, activeTab]);

  useEffect(() => {
    if (activeTab === 'samples' || activeTab === 'summary') {
      const q = query(
        collection(db, 'app_samples'),
        where('status', 'in', ['VERIFIED', 'IN_PROGRESS', 'NEEDS_QC', 'COMPLETED']),
        where('labType', '==', type)
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setWorkflowSamples(data);
      });

      return () => unsubscribe();
    }
  }, [type, activeTab]);

  const handleAddSample = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSample.sampleName) return;
    try {
      const res = await fetch('/api/samples', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          sampleName: newSample.sampleName,
          status: 'pending',
          analystId: profile?.uid,
        }),
      });
      if (res.ok) {
        setNewSample({ sampleName: '' });
        setIsAdding(false);
        fetchSamples();
      } else {
        console.error('Add sample failed:', res.status);
      }
    } catch (error) {
      console.error('Error adding sample:', error);
    }
  };

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const selected = warehouseStock.find(i => i.name === newRequest.reagentName);
    
    try {
      const res = await fetch('/api/requisitions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          reagentName: newRequest.reagentName,
          quantity: newRequest.quantity,
          unit: selected?.unit || 'ml',
          labType: type, 
          requestedBy: profile?.displayName 
        }),
      });
      if (res.ok) {
        setShowRequest(false);
        setNewRequest({ reagentName: '', quantity: 0, unit: '' });
        fetchReagentData();
      }
    } catch (error) {
      console.error('Error requesting reagent:', error);
    }
  };

  const handleDailyUse = async (e: React.FormEvent) => {
    e.preventDefault();
    const selected = stock.find(i => i.name === newDailyUse.reagentName);
    try {
      const res = await fetch('/api/daily-use', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ...newDailyUse, 
          labType: type, 
          userName: profile?.displayName 
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Failed to record daily use');
        return;
      }
      setShowDailyUse(false);
      setNewDailyUse({ reagentName: '', quantity: 0, unit: '', purpose: '', parameter: '' });
      fetchReagentData();
    } catch (error) {
      console.error('Error recording daily use:', error);
    }
  };

  const handleQRScan = useCallback((data: any) => {
    // Try to find item in lab stock by ID or Name
    const item = stock.find(i => i.id === data.id || i.name === data.name);
    if (item) {
      setNewDailyUse({
        reagentName: item.name,
        quantity: 0,
        unit: item.contentUnit || item.unit, // Prefer content unit (e.g. ML) for daily use
        purpose: '',
        parameter: ''
      });
      setShowQRScanner(false);
      setShowDailyUse(true);
    } else {
      alert('Bahan tidak ditemukan di stok lab ini. Pastikan bahan sudah dipindahkan ke lab ini.');
      setShowQRScanner(false);
    }
  }, [stock]);

  const updateStatus = async (id: string, status: LabSample['status']) => {
    try {
      const res = await fetch(`/api/samples/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        fetchSamples();
      } else {
        console.error('Update status failed:', res.status);
      }
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const updateWorkflowSample = async (id: string, updates: any) => {
    try {
      await updateDoc(doc(db, 'app_samples', id), {
        ...updates,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating workflow sample:', error);
      alert('Gagal memperbarui data sampel');
    }
  };

  const deleteSample = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this sample?')) {
      try {
        const res = await fetch(`/api/samples/${id}`, { method: 'DELETE' });
        if (res.ok) {
          fetchSamples();
        } else {
          console.error('Delete sample failed:', res.status);
        }
      } catch (error) {
        console.error('Error deleting sample:', error);
      }
    }
  };

  const exportToExcel = () => {
    const dataToExport = stock.map(item => ({
      'Nama Reagent': item.name,
      'Kode': item.materialCode || '-',
      'Merek / LOT': `${item.brand || '-'} / ${item.lotNumber || '-'}`,
      'Kedatangan': item.arrivalDate || '-',
      'Stok Lab': item.quantity,
      'Satuan': item.unit,
      'Isi/Kemasan': item.contentUnit || '-',
      'Expired': item.expiryDate || '-',
      'Status': item.quantity <= item.minStock ? 'Menipis' : 
                (item.expiryDate && new Date(item.expiryDate) < new Date() ? 'Expired' : 'Aman')
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stok Lab");
    XLSX.writeFile(wb, `Stok_Lab_${title}_${new Date().toLocaleDateString()}.xlsx`);
  };

  if (isInitialLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-500 font-medium animate-pulse">Memuat data laboratorium...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-8 bg-white rounded-3xl border border-slate-200 shadow-sm space-y-6">
        <div className="p-4 bg-rose-50 text-rose-500 rounded-2xl">
          <AlertCircle size={48} />
        </div>
        <div className="text-center space-y-2">
          <h3 className="text-xl font-bold text-slate-900">Terjadi Kesalahan</h3>
          <p className="text-slate-500 max-w-md">{error}</p>
        </div>
        <button 
          onClick={() => loadAllData()}
          className="px-8 py-3 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 flex items-center gap-2"
        >
          <RefreshCw size={20} />
          Coba Lagi
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{title}</h1>
          <p className="text-slate-500">Manage samples and reagents for this laboratory.</p>
        </div>
        <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm overflow-x-auto max-w-full whitespace-nowrap scrollbar-hide">
          <button 
            onClick={() => setActiveTab('summary')}
            className={cn("px-4 py-2 rounded-lg text-sm font-bold transition-all flex-shrink-0", activeTab === 'summary' ? "bg-blue-600 text-white shadow-md" : "text-slate-500 hover:bg-slate-50")}
          >
            Summary
          </button>
          <button 
            onClick={() => setActiveTab('samples')}
            className={cn("px-4 py-2 rounded-lg text-sm font-bold transition-all flex-shrink-0", activeTab === 'samples' ? "bg-blue-600 text-white shadow-md" : "text-slate-500 hover:bg-slate-50")}
          >
            Samples
          </button>
          <button 
            onClick={() => setActiveTab('reagents')}
            className={cn("px-4 py-2 rounded-lg text-sm font-bold transition-all flex-shrink-0", activeTab === 'reagents' ? "bg-blue-600 text-white shadow-md" : "text-slate-500 hover:bg-slate-50")}
          >
            Reagents
          </button>
          <button 
            onClick={() => setActiveTab('daily-use')}
            className={cn("px-4 py-2 rounded-lg text-sm font-bold transition-all flex-shrink-0", activeTab === 'daily-use' ? "bg-blue-600 text-white shadow-md" : "text-slate-500 hover:bg-slate-50")}
          >
            Daily Use
          </button>
        </div>
      </div>

      {activeTab === 'summary' && (
        <div className="space-y-8">
          {/* Stats Overview */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            <div className="bg-white p-4 md:p-6 rounded-2xl border border-slate-100 shadow-sm">
              <div className="flex items-center gap-3 md:gap-4">
                <div className="p-2 md:p-3 bg-blue-50 text-blue-600 rounded-xl shrink-0">
                  <Microscope size={20} className="md:w-6 md:h-6" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] md:text-sm font-medium text-slate-500 truncate">Total Samples</p>
                  <h3 className="text-lg md:text-2xl font-bold text-slate-900">
                    {samples.length}
                  </h3>
                </div>
              </div>
            </div>
            <div className="bg-white p-4 md:p-6 rounded-2xl border border-slate-100 shadow-sm">
              <div className="flex items-center gap-3 md:gap-4">
                <div className="p-2 md:p-3 bg-amber-50 text-amber-600 rounded-xl shrink-0">
                  <Clock size={20} className="md:w-6 md:h-6" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] md:text-sm font-medium text-slate-500 truncate">Pending Samples</p>
                  <h3 className="text-lg md:text-2xl font-bold text-slate-900">
                    {samples.filter(s => s.status === 'pending').length}
                  </h3>
                </div>
              </div>
            </div>
            <div className="bg-white p-4 md:p-6 rounded-2xl border border-slate-100 shadow-sm">
              <div className="flex items-center gap-3 md:gap-4">
                <div className="p-2 md:p-3 bg-indigo-50 text-indigo-600 rounded-xl shrink-0">
                  <Package size={20} className="md:w-6 md:h-6" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] md:text-sm font-medium text-slate-500 truncate">Total Item Stok</p>
                  <h3 className="text-lg md:text-2xl font-bold text-slate-900">
                    {stock.length}
                  </h3>
                </div>
              </div>
            </div>
            <div className="bg-white p-4 md:p-6 rounded-2xl border border-slate-100 shadow-sm">
              <div className="flex items-center gap-3 md:gap-4">
                <div className="p-2 md:p-3 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
                  <TrendingUp size={20} className="md:w-6 md:h-6" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] md:text-sm font-medium text-slate-500 truncate">Usage (Month)</p>
                  <h3 className="text-lg md:text-2xl font-bold text-slate-900">
                    {dailyUses.filter(u => new Date(u.date).getMonth() === new Date().getMonth()).length}
                  </h3>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Stock Alerts */}
            <div className="lg:col-span-1 bg-white p-6 lg:p-8 rounded-3xl border border-slate-100 shadow-sm space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Stock Alerts</h3>
                <div className="p-2 bg-rose-50 rounded-xl text-rose-500">
                  <AlertCircle size={20} />
                </div>
              </div>
              <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                {stock.filter(item => 
                  item.quantity <= item.minStock || 
                  (item.expiryDate && new Date(item.expiryDate) < new Date(Date.now() + expiryThreshold * 24 * 60 * 60 * 1000))
                ).length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-3">
                    <CheckCircle2 size={48} className="text-emerald-500/20" />
                    <p className="font-medium italic">No critical stock alerts.</p>
                  </div>
                ) : (
                  stock.filter(item => 
                    item.quantity <= item.minStock || 
                    (item.expiryDate && new Date(item.expiryDate) < new Date(Date.now() + expiryThreshold * 24 * 60 * 60 * 1000))
                  ).slice(0, 10).map(item => {
                    const isLow = item.quantity <= item.minStock;
                    const isExpired = item.expiryDate && new Date(item.expiryDate) < new Date();
                    return (
                      <div key={item.id} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100 group hover:bg-white hover:shadow-sm transition-all duration-300">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-slate-600 shadow-sm font-bold group-hover:text-blue-600 transition-colors">
                            {item.name.charAt(0)}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900">{item.name}</p>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{item.brand || 'Unknown Brand'}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={cn(
                            "px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-wider",
                            isExpired ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"
                          )}>
                            {isExpired ? 'Expired' : isLow ? 'Low Stock' : 'Expiring Soon'}
                          </span>
                          <p className="text-sm font-black mt-1 text-slate-700">{item.quantity} {item.unit}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Productivity Chart */}
            <div className="lg:col-span-2 bg-white p-6 lg:p-8 rounded-3xl border border-slate-100 shadow-sm space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Analis Productivity</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Jumlah sampel selesai dalam 7 hari terakhir</p>
                </div>
                <div className="p-2 bg-emerald-50 rounded-xl text-emerald-500">
                  <TrendingUp size={20} />
                </div>
              </div>
              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={productivityData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                    />
                    <Tooltip 
                      cursor={{ fill: '#f8fafc' }}
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', padding: '12px' }}
                      itemStyle={{ fontSize: '12px', fontWeight: 900, color: '#0f172a' }}
                    />
                    <Bar 
                      dataKey="count" 
                      fill="#3b82f6" 
                      radius={[6, 6, 0, 0]} 
                      barSize={40}
                      animationDuration={1500}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Recent Usage */}
            <div className="lg:col-span-1 bg-white p-6 lg:p-8 rounded-3xl border border-slate-100 shadow-sm space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Recent Usage</h3>
                <div className="p-2 bg-blue-50 rounded-xl text-blue-500">
                  <Clock size={20} />
                </div>
              </div>
              <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                {dailyUses.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-3">
                    <TrendingUp size={48} className="text-blue-500/20" />
                    <p className="font-medium italic">No usage recorded yet.</p>
                  </div>
                ) : (
                  dailyUses.slice(0, 10).map(use => (
                    <div key={use.id} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100 group hover:bg-white hover:shadow-sm transition-all duration-300">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-slate-600 shadow-sm font-bold group-hover:text-blue-600 transition-colors">
                          {use.reagentName.charAt(0)}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">{use.reagentName}</p>
                          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider truncate max-w-[150px]">{use.userName} • {use.parameter}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-black text-blue-600">{use.quantity} {use.unit}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{new Date(use.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'samples' && (
        <div className="space-y-6">
          <div className="flex justify-end">
            <button 
              onClick={() => setIsAdding(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
            >
              <Plus size={20} /> Add Sample
            </button>
          </div>

          <AnimatePresence>
            {isAdding && (
              <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm"
              >
                <form onSubmit={handleAddSample} className="flex flex-col md:flex-row gap-4 md:items-end">
                  <div className="flex-1 space-y-2">
                    <label className="text-sm font-bold text-slate-700">Sample Name</label>
                    <input 
                      type="text" 
                      value={newSample.sampleName}
                      onChange={(e) => setNewSample({ sampleName: e.target.value })}
                      placeholder="Enter sample name or ID"
                      className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setIsAdding(false)} className="flex-1 px-4 py-2 text-slate-500 hover:bg-slate-50 rounded-xl transition-all">Cancel</button>
                    <button type="submit" className="flex-1 px-6 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all">Save Sample</button>
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-6 py-4 text-sm font-bold text-slate-600">Sample Name</th>
                  <th className="px-6 py-4 text-sm font-bold text-slate-600">Status</th>
                  <th className="px-6 py-4 text-sm font-bold text-slate-600">Created At</th>
                  <th className="px-6 py-4 text-sm font-bold text-slate-600 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {samples.map((sample) => (
                  <tr key={sample.id} className="hover:bg-slate-50/50 transition-all">
                    <td className="px-6 py-4 font-medium text-slate-900">{sample.sampleName}</td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "px-3 py-1 rounded-full text-xs font-bold uppercase",
                        sample.status === 'pending' && "bg-amber-100 text-amber-600",
                        sample.status === 'in-progress' && "bg-indigo-100 text-indigo-600",
                        sample.status === 'completed' && "bg-emerald-100 text-emerald-600",
                      )}>
                        {sample.status.replace('-', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {new Date(sample.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <select 
                        value={sample.status}
                        onChange={(e) => updateStatus(sample.id, e.target.value as LabSample['status'])}
                        className="text-xs border border-slate-200 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="pending">Pending</option>
                        <option value="in-progress">In Progress</option>
                        <option value="completed">Completed</option>
                      </select>
                      {profile?.role === 'admin' && (
                        <button onClick={() => deleteSample(sample.id)} className="p-1 text-slate-400 hover:text-red-500 transition-all">
                          <Trash2 size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}

                {/* Workflow Samples Section */}
                {workflowSamples.length > 0 && (
                  <tr className="bg-slate-100/50">
                    <td colSpan={4} className="px-6 py-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                      Workflow Samples (From Field)
                    </td>
                  </tr>
                )}
                {workflowSamples.map((sample) => {
                  const isOverdue = sample.deadlineAt && new Date(sample.deadlineAt.seconds * 1000) < new Date();
                  const lowStockItems = stock.filter(i => i.quantity <= i.minStock);

                  return (
                    <tr key={sample.id} className={cn(
                      "hover:bg-blue-50/30 transition-all border-l-4",
                      isOverdue ? "border-rose-500 bg-rose-50/30" : "border-blue-500"
                    )}>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-black text-slate-900 uppercase tracking-tight">{sample.sampleName}</span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] font-bold text-slate-400 capitalize">{sample.type}</span>
                            <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-md border border-blue-100 flex items-center gap-1">
                              <ThermometerSnowflake className="w-2.5 h-2.5" />
                              {sample.chillerLocation || 'No Loc'}
                            </span>
                          </div>
                          <span className="text-[9px] font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded w-fit mt-1">
                             Metode: {sample.method || 'Default Standard'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <span className={cn(
                            "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tight w-fit",
                            sample.status === 'VERIFIED' && "bg-amber-100 text-amber-600",
                            sample.status === 'IN_PROGRESS' && "bg-indigo-100 text-indigo-600",
                            sample.status === 'COMPLETED' && "bg-emerald-100 text-emerald-600",
                            sample.status === 'NEEDS_QC' && "bg-rose-100 text-rose-600",
                          )}>
                            {sample.status.replace('_', ' ')}
                          </span>
                          {sample.deadlineAt && (
                            <span className={cn(
                              "text-[9px] font-black uppercase flex items-center gap-1",
                              isOverdue ? "text-rose-600" : "text-slate-400"
                            )}>
                               <Clock className="w-3 h-3" />
                               {isOverdue ? 'Overdue' : 'Target:'} {new Date(sample.deadlineAt.seconds * 1000).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                         <div className="flex flex-col gap-2">
                            <span className="text-[10px] text-slate-500 font-bold uppercase">
                              {sample.verifiedAt ? new Date(sample.verifiedAt.seconds * 1000).toLocaleDateString() : '-'}
                            </span>
                            {lowStockItems.length > 0 && sample.status !== 'COMPLETED' && (
                               <div className="flex items-center gap-1.5 p-1.5 bg-rose-50 border border-rose-100 rounded-lg text-rose-600 animate-pulse">
                                  <AlertCircle className="w-3 h-3" />
                                  <span className="text-[8px] font-black uppercase">Stock Warning: {lowStockItems.length} Reagents Low</span>
                               </div>
                            )}
                         </div>
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <div className="flex items-center justify-end gap-2">
                          {sample.status === 'VERIFIED' && (
                            <button 
                              onClick={() => updateWorkflowSample(sample.id, { 
                                status: 'IN_PROGRESS', 
                                analystId: profile?.uid, 
                                analystName: profile?.displayName,
                                startedAt: Timestamp.now()
                              })}
                              className="text-[10px] font-black bg-blue-600 text-white px-3 py-1.5 rounded-lg uppercase tracking-widest hover:bg-blue-700 transition-all shadow-md active:scale-95"
                            >
                              Claim
                            </button>
                          )}
                          {sample.status === 'IN_PROGRESS' && (
                            <div className="flex items-center gap-2">
                              <input 
                                type="text" 
                                placeholder="Kadar..."
                                className="w-20 px-2 py-1 text-xs border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    // Option to flow into QC check
                                    const nextStatus = sample.type === 'mikrobiologi' ? 'NEEDS_QC' : 'COMPLETED';
                                    updateWorkflowSample(sample.id, { 
                                      result: (e.target as HTMLInputElement).value, 
                                      status: nextStatus,
                                      completedAt: Timestamp.now()
                                    });
                                  }
                                }}
                              />
                            </div>
                          )}
                          {sample.status === 'NEEDS_QC' && profile?.role === 'admin' && (
                             <button 
                               onClick={() => updateWorkflowSample(sample.id, { status: 'COMPLETED', qcVerifiedBy: profile?.uid })}
                               className="text-[10px] font-black bg-emerald-600 text-white px-3 py-1.5 rounded-lg uppercase tracking-widest hover:bg-emerald-700 transition-all"
                             >
                               Verify QC
                             </button>
                          )}
                          {sample.status === 'COMPLETED' && (
                            <div className="flex flex-col items-end">
                               <span className="text-[10px] font-black text-emerald-600 uppercase border border-emerald-200 bg-emerald-50 px-2 py-1 rounded-md">
                                 Res: {sample.result || '-'}
                               </span>
                               {sample.startedAt && sample.completedAt && (
                                  <span className="text-[8px] text-slate-400 font-bold uppercase mt-1">
                                     TAT: {Math.floor((sample.completedAt.seconds - sample.startedAt.seconds) / 60)} Mins
                                  </span>
                               )}
                            </div>
                          )}
                          {(profile?.role === 'admin' || profile?.role === 'analyst') && (
                            <select 
                              value={sample.status}
                              onChange={(e) => updateWorkflowSample(sample.id, { status: e.target.value })}
                              className="text-[10px] border border-slate-200 rounded-lg px-2 py-1 outline-none font-bold uppercase tracking-tight"
                            >
                              <option value="VERIFIED">Verified</option>
                              <option value="IN_PROGRESS">Progress</option>
                              <option value="NEEDS_QC">Needs QC</option>
                              <option value="COMPLETED">Done</option>
                            </select>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {samples.length === 0 && workflowSamples.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-slate-400">No samples found for this category.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'reagents' && (
        <div className="space-y-6">
          <div className="flex justify-end">
            <button 
              onClick={() => setShowRequest(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
            >
              <Plus size={20} /> Minta Reagent ke Gudang
            </button>
          </div>

          {showRequest && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
              <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-md w-full space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold">Permintaan Bahan</h3>
                  <button onClick={() => setShowRequest(false)} className="text-slate-400 hover:text-slate-600">
                    <X size={24} />
                  </button>
                </div>
                <form onSubmit={handleRequest} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Pilih Bahan dari Gudang</label>
                    <select 
                      required className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                      value={newRequest.reagentName} onChange={e => {
                        const selected = warehouseStock.find(i => i.name === e.target.value);
                        setNewRequest({...newRequest, reagentName: e.target.value, unit: selected?.unit || 'pcs'});
                      }}
                    >
                      <option value="">Pilih Bahan...</option>
                      {warehouseStock.map(i => (
                        <option key={i.id} value={i.name}>{i.name} (Tersedia: {i.quantity} {i.unit})</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Jumlah</label>
                      <input 
                        type="number" required step="0.01"
                        className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                        value={newRequest.quantity} onChange={e => setNewRequest({...newRequest, quantity: parseFloat(e.target.value)})}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Satuan</label>
                      <input 
                        type="text" readOnly
                        className="w-full px-4 py-2 rounded-xl border border-slate-200 bg-slate-100 text-slate-500"
                        value={newRequest.unit}
                      />
                    </div>
                  </div>
                  <div className="flex gap-3 pt-4">
                    <button type="button" onClick={() => setShowRequest(false)} className="flex-1 border border-slate-200 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-all">Batal</button>
                    <button type="submit" className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all">Kirim Permintaan</button>
                  </div>
                </form>
              </div>
            </motion.div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <h3 className="font-bold text-slate-900">Stok Reagent di Lab</h3>
                  <button 
                    onClick={exportToExcel}
                    className="bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg flex items-center gap-2 hover:bg-slate-200 transition-all text-xs font-bold"
                  >
                    <FileSpreadsheet size={16} /> Export Excel
                  </button>
                </div>
                <Package className="text-slate-400" size={20} />
              </div>
              
              {/* Desktop Table */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Nama Reagent</th>
                      <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Kode</th>
                      <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Merek / LOT</th>
                      <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Kedatangan</th>
                      <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Stok Lab</th>
                      <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Isi/Kemasan</th>
                      <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Expired</th>
                      <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">COA</th>
                      <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {stock.length === 0 ? (
                      <tr><td colSpan={10} className="px-6 py-8 text-center text-slate-400 italic">Belum ada stok di lab ini. Silakan minta ke gudang.</td></tr>
                    ) : stock.map(item => {
                      const isLow = item.quantity <= item.minStock;
                      const isExpired = item.expiryDate && new Date(item.expiryDate) < new Date();
                      const isNearingExpiry = item.expiryDate && 
                        new Date(item.expiryDate) > new Date() && 
                        new Date(item.expiryDate) < new Date(Date.now() + expiryThreshold * 24 * 60 * 60 * 1000);

                      return (
                        <tr key={item.id} className={cn("hover:bg-slate-50 transition-colors", (isLow || isExpired || isNearingExpiry) && "bg-rose-50/30")}>
                          <td className="px-6 py-4 font-medium text-slate-900">
                            <div>{item.name}</div>
                          </td>
                          <td className="px-6 py-4 text-slate-600 font-mono text-xs">{item.materialCode || '-'}</td>
                          <td className="px-6 py-4 text-slate-600 text-sm">
                            <div className="font-medium">{item.brand || '-'}</div>
                            <div className="text-[10px] text-slate-400 font-mono">LOT: {item.lotNumber || '-'}</div>
                          </td>
                          <td className="px-6 py-4 text-slate-600 text-sm">
                            {item.arrivalDate ? new Date(item.arrivalDate).toLocaleDateString('id-ID') : '-'}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className={cn("font-bold", isLow ? "text-rose-600" : "text-blue-600")}>
                                {item.quantity} {item.unit}
                              </span>
                              {item.totalContent !== undefined && (
                                <span className="text-[10px] text-indigo-600 font-black">
                                  ({item.totalContent} {item.contentUnit})
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-slate-600 text-sm">
                            {item.contentPerUnit} {item.contentUnit}
                          </td>
                          <td className={cn("px-6 py-4 text-sm", (isExpired || isNearingExpiry) ? "text-rose-600 font-bold" : "text-slate-600")}>
                            {item.expiryDate ? new Date(item.expiryDate).toLocaleDateString('id-ID') : '-'}
                          </td>
                          <td className="px-6 py-4">
                            {item.coaFile ? (
                              <button 
                                onClick={() => {
                                  const win = window.open();
                                  if (win) {
                                    win.document.write(`<iframe src="${item.coaFile}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
                                  }
                                }}
                                className="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-[10px] font-bold uppercase"
                              >
                                <FileText size={12} /> Lihat
                              </button>
                            ) : (
                              <span className="text-slate-400 text-[10px] italic">Tidak ada</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col gap-1">
                              {isLow && (
                                <span className="flex items-center gap-1 text-rose-600 text-[10px] font-bold">
                                  <AlertCircle size={12} /> Menipis
                                </span>
                              )}
                              {isExpired && (
                                <span className="flex items-center gap-1 text-rose-600 text-[10px] font-bold">
                                  <AlertCircle size={12} /> Expired
                                </span>
                              )}
                              {isNearingExpiry && (
                                <span className="flex items-center gap-1 text-amber-600 text-[10px] font-bold">
                                  <Clock size={12} /> Akan Expired
                                </span>
                              )}
                              {!isLow && !isExpired && !isNearingExpiry && (
                                <span className="flex items-center gap-1 text-emerald-600 text-[10px] font-bold">
                                  <CheckCircle2 size={12} /> Aman
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card List */}
              <div className="lg:hidden divide-y divide-slate-100">
                {stock.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 italic">Belum ada stok di lab ini.</div>
                ) : stock.map(item => {
                  const isLow = item.quantity <= item.minStock;
                  const isExpired = item.expiryDate && new Date(item.expiryDate) < new Date();
                  const isNearingExpiry = item.expiryDate && 
                    new Date(item.expiryDate) > new Date() && 
                    new Date(item.expiryDate) < new Date(Date.now() + expiryThreshold * 24 * 60 * 60 * 1000);

                  return (
                    <div key={item.id} className={cn("p-5 space-y-4 relative overflow-hidden group", (isLow || isExpired || isNearingExpiry) && "bg-rose-50/20")}>
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-black text-slate-900 leading-tight uppercase tracking-tight truncate">{item.name}</h4>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] font-bold text-slate-500 font-mono bg-slate-100 px-1.5 py-0.5 rounded uppercase">{item.materialCode || 'NO-CODE'}</span>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{item.brand || 'Unknown Brand'}</span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end shrink-0">
                          <div className={cn("px-3 py-1 rounded-xl text-xs font-black shadow-sm", isLow ? "bg-rose-100 text-rose-600" : "bg-blue-100 text-blue-600")}>
                            {item.quantity} {item.unit}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-50/50 p-3 rounded-2xl border border-slate-100/50">
                          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">LOT Number</p>
                          <p className="text-xs font-black text-slate-700 truncate font-mono">{item.lotNumber || '-'}</p>
                        </div>
                        <div className="bg-slate-50/50 p-3 rounded-2xl border border-slate-100/50">
                          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Expiry Date</p>
                          <p className={cn("text-xs font-black", (isExpired || isNearingExpiry) ? "text-rose-600" : "text-slate-700")}>
                            {item.expiryDate ? new Date(item.expiryDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2">
                        <div className="flex flex-wrap gap-2">
                          {isLow && (
                            <span className="flex items-center gap-1 px-2 py-1 bg-rose-100 text-rose-600 text-[9px] font-black uppercase tracking-wider rounded-full">
                              <AlertCircle size={10} /> Low Stock
                            </span>
                          )}
                          {isExpired && (
                            <span className="flex items-center gap-1 px-2 py-1 bg-rose-100 text-rose-600 text-[9px] font-black uppercase tracking-wider rounded-full">
                              <AlertCircle size={10} /> Expired
                            </span>
                          )}
                          {isNearingExpiry && (
                            <span className="flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-600 text-[9px] font-black uppercase tracking-wider rounded-full">
                              <Clock size={10} /> Expiring Soon
                            </span>
                          )}
                          {!isLow && !isExpired && !isNearingExpiry && (
                            <span className="flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-600 text-[9px] font-black uppercase tracking-wider rounded-full">
                              <CheckCircle2 size={10} /> Safe
                            </span>
                          )}
                        </div>
                        {item.coaFile && (
                          <button 
                            onClick={() => {
                              const win = window.open();
                              if (win) win.document.write(`<iframe src="${item.coaFile}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
                            }}
                            className="text-blue-600 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 bg-blue-50 px-3 py-1.5 rounded-full hover:bg-blue-100 transition-colors"
                          >
                            <FileText size={12} /> View COA
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-slate-50/30">
                <div className="flex items-center gap-4">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2">
                    <Clock size={20} className="text-blue-600" />
                    Status Permintaan Bahan
                  </h3>
                  {selectedRequisitions.length > 0 && (
                    <button 
                      onClick={() => {
                        setIsRejecting(true);
                        setReceivingId('bulk');
                      }}
                      className="px-3 py-1 bg-rose-600 text-white text-[10px] font-black uppercase rounded-lg hover:bg-rose-700 transition-all flex items-center gap-1.5 shadow-lg shadow-rose-100"
                    >
                      <XCircle size={12} /> Tolak {selectedRequisitions.length} Item
                    </button>
                  )}
                </div>
                <span className="px-3 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-full">
                  {requisitions.filter(r => r.status !== 'received').length} Aktif
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-100">
                      <th className="px-4 py-3 w-10">
                        <input 
                          type="checkbox"
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          checked={selectedRequisitions.length > 0 && selectedRequisitions.length === requisitions.filter(r => r.status === 'shipped').length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedRequisitions(requisitions.filter(r => r.status === 'shipped').map(r => r.id.toString()));
                            } else {
                              setSelectedRequisitions([]);
                            }
                          }}
                        />
                      </th>
                      <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Tanggal</th>
                      <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Bahan</th>
                      <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Jumlah</th>
                      <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                      <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {requisitions.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-400 italic text-sm">Belum ada permintaan bahan.</td>
                      </tr>
                    ) : requisitions.map(req => (
                      <tr key={req.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3">
                          {req.status === 'shipped' && (
                            <input 
                              type="checkbox"
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                              checked={selectedRequisitions.includes(req.id.toString())}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedRequisitions([...selectedRequisitions, req.id.toString()]);
                                } else {
                                  setSelectedRequisitions(selectedRequisitions.filter(id => id !== req.id.toString()));
                                }
                              }}
                            />
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-[10px] font-bold text-slate-500">{new Date(req.createdAt).toLocaleDateString('id-ID')}</div>
                          <div className="text-[9px] text-slate-400">{new Date(req.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-900 text-sm leading-tight">{req.reagentName}</div>
                          {(req.status === 'rejected' || req.status === 'lab_rejected') && req.rejectionReason && (
                            <motion.div 
                              whileHover={{ scale: 1.1, x: 10, zIndex: 50 }}
                              className="text-[9px] text-rose-500 italic mt-0.5 cursor-help relative origin-left"
                            >
                              Alasan: {req.rejectionReason}
                            </motion.div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="text-sm font-black text-slate-700">{req.quantity}</div>
                          <div className="text-[9px] text-slate-400 font-bold uppercase">{req.unit}</div>
                        </td>
                        <td className="px-4 py-3">
                          {req.status === 'pending' && <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[9px] font-black uppercase">Menunggu</span>}
                          {req.status === 'po' && <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-[9px] font-black uppercase">Proses PO</span>}
                          {req.status === 'shipped' && <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-[9px] font-black uppercase">Dikirim</span>}
                          {req.status === 'received' && <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[9px] font-black uppercase">Diterima</span>}
                          {(req.status === 'rejected' || req.status === 'lab_rejected') && <span className="px-2 py-0.5 bg-rose-100 text-rose-700 rounded-full text-[9px] font-black uppercase">Ditolak</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {req.status === 'shipped' && (
                              <>
                                <button 
                                  onClick={() => { 
                                    setReceivingId(req.id); 
                                    setIsRejecting(false);
                                    setShowPhotoCapture(true); 
                                  }}
                                  className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-600 hover:text-white transition-all"
                                  title="Konfirmasi Terima"
                                >
                                  <CheckCircle2 size={14} />
                                </button>
                                <button 
                                  onClick={() => {
                                    setReceivingId(req.id);
                                    setIsRejecting(true);
                                  }}
                                  className="p-1.5 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-600 hover:text-white transition-all"
                                  title="Tolak Barang"
                                >
                                  <XCircle size={14} />
                                </button>
                              </>
                            )}
                            {req.receivedPhoto && (
                              <button 
                                onClick={() => {
                                  const win = window.open();
                                  if (win) win.document.write(`<img src="${req.receivedPhoto}" style="max-width:100%; height:auto;" />`);
                                }}
                                className="p-1.5 bg-slate-50 text-slate-600 rounded-lg hover:bg-slate-200 transition-all"
                                title="Lihat Bukti Foto"
                              >
                                <ImageIcon size={14} />
                              </button>
                            )}
                          </div>
                          
                          {receivingId === req.id && isRejecting && !showPhotoCapture && (
                            <div className="mt-2 p-3 bg-rose-50 rounded-xl border border-rose-100 space-y-2 text-left">
                              <textarea 
                                value={labRejectionReason}
                                onChange={(e) => setLabRejectionReason(e.target.value)}
                                placeholder="Alasan penolakan..."
                                className="w-full p-2 text-[10px] border border-rose-200 rounded-lg focus:ring-1 focus:ring-rose-500 outline-none resize-none"
                                rows={2}
                              />
                              <div className="flex gap-1.5">
                                <button 
                                  onClick={() => setShowPhotoCapture(true)}
                                  disabled={!labRejectionReason.trim()}
                                  className="flex-1 bg-rose-600 text-white py-1 rounded-lg text-[10px] font-bold disabled:opacity-50"
                                >
                                  Foto & Kirim
                                </button>
                                <button 
                                  onClick={() => { setReceivingId(null); setIsRejecting(false); setLabRejectionReason(''); }}
                                  className="px-2 py-1 bg-white text-slate-500 rounded-lg text-[10px] border border-slate-200"
                                >
                                  Batal
                                </button>
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {receivingId === 'bulk' && isRejecting && !showPhotoCapture && (
                      <tr>
                        <td colSpan={6} className="px-4 py-4 bg-rose-50/50">
                          <div className="max-w-md mx-auto p-4 bg-white rounded-2xl border border-rose-100 shadow-sm space-y-3">
                            <div className="flex items-center justify-between">
                              <h4 className="text-xs font-black text-rose-600 uppercase tracking-tight">Tolak {selectedRequisitions.length} Item Terpilih</h4>
                              <button onClick={() => { setReceivingId(null); setIsRejecting(false); setLabRejectionReason(''); }} className="text-slate-400 hover:text-slate-600">
                                <X size={14} />
                              </button>
                            </div>
                            <textarea 
                              value={labRejectionReason}
                              onChange={(e) => setLabRejectionReason(e.target.value)}
                              placeholder="Alasan penolakan untuk semua item terpilih..."
                              className="w-full p-3 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none resize-none"
                              rows={3}
                            />
                            <div className="flex gap-2">
                              <button 
                                onClick={() => setShowPhotoCapture(true)}
                                disabled={!labRejectionReason.trim()}
                                className="flex-1 bg-rose-600 text-white py-2 rounded-xl text-xs font-bold disabled:opacity-50 shadow-lg shadow-rose-100"
                              >
                                Ambil Foto & Tolak Semua
                              </button>
                              <button 
                                onClick={() => { setReceivingId(null); setIsRejecting(false); setLabRejectionReason(''); }}
                                className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold"
                              >
                                Batal
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {showPhotoCapture && receivingId && (
              <PhotoCaptureModal 
                onClose={() => { setShowPhotoCapture(false); setReceivingId(null); setIsRejecting(false); }}
                onCapture={(photo) => {
                  if (receivingId === 'bulk') {
                    handleLabReject(selectedRequisitions, photo);
                  } else {
                    isRejecting ? handleLabReject(receivingId, photo) : handleReceive(receivingId, photo);
                  }
                }}
              />
            )}
          </div>
        </div>
      )}

      {activeTab === 'daily-use' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-end gap-2">
            <button 
              onClick={() => setShowQRScanner(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-xl flex items-center justify-center gap-2 hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
            >
              <Maximize size={20} /> Scan QR Code
            </button>
            <button 
              onClick={() => setShowDailyUse(true)}
              className="bg-emerald-600 text-white px-4 py-2 rounded-xl flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200"
            >
              <Clock size={20} /> Catat Pemakaian Harian
            </button>
          </div>

          {showDailyUse && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
              <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-md w-full space-y-6">
                <h3 className="text-xl font-bold">Catat Pemakaian Harian</h3>
                <form onSubmit={handleDailyUse} className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-slate-700">Pilih Reagent dari Stok Lab</label>
                      <button 
                        type="button"
                        onClick={() => {
                          setShowDailyUse(false);
                          setShowQRScanner(true);
                        }}
                        className="text-blue-600 text-xs font-bold flex items-center gap-1 hover:underline"
                      >
                        <QrCode size={14} /> Scan QR
                      </button>
                    </div>
                    <select 
                      required className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                      value={newDailyUse.reagentName} onChange={e => {
                        const selected = stock.find(i => i.name === e.target.value);
                        setNewDailyUse({
                          ...newDailyUse, 
                          reagentName: e.target.value,
                          unit: selected?.contentUnit || selected?.unit || 'ml'
                        });
                      }}
                    >
                      <option value="">Pilih Reagent...</option>
                      {stock.map(i => (
                        <option key={i.id} value={i.name}>
                          {i.name} {i.lotNumber ? `[LOT: ${i.lotNumber}]` : ''} (Stok: {i.totalContent !== undefined ? `${i.totalContent} ${i.contentUnit}` : `${i.quantity} ${i.unit}`})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Jumlah Pakai ({newDailyUse.unit || '-'})</label>
                      <input 
                        type="number" required step="0.01"
                        className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                        value={newDailyUse.quantity} onChange={e => setNewDailyUse({...newDailyUse, quantity: parseFloat(e.target.value)})}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Parameter</label>
                      <input 
                        type="text" required
                        className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                        value={newDailyUse.parameter} onChange={e => setNewDailyUse({...newDailyUse, parameter: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Tujuan Penggunaan</label>
                    <textarea 
                      required className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                      value={newDailyUse.purpose} onChange={e => setNewDailyUse({...newDailyUse, purpose: e.target.value})}
                    />
                  </div>
                  <div className="flex gap-3 pt-4">
                    <button type="submit" className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-bold">Simpan Pemakaian</button>
                    <button type="button" onClick={() => {
                      setShowDailyUse(false);
                      setNewDailyUse({ reagentName: '', quantity: 0, unit: '', purpose: '', parameter: '' });
                    }} className="flex-1 border border-slate-200 py-3 rounded-xl font-bold">Batal</button>
                  </div>
                </form>
              </div>
            </motion.div>
          )}

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-900">Riwayat Pemakaian Harian</h3>
              <Clock className="text-slate-400" size={20} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Tanggal & Waktu</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">User</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Reagent</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Jumlah</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Parameter</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Tujuan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {dailyUses.map(use => (
                    <tr key={use.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 text-sm text-slate-600">{new Date(use.date).toLocaleString('id-ID')}</td>
                      <td className="px-6 py-4 text-sm font-medium text-slate-900">{use.userName}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">{use.reagentName}</td>
                      <td className="px-6 py-4 text-sm font-bold text-slate-900">{use.quantity} {use.unit}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">{use.parameter}</td>
                      <td className="px-6 py-4 text-sm text-slate-600 max-w-xs truncate">{use.purpose}</td>
                    </tr>
                  ))}
                  {dailyUses.length === 0 && (
                    <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic">Belum ada riwayat pemakaian harian.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {showQRScanner && (
        <QRScannerModal 
          onScan={handleQRScan} 
          onClose={() => setShowQRScanner(false)} 
        />
      )}
    </div>
  );
};

const StockManagement = ({ location }: { location: 'lab' | 'warehouse' }) => {
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newItem, setNewItem] = useState({ name: '', quantity: 0, unit: 'pcs', labType: 'general' });
  const { profile } = React.useContext(UserContext);

  const fetchStocks = async () => {
    try {
      const res = await fetch(`/api/stocks?location=${location}`);
      if (res.ok) {
        setStocks(await res.json());
      } else {
        console.error('Fetch stocks failed:', res.status);
      }
    } catch (error) {
      console.error('Error fetching stocks:', error);
    }
  };

  useEffect(() => {
    fetchStocks();
  }, [location]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.name) return;
    try {
      const res = await fetch('/api/stocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newItem,
          location,
        }),
      });
      if (res.ok) {
        setNewItem({ name: '', quantity: 0, unit: 'pcs', labType: 'general' });
        setIsAdding(false);
        fetchStocks();
      } else {
        console.error('Add stocks failed:', res.status);
      }
    } catch (error) {
      console.error('Error adding stocks:', error);
    }
  };

  const updateQuantity = async (id: string, delta: number) => {
    const item = stocks.find(s => s.id === id);
    if (!item) return;
    try {
      const res = await fetch(`/api/stocks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quantity: Math.max(0, item.quantity + delta),
        }),
      });
      if (res.ok) {
        fetchStocks();
      } else {
        console.error('Update quantity failed:', res.status);
      }
    } catch (error) {
      console.error('Error updating quantity:', error);
    }
  };

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Stok {location === 'lab' ? 'Lab' : 'Gudang'}</h1>
          <p className="text-slate-500">Manage inventory and stock levels for {location}.</p>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
        >
          <Plus size={20} />
          Add Item
        </button>
      </div>

      <AnimatePresence>
        {isAdding && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm"
          >
            <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">Item Name</label>
                <input 
                  type="text" 
                  value={newItem.name}
                  onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">Quantity & Unit</label>
                <div className="flex gap-2">
                  <input 
                    type="number" 
                    value={newItem.quantity}
                    onChange={(e) => setNewItem({ ...newItem, quantity: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input 
                    type="text" 
                    value={newItem.unit}
                    onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
                    className="w-24 px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              {location === 'lab' && (
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Lab Category</label>
                  <select 
                    value={newItem.labType}
                    onChange={(e) => setNewItem({ ...newItem, labType: e.target.value })}
                    className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="general">General</option>
                    <option value="udara">Udara</option>
                    <option value="air">Air</option>
                    <option value="b3_tanah">B3 & Tanah</option>
                    <option value="mikrobiologi">Mikrobiologi</option>
                  </select>
                </div>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={() => setIsAdding(false)} className="flex-1 px-4 py-2 text-slate-500 hover:bg-slate-50 rounded-xl transition-all">Cancel</button>
                <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all">Save</button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {stocks.map((item) => (
          <div key={item.id} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all group">
            <div className="flex items-start justify-between mb-4">
              <div className="bg-slate-50 p-3 rounded-xl group-hover:bg-blue-50 transition-all">
                <Package className="text-slate-400 group-hover:text-blue-600" size={24} />
              </div>
              {item.labType && (
                <span className="px-2 py-1 bg-slate-100 text-slate-500 text-[10px] font-bold uppercase rounded-md">
                  {item.labType}
                </span>
              )}
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-1">{item.name}</h3>
            <div className="flex items-baseline gap-2 mb-6">
              <span className={cn(
                "text-2xl font-black",
                item.quantity < 10 ? "text-red-600" : "text-blue-600"
              )}>{item.quantity}</span>
              <span className="text-slate-400 font-medium">{item.unit}</span>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => updateQuantity(item.id, -1)}
                className="flex-1 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl font-bold transition-all"
              >
                -1
              </button>
              <button 
                onClick={() => updateQuantity(item.id, 1)}
                className="flex-1 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl font-bold transition-all"
              >
                +1
              </button>
            </div>
          </div>
        ))}
        {stocks.length === 0 && (
          <div className="col-span-full py-20 text-center text-slate-400 border-2 border-dashed border-slate-100 rounded-3xl">
            <Package size={48} className="mx-auto mb-3 opacity-20" />
            <p>No inventory items found.</p>
          </div>
        )}
      </div>
    </div>
  );
};

const ReportsView = () => {
  const [data, setData] = useState<DailyUse[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    labType: '',
    reagentName: '',
    startDate: '',
    endDate: ''
  });

  const fetchReports = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({ ...filters, limit: '1000' }).toString();
      const res = await fetch(`/api/daily-use?${queryParams}`);
      if (res.ok) {
        const result = await res.json();
        setData(result.data || []);
      } else {
        await handleApiError(res, 'Reports');
      }
    } catch (error) {
      console.error('Fetch reports error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [filters]);

  // Process data for charts
  const chartData = data.reduce((acc: any[], curr) => {
    const date = new Date(curr.date).toLocaleDateString();
    const existing = acc.find(item => item.date === date);
    const quantity = Number(curr.quantity) || 0;
    if (existing) {
      existing.quantity += quantity;
    } else {
      acc.push({ date, quantity });
    }
    return acc;
  }, []);

  const labDistribution = data.reduce((acc: any[], curr) => {
    const existing = acc.find(item => item.name === curr.labType);
    const quantity = Number(curr.quantity) || 0;
    if (existing) {
      existing.value += quantity;
    } else {
      acc.push({ name: curr.labType, value: quantity });
    }
    return acc;
  }, []);

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

  return (
    <div className="p-8 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Usage Reports</h1>
          <p className="text-slate-500">Visualize reagent usage trends and distributions</p>
        </div>
        <button 
          onClick={fetchReports}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <TrendingUp size={18} />
          Refresh Data
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-medium text-slate-700 mb-1">Lab Type</label>
          <select 
            value={filters.labType}
            onChange={(e) => setFilters({...filters, labType: e.target.value})}
            className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          >
            <option value="">All Labs</option>
            <option value="udara">Lab Udara</option>
            <option value="air">Lab Air</option>
            <option value="b3_tanah">Lab B3 & Tanah</option>
            <option value="mikrobiologi">Lab Mikrobiologi</option>
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-medium text-slate-700 mb-1">Reagent Name</label>
          <input 
            type="text"
            placeholder="Search reagent..."
            value={filters.reagentName}
            onChange={(e) => setFilters({...filters, reagentName: e.target.value})}
            className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
          <input 
            type="date"
            value={filters.startDate}
            onChange={(e) => setFilters({...filters, startDate: e.target.value})}
            className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-medium text-slate-700 mb-1">End Date</label>
          <input 
            type="date"
            value={filters.endDate}
            onChange={(e) => setFilters({...filters, endDate: e.target.value})}
            className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Usage Trend */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <h2 className="text-lg font-bold text-slate-900 mb-6">Usage Trend Over Time</h2>
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dx={-10} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  />
                  <Line type="monotone" dataKey="quantity" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Lab Distribution */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <h2 className="text-lg font-bold text-slate-900 mb-6">Usage Distribution by Lab</h2>
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={labDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={80}
                    outerRadius={120}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {labDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-6 mt-4">
                {labDistribution.map((entry, index) => (
                  <div key={entry.name} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                    <span className="text-sm text-slate-600 capitalize">{entry.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Detailed Usage Table */}
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-6 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900">Usage Details</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="px-6 py-4 text-sm font-semibold text-slate-600">Date</th>
                    <th className="px-6 py-4 text-sm font-semibold text-slate-600">Reagent</th>
                    <th className="px-6 py-4 text-sm font-semibold text-slate-600">Lab</th>
                    <th className="px-6 py-4 text-sm font-semibold text-slate-600">Quantity</th>
                    <th className="px-6 py-4 text-sm font-semibold text-slate-600">User</th>
                    <th className="px-6 py-4 text-sm font-semibold text-slate-600">Purpose</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {new Date(item.date).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-slate-900">{item.reagentName}</td>
                      <td className="px-6 py-4 text-sm text-slate-600 capitalize">{item.labType}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">{item.quantity} {item.unit}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">{item.userName}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">{item.purpose}</td>
                    </tr>
                  ))}
                  {data.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                        No usage data found for the selected filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const SettingsView = () => {
  const { profile, expiryThreshold, setExpiryThreshold, settings, refreshSettings } = React.useContext(UserContext);
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const initialTab = (queryParams.get('tab') as any) || 'users';
  
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [activeTab, setActiveTab] = useState<'users' | 'app' | 'tema' | 'general' | 'system'>(initialTab);
  const [loading, setLoading] = useState(false);
  const [systemActionLoading, setSystemActionLoading] = useState(false);
  
  // App Settings Form
  const [appForm, setAppForm] = useState(settings);
  const [newUserForm, setNewUserForm] = useState({ email: '', displayName: '', role: 'analyst' as UserRole, password: '' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [adminPasswordChange, setAdminPasswordChange] = useState<{ uid: string, email: string } | null>(null);
  const [newAdminPassword, setNewAdminPassword] = useState('');

  useEffect(() => {
    fetchUsers();
    setAppForm(settings);
  }, [settings]);

  useEffect(() => {
    const tab = queryParams.get('tab');
    if (tab && ['users', 'app', 'tema', 'general', 'system'].includes(tab)) {
      setActiveTab(tab as any);
    }
  }, [location.search]);

  const fetchUsers = async () => {
    if (!profile?.uid) return;
    const url = `/api/users?requesterUid=${profile.uid}`;
    console.log(`Frontend: Fetching users from ${url}`);
    try {
      const res = await fetch(url);
      const text = await res.text();
      try {
        if (res.ok) {
          setUsers(JSON.parse(text));
        } else {
          console.error('Fetch users error status:', res.status, text.substring(0, 50));
        }
      } catch (parseError) {
        console.error('Failed to parse users result as JSON:', text.substring(0, 100));
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newUserForm.email || !newUserForm.password || !newUserForm.displayName) {
      alert('Silakan isi semua data (Email, Nama, Password).');
      return;
    }

    if (newUserForm.password.length < 6) {
      alert('Password minimal 6 karakter.');
      return;
    }

    setLoading(true);
    console.log('Memulai pembuatan user baru:', newUserForm.email);

    try {
      // 1. Validasi Config
      if (!firebaseConfig || !firebaseConfig.apiKey) {
        throw new Error('Konfigurasi Firebase (API Key) tidak ditemukan. Periksa file firebase-applet-config.json');
      }

      // 2. Create user in Firebase Auth using a secondary instance
      const existingApps = getApps();
      let secondaryApp = existingApps.find(app => app.name === 'secondary');
      
      if (!secondaryApp) {
        secondaryApp = initializeApp(firebaseConfig, 'secondary');
      }
      
      const secondaryAuth = getAuth(secondaryApp);
      
      console.log('Mendaftarkan ke Firebase Auth...');
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, newUserForm.email, newUserForm.password);
      const uid = userCredential.user.uid;
      console.log('Berhasil di Firebase Auth, UID:', uid);
      
      // 3. Sync with backend
      console.log('Sinkronisasi ke database backend...');
      const res = await fetch('/api/auth/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid,
          email: newUserForm.email,
          displayName: newUserForm.displayName,
          role: newUserForm.role,
          requesterUid: profile?.uid
        }),
      });

      if (res.ok) {
        console.log('Sinkronisasi berhasil.');
        fetchUsers();
        setNewUserForm({ email: '', displayName: '', role: 'analyst', password: '' });
        alert('User berhasil dibuat!');
      } else {
        const err = await res.json();
        console.error('Gagal sinkronisasi:', err);
        alert('Gagal sinkronisasi profil: ' + (err.error || 'Unknown error'));
      }

      // 4. Cleanup secondary app
      await deleteApp(secondaryApp);
    } catch (error: any) {
      console.error('Error detail saat menambah user:', error);
      if (error.code === 'auth/operation-not-allowed') {
        alert('PENTING: Fitur Email/Password belum aktif di Firebase Console. \n\nSilakan buka Firebase Console > Authentication > Sign-in method dan aktifkan "Email/Password".');
      } else if (error.code === 'auth/email-already-in-use') {
        alert('Email ini sudah terdaftar. Silakan gunakan email lain atau reset password akun tersebut.');
      } else if (error.code === 'auth/weak-password') {
        alert('Password terlalu lemah. Gunakan minimal 6 karakter.');
      } else if (error.code === 'auth/invalid-email') {
        alert('Format email tidak valid.');
      } else {
        alert('Gagal membuat user: ' + (error.message || 'Terjadi kesalahan sistem'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (uid: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    try {
      const res = await fetch(`/api/users/${uid}?requesterUid=${profile?.uid}`, { method: 'DELETE' });
      if (res.ok) fetchUsers();
    } catch (error) {
      console.error('Error deleting user:', error);
    }
  };

  const handleResetUserPassword = async (email: string) => {
    if (!confirm(`Kirim email reset password ke ${email}?`)) return;
    try {
      await sendPasswordResetEmail(auth, email);
      alert('Email reset password telah dikirim!');
    } catch (error: any) {
      console.error('Error sending reset email:', error);
      alert('Gagal mengirim email reset: ' + (error.message || 'Terjadi kesalahan'));
    }
  };

  const handleAdminChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminPasswordChange) return;
    if (newAdminPassword.length < 6) {
      alert('Password minimal 6 karakter.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/users/${adminPasswordChange.uid}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          password: newAdminPassword, 
          requesterUid: profile?.uid 
        }),
      });
      
      if (res.ok) {
        alert('Password berhasil diubah oleh admin!');
        setAdminPasswordChange(null);
        setNewAdminPassword('');
      } else {
        const err = await res.json();
        alert('Gagal mengubah password: ' + (err.error || 'Unknown error'));
      }
    } catch (error: any) {
      console.error('Error admin changing password:', error);
      alert('Terjadi kesalahan: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateRole = async (uid: string, role: string) => {
    try {
      const res = await fetch(`/api/users/${uid}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, requesterUid: profile?.uid }),
      });
      if (res.ok) fetchUsers();
    } catch (error) {
      console.error('Error updating role:', error);
    }
  };

  const handleUpdateUserPermissions = async (uid: string, permissions: string[]) => {
    try {
      const res = await fetch(`/api/users/${uid}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions, requesterUid: profile?.uid }),
      });
      if (res.ok) fetchUsers();
    } catch (error) {
      console.error('Error updating user permissions:', error);
    }
  };

  const handleSaveSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: appForm, requesterUid: profile?.uid }),
      });
      if (res.ok) {
        await refreshSettings();
        alert('Settings saved successfully!');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      alert('Password baru dan konfirmasi tidak cocok.');
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      alert('Password minimal 6 karakter.');
      return;
    }

    setPasswordLoading(true);
    try {
      const user = auth.currentUser;
      if (!user || !user.email) throw new Error('User not found');

      // Re-authenticate user
      const credential = EmailAuthProvider.credential(user.email, passwordForm.currentPassword);
      await reauthenticateWithCredential(user, credential);

      // Update password
      await updatePassword(user, passwordForm.newPassword);
      
      alert('Password berhasil diubah!');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setShowPasswordChange(false);
    } catch (error: any) {
      console.error('Error changing password:', error);
      if (error.code === 'auth/wrong-password') {
        alert('Password saat ini salah.');
      } else {
        alert('Gagal mengubah password: ' + (error.message || 'Terjadi kesalahan'));
      }
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, field: 'appLogo' | 'loginBackground' | 'sidebarBackground') => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert('File is too large. Please upload an image smaller than 2MB.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setAppForm({ ...appForm, [field]: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  if (profile?.role !== 'admin') {
    return (
      <div className="p-8">
        <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
          <h2 className="text-xl font-bold text-slate-900 mb-6">General Settings</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Expiry Threshold (Days)</label>
              <input 
                type="number" 
                value={expiryThreshold}
                onChange={(e) => setExpiryThreshold(parseInt(e.target.value) || 30)}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              />
              <p className="text-xs text-slate-500 mt-1">Items expiring within this many days will be flagged as "Expiring Soon".</p>
            </div>

            <div className="pt-6 border-t border-slate-100">
              <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Lock size={20} className="text-blue-600" />
                Security Settings
              </h3>
              {!showPasswordChange ? (
                <button 
                  onClick={() => setShowPasswordChange(true)}
                  className="px-6 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-all flex items-center gap-2"
                >
                  <Lock size={18} />
                  Change Account Password
                </button>
              ) : (
                <form onSubmit={handleChangePassword} className="space-y-4 max-w-md bg-slate-50 p-6 rounded-2xl border border-slate-100">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Current Password</label>
                    <input 
                      type="password" required
                      value={passwordForm.currentPassword}
                      onChange={e => setPasswordForm({...passwordForm, currentPassword: e.target.value})}
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">New Password</label>
                    <input 
                      type="password" required
                      value={passwordForm.newPassword}
                      onChange={e => setPasswordForm({...passwordForm, newPassword: e.target.value})}
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Confirm New Password</label>
                    <input 
                      type="password" required
                      value={passwordForm.confirmPassword}
                      onChange={e => setPasswordForm({...passwordForm, confirmPassword: e.target.value})}
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button 
                      type="submit"
                      disabled={passwordLoading}
                      className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50"
                    >
                      {passwordLoading ? 'Updating...' : 'Update Password'}
                    </button>
                    <button 
                      type="button"
                      onClick={() => setShowPasswordChange(false)}
                      className="px-6 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">System Settings</h1>
          <p className="text-slate-500 mt-1">Manage users, application appearance, and permissions.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-8 bg-slate-100 p-1 rounded-2xl w-fit">
        <button 
          onClick={() => setActiveTab('users')}
          className={`px-6 py-2.5 rounded-xl font-medium transition-all flex items-center gap-2 ${activeTab === 'users' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
        >
          <Users size={18} />
          User Management
          <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-md font-bold uppercase tracking-tighter">Admin</span>
        </button>
        <button 
          onClick={() => setActiveTab('app')}
          className={`px-6 py-2.5 rounded-xl font-medium transition-all flex items-center gap-2 ${activeTab === 'app' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
        >
          <LayoutIcon size={18} />
          App Configuration
          <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-md font-bold uppercase tracking-tighter">Admin</span>
        </button>
        <button 
          onClick={() => setActiveTab('tema')}
          className={`px-6 py-2.5 rounded-xl font-medium transition-all flex items-center gap-2 ${activeTab === 'tema' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
        >
          <Palette size={18} />
          Tema
        </button>
        <button 
          onClick={() => setActiveTab('general')}
          className={`px-6 py-2.5 rounded-xl font-medium transition-all flex items-center gap-2 ${activeTab === 'general' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
        >
          <SettingsIcon size={18} />
          General
        </button>
        <button 
          onClick={() => setActiveTab('system')}
          className={`px-6 py-2.5 rounded-xl font-medium transition-all flex items-center gap-2 ${activeTab === 'system' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
        >
          <ShieldAlert size={18} />
          System Management
          <span className="text-[10px] bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded-md font-bold uppercase tracking-tighter">Admin</span>
        </button>
      </div>

      {activeTab === 'users' && (
        <div className="space-y-8">
          <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
            <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-blue-600" />
              Add New User
            </h2>
            <form onSubmit={handleAddUser} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div className="md:col-span-1">
                <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
                <input 
                  type="email" 
                  required
                  value={newUserForm.email}
                  onChange={e => setNewUserForm({...newUserForm, email: e.target.value})}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  placeholder="user@example.com"
                />
              </div>
              <div className="md:col-span-1">
                <label className="block text-sm font-medium text-slate-700 mb-1">Display Name</label>
                <input 
                  type="text" 
                  required
                  value={newUserForm.displayName}
                  onChange={e => setNewUserForm({...newUserForm, displayName: e.target.value})}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  placeholder="Full Name"
                />
              </div>
              <div className="md:col-span-1">
                <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                <input 
                  type="password" 
                  required
                  value={newUserForm.password}
                  onChange={e => setNewUserForm({...newUserForm, password: e.target.value})}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  placeholder="••••••••"
                  minLength={6}
                />
              </div>
              <div className="md:col-span-1">
                <label className="block text-sm font-medium text-slate-700 mb-1">Initial Role</label>
                <select 
                  value={newUserForm.role}
                  onChange={e => setNewUserForm({...newUserForm, role: e.target.value as UserRole})}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                >
                  <option value="admin">Admin</option>
                  <option value="analyst">Analyst</option>
                  <option value="warehouse_manager">Warehouse Manager</option>
                  <option value="purchasing">Purchasing</option>
                  <option value="sampling_admin">Admin Sampling</option>
                  <option value="sampling_officer">Petugas Sampling</option>
                  <option value="login_team">Lab Login Team</option>
                </select>
              </div>
              <div className="md:col-span-4 flex justify-end">
                <button 
                  type="submit" 
                  disabled={loading}
                  className="bg-blue-600 text-white px-8 py-2.5 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 disabled:opacity-50 flex items-center gap-2"
                >
                  {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <UserPlus size={20} />}
                  Create User Account
                </button>
              </div>
            </form>
          </div>

          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-8 border-b border-slate-100">
              <h2 className="text-xl font-bold text-slate-900">User List</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="px-8 py-4 text-sm font-semibold text-slate-600 uppercase tracking-wider">User</th>
                    <th className="px-8 py-4 text-sm font-semibold text-slate-600 uppercase tracking-wider">Role</th>
                    <th className="px-8 py-4 text-sm font-semibold text-slate-600 uppercase tracking-wider">Permissions (Custom)</th>
                    <th className="px-8 py-4 text-sm font-semibold text-slate-600 uppercase tracking-wider">Status</th>
                    <th className="px-8 py-4 text-sm font-semibold text-slate-600 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((u) => (
                    <tr key={u.uid} className="hover:bg-slate-50 transition-colors">
                      <td className="px-8 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold">
                            {u.displayName[0]}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900">{u.displayName}</div>
                            <div className="text-sm text-slate-500">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-4">
                        <select 
                          value={u.role}
                          onChange={(e) => handleUpdateRole(u.uid, e.target.value)}
                          disabled={u.email === 'medialabindonesia@gmail.com'}
                          className="bg-white border border-slate-200 rounded-lg px-3 py-1 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50"
                        >
                          <option value="admin">Admin</option>
                          <option value="analyst">Analyst</option>
                          <option value="warehouse_manager">Warehouse Manager</option>
                          <option value="purchasing">Purchasing</option>
                          <option value="sampling_admin">Admin Sampling</option>
                          <option value="sampling_officer">Petugas Sampling</option>
                          <option value="login_team">Lab Login Team</option>
                        </select>
                      </td>
                      <td className="px-8 py-4">
                        <div className="space-y-3 min-w-[200px]">
                          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                            {[
                              { id: 'dashboard', label: 'Dashboard' },
                              { id: 'sampling_admin', label: 'Admin Sampling' },
                              { id: 'sampling_officer', label: 'Tugas Sampling' },
                              { id: 'login_team', label: 'Lab Login' },
                              { id: 'analyst_lab', label: 'Lab Analis' },
                              { id: 'lab', label: 'Lab' },
                              { id: 'stock_lab', label: 'Stok Lab' },
                              { id: 'stock_warehouse', label: 'Stok Gudang' },
                              { id: 'purchasing', label: 'Purchasing' },
                              { id: 'reports', label: 'Reports' },
                              { id: 'settings', label: 'Settings' },
                            ].map(menu => {
                              const hasCustom = u.permissions && u.permissions.length > 0;
                              const rolePerms = settings.rolePermissions[u.role] || [];
                              const isChecked = hasCustom ? u.permissions.includes(menu.id) : rolePerms.includes(menu.id);
                              
                              return (
                                <label 
                                  key={menu.id} 
                                  className={cn(
                                    "flex items-center gap-2 cursor-pointer group select-none",
                                    !hasCustom && "opacity-60"
                                  )}
                                >
                                  <input 
                                    type="checkbox" 
                                    checked={isChecked}
                                    onChange={() => {
                                      const currentPerms = hasCustom ? u.permissions : rolePerms;
                                      const newPerms = isChecked 
                                        ? currentPerms.filter(p => p !== menu.id)
                                        : [...currentPerms, menu.id];
                                      handleUpdateUserPermissions(u.uid, newPerms);
                                    }}
                                    className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 transition-all cursor-pointer"
                                  />
                                  <span className={cn(
                                    "text-[11px] font-medium transition-colors",
                                    isChecked ? "text-slate-900" : "text-slate-400"
                                  )}>
                                    {menu.label}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                          <div className="pt-2 border-t border-slate-50 flex items-center justify-between">
                            {u.permissions && u.permissions.length > 0 ? (
                              <button 
                                onClick={() => handleUpdateUserPermissions(u.uid, [])}
                                className="text-[10px] text-blue-600 font-bold hover:underline flex items-center gap-1"
                              >
                                <RefreshCw size={10} /> Reset to Default
                              </button>
                            ) : (
                              <div className="text-[10px] text-slate-400 italic flex items-center gap-1">
                                <Shield size={10} /> Using {u.role.replace('_', ' ')} defaults
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${u.uid.startsWith('pending_') ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {u.uid.startsWith('pending_') ? 'Pending Login' : 'Active'}
                        </span>
                      </td>
                      <td className="px-8 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={() => setAdminPasswordChange({ uid: u.uid, email: u.email })}
                            title="Ubah Password (Admin)"
                            className="p-2 text-slate-400 hover:text-amber-600 transition-colors"
                          >
                            <Key className="w-5 h-5" />
                          </button>
                          <button 
                            onClick={() => handleResetUserPassword(u.email)}
                            title="Reset Password (Email)"
                            className="p-2 text-slate-400 hover:text-blue-600 transition-colors"
                          >
                            <RefreshCw className="w-5 h-5" />
                          </button>
                          <button 
                            onClick={() => handleDeleteUser(u.uid)}
                            disabled={u.email === 'medialabindonesia@gmail.com'}
                            className="p-2 text-slate-400 hover:text-red-600 transition-colors disabled:opacity-50"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'tema' && (
        <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
          <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
            <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-blue-600" />
              Sidebar Appearance
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Sidebar Background Image</label>
                  <div className="relative group">
                    <div className="w-full h-64 bg-slate-100 rounded-3xl border-2 border-dashed border-slate-200 overflow-hidden flex items-center justify-center">
                      {appForm.sidebarBackground ? (
                        <img src={appForm.sidebarBackground} alt="Sidebar BG Preview" className="w-full h-full object-cover" />
                      ) : (
                        <div className="text-center p-6">
                          <ImageIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                          <p className="text-sm text-slate-400 font-medium">No background image selected</p>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                        <label 
                          htmlFor="sidebar-bg-upload"
                          className="px-4 py-2 bg-white rounded-xl text-sm font-bold text-slate-900 cursor-pointer hover:scale-105 transition-transform flex items-center gap-2"
                        >
                          <Upload size={16} />
                          {appForm.sidebarBackground ? 'Ganti Gambar' : 'Pilih Gambar'}
                        </label>
                        {appForm.sidebarBackground && (
                          <button 
                            onClick={() => setAppForm({...appForm, sidebarBackground: ''})}
                            className="px-4 py-2 bg-red-600 rounded-xl text-sm font-bold text-white cursor-pointer hover:scale-105 transition-transform flex items-center gap-2"
                          >
                            <Trash2 size={16} />
                            Hapus
                          </button>
                        )}
                      </div>
                    </div>
                    <input 
                      type="file" 
                      accept="image/*"
                      onChange={e => handleImageUpload(e, 'sidebarBackground')}
                      className="hidden"
                      id="sidebar-bg-upload"
                    />
                  </div>
                  <div className="mt-4 p-4 bg-blue-50 rounded-2xl border border-blue-100">
                    <h4 className="text-sm font-bold text-blue-900 flex items-center gap-2 mb-1">
                      <Info size={16} />
                      Informasi Ukuran
                    </h4>
                    <p className="text-xs text-blue-700 leading-relaxed">
                      Untuk hasil terbaik, gunakan gambar dengan orientasi <strong>Portrait</strong>. 
                      Rekomendasi ukuran: <strong>300 x 1000 pixel</strong> atau lebih besar dengan aspek rasio serupa. 
                      Maksimal ukuran file: <strong>2MB</strong>.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <label className="block text-sm font-bold text-slate-700 mb-2">Preview Sidebar</label>
                <div className="w-[280px] h-[500px] bg-white rounded-[32px] shadow-2xl border border-slate-100 overflow-hidden relative mx-auto">
                  {/* Mock Sidebar Content */}
                  {appForm.sidebarBackground && (
                    <img 
                      src={appForm.sidebarBackground} 
                      className="absolute inset-0 w-full h-full object-cover opacity-20 pointer-events-none" 
                      alt="Preview BG"
                    />
                  )}
                  <div className="relative z-10 p-6 space-y-8">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-10 h-10 flex items-center justify-center",
                        appForm.appLogo ? "bg-transparent" : "bg-blue-600 rounded-xl shadow-lg shadow-blue-500/20"
                      )}>
                        {appForm.appLogo ? (
                          <img src={appForm.appLogo} alt="Logo" className="w-full h-full object-contain" />
                        ) : (
                          <Microscope className="text-white" size={20} />
                        )}
                      </div>
                      <div className="flex flex-col">
                        <div className="h-3 w-24 bg-slate-200 rounded-full mb-1" />
                        <div className="h-2 w-16 bg-slate-100 rounded-full" />
                      </div>
                    </div>
                    <div className="space-y-4">
                      {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-50/50">
                          <div className="w-4 h-4 bg-slate-200 rounded" />
                          <div className="h-2 w-20 bg-slate-200 rounded-full" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-12 pt-8 border-t border-slate-100 flex justify-end">
              <button 
                onClick={handleSaveSettings}
                disabled={loading}
                className="bg-blue-600 text-white px-10 py-3.5 rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-xl shadow-blue-200 disabled:opacity-50 flex items-center gap-2"
              >
                {loading ? <RefreshCw className="animate-spin" size={20} /> : <Save size={20} />}
                Simpan Perubahan Tema
              </button>
            </div>
          </div>
        </div>
      )}
      {activeTab === 'app' && (
        <div className="space-y-8">
          <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
            <h2 className="text-xl font-bold text-slate-900 mb-8">Appearance & Branding</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Application Name</label>
                  <input 
                    type="text" 
                    value={appForm.appName}
                    onChange={e => setAppForm({...appForm, appName: e.target.value})}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Logo</label>
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-16 h-16 rounded-xl flex items-center justify-center border border-slate-200 overflow-hidden",
                      appForm.appLogo ? "bg-transparent" : "bg-slate-100"
                    )}>
                      {appForm.appLogo ? (
                        <img src={appForm.appLogo} alt="Logo Preview" className="w-full h-full object-contain" />
                      ) : (
                        <Beaker className="w-8 h-8 text-slate-400" />
                      )}
                    </div>
                    <div className="flex-1">
                      <input 
                        type="file" 
                        accept="image/*"
                        onChange={e => handleImageUpload(e, 'appLogo')}
                        className="hidden"
                        id="logo-upload"
                      />
                      <label 
                        htmlFor="logo-upload"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer transition-all"
                      >
                        <Upload size={16} />
                        Upload Logo
                      </label>
                      <p className="text-xs text-slate-500 mt-1">Recommended: Square PNG/SVG, max 2MB.</p>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Theme Color</label>
                  <div className="flex gap-4 items-center">
                    <input 
                      type="color" 
                      value={appForm.themeColor}
                      onChange={e => setAppForm({...appForm, themeColor: e.target.value})}
                      className="w-12 h-12 rounded-lg cursor-pointer border-none"
                    />
                    <span className="text-slate-600 font-mono">{appForm.themeColor}</span>
                  </div>
                </div>
              </div>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Login Page Title</label>
                  <input 
                    type="text" 
                    value={appForm.loginTitle}
                    onChange={e => setAppForm({...appForm, loginTitle: e.target.value})}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Login Page Subtitle</label>
                  <textarea 
                    value={appForm.loginSubtitle}
                    onChange={e => setAppForm({...appForm, loginSubtitle: e.target.value})}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all h-24 resize-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Login Background</label>
                  <div className="space-y-3">
                    <div className="w-full h-32 bg-slate-100 rounded-2xl border border-slate-200 overflow-hidden relative group">
                      <img src={appForm.loginBackground} alt="Background Preview" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <label 
                          htmlFor="bg-upload"
                          className="px-4 py-2 bg-white rounded-xl text-sm font-bold text-slate-900 cursor-pointer hover:scale-105 transition-transform"
                        >
                          Change Image
                        </label>
                      </div>
                    </div>
                    <input 
                      type="file" 
                      accept="image/*"
                      onChange={e => handleImageUpload(e, 'loginBackground')}
                      className="hidden"
                      id="bg-upload"
                    />
                    <p className="text-xs text-slate-500">Recommended: High resolution landscape image, max 2MB.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
            <h2 className="text-xl font-bold text-slate-900 mb-8">Content Customization</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 mb-4 uppercase tracking-wider">Login Page Text</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Welcome Text</label>
                      <input 
                        type="text" 
                        value={appForm.loginWelcomeText}
                        onChange={e => setAppForm({...appForm, loginWelcomeText: e.target.value})}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Welcome Subtext</label>
                      <input 
                        type="text" 
                        value={appForm.loginWelcomeSubtext}
                        onChange={e => setAppForm({...appForm, loginWelcomeSubtext: e.target.value})}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 mb-4 uppercase tracking-wider">Sidebar Titles</h3>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Laboratory Menu Title</label>
                    <input 
                      type="text" 
                      value={appForm.sidebarLabTitle}
                      onChange={e => setAppForm({...appForm, sidebarLabTitle: e.target.value})}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-6">
                <h3 className="text-sm font-bold text-slate-900 mb-4 uppercase tracking-wider">Laboratory Names</h3>
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Lab Udara</label>
                    <input 
                      type="text" 
                      value={appForm.labNames.udara}
                      onChange={e => setAppForm({...appForm, labNames: { ...appForm.labNames, udara: e.target.value }})}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Lab Air</label>
                    <input 
                      type="text" 
                      value={appForm.labNames.air}
                      onChange={e => setAppForm({...appForm, labNames: { ...appForm.labNames, air: e.target.value }})}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Lab B3 & Tanah</label>
                    <input 
                      type="text" 
                      value={appForm.labNames.b3_tanah}
                      onChange={e => setAppForm({...appForm, labNames: { ...appForm.labNames, b3_tanah: e.target.value }})}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Lab Mikrobiologi</label>
                    <input 
                      type="text" 
                      value={appForm.labNames.mikrobiologi}
                      onChange={e => setAppForm({...appForm, labNames: { ...appForm.labNames, mikrobiologi: e.target.value }})}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'system' && (
        <div className="space-y-8">
          <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
            <h2 className="text-xl font-bold text-slate-900 mb-2 flex items-center gap-2">
              <Database className="w-5 h-5 text-blue-600" />
              Database Backup & Restore
            </h2>
            <p className="text-slate-500 mb-8 text-sm">Download a full backup of your system data or restore from a previous backup file.</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 space-y-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                    <Download size={20} />
                  </div>
                  <h3 className="font-bold text-slate-900">Backup Data</h3>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Mencadangkan semua data termasuk stok, permintaan, penggunaan harian, sampel, dan pengaturan aplikasi ke dalam file JSON.
                </p>
                <button 
                  onClick={async () => {
                    setSystemActionLoading(true);
                    try {
                      const res = await fetch(`/api/system/backup?uid=${profile?.uid}`);
                      if (res.ok) {
                        const data = await res.json();
                        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `lims_backup_${new Date().toISOString().split('T')[0]}.json`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                      }
                    } catch (err) {
                      alert('Gagal membuat backup');
                    } finally {
                      setSystemActionLoading(false);
                    }
                  }}
                  disabled={systemActionLoading}
                  className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-100 disabled:opacity-50"
                >
                  {systemActionLoading ? <RefreshCw size={18} className="animate-spin" /> : <Download size={18} />}
                  Download Backup (.json)
                </button>
              </div>

              <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 space-y-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg">
                    <Upload size={20} />
                  </div>
                  <h3 className="font-bold text-slate-900">Restore Data</h3>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Mengembalikan data dari file backup. <span className="text-rose-600 font-bold">Peringatan: Ini akan menghapus semua data saat ini dan menggantinya dengan data dari file backup.</span>
                </p>
                <div className="relative">
                  <input 
                    type="file" 
                    accept=".json"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (!confirm('Apakah Anda yakin ingin melakukan restore? Semua data saat ini akan hilang.')) return;
                      
                      setSystemActionLoading(true);
                      const reader = new FileReader();
                      reader.onload = async (evt) => {
                        try {
                          const data = JSON.parse(evt.target?.result as string);
                          const res = await fetch('/api/system/restore', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ uid: profile?.uid, data })
                          });
                          if (res.ok) {
                            alert('Data berhasil dipulihkan! Aplikasi akan dimuat ulang.');
                            window.location.reload();
                          } else {
                            alert('Gagal memulihkan data. Format file mungkin tidak valid.');
                          }
                        } catch (err) {
                          alert('Gagal membaca file backup.');
                        } finally {
                          setSystemActionLoading(false);
                        }
                      };
                      reader.readAsText(file);
                    }}
                    className="hidden"
                    id="restore-upload"
                  />
                  <label 
                    htmlFor="restore-upload"
                    className="w-full py-3 bg-white border-2 border-emerald-500 text-emerald-600 rounded-xl font-bold hover:bg-emerald-50 cursor-pointer transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {systemActionLoading ? <RefreshCw size={18} className="animate-spin" /> : <Upload size={18} />}
                    Pilih File Backup & Restore
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-rose-50 rounded-3xl p-8 border border-rose-100">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-rose-100 text-rose-600 rounded-2xl">
                <AlertTriangle size={24} />
              </div>
              <div className="flex-1 space-y-1">
                <h2 className="text-xl font-bold text-rose-900">Danger Zone: Reset System</h2>
                <p className="text-rose-700/70 text-sm leading-relaxed">
                  Gunakan fitur ini jika Anda ingin membersihkan semua data transaksi (stok, permintaan, penggunaan harian, sampel) dan memulai dari nol. 
                  <br />
                  <span className="font-bold">Tindakan ini tidak dapat dibatalkan.</span> Akun pengguna dan pengaturan aplikasi akan tetap dipertahankan.
                </p>
                <div className="pt-6">
                  <button 
                    onClick={async () => {
                      const confirmText = prompt('Ketik "RESET" untuk mengonfirmasi penghapusan semua data transaksi:');
                      if (confirmText !== 'RESET') return;
                      
                      setSystemActionLoading(true);
                      try {
                        const res = await fetch('/api/system/reset', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ uid: profile?.uid })
                        });
                        if (res.ok) {
                          alert('Sistem berhasil direset! Semua data transaksi telah dihapus.');
                          window.location.reload();
                        } else {
                          const err = await res.json();
                          alert(err.error || 'Gagal meriset sistem');
                        }
                      } catch (err) {
                        alert('Terjadi kesalahan saat meriset sistem');
                      } finally {
                        setSystemActionLoading(false);
                      }
                    }}
                    disabled={systemActionLoading}
                    className="px-8 py-3 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700 transition-all shadow-lg shadow-rose-200 flex items-center gap-2 disabled:opacity-50"
                  >
                    {systemActionLoading ? <RefreshCw size={18} className="animate-spin" /> : <Trash2 size={18} />}
                    Reset Semua Data Transaksi
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'general' && (
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
          <h2 className="text-xl font-bold text-slate-900 mb-6">Inventory Thresholds</h2>
          <div className="max-w-md space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Expiry Warning Threshold (Days)</label>
              <div className="flex gap-4 items-center">
                <input 
                  type="number" 
                  value={expiryThreshold}
                  onChange={(e) => setExpiryThreshold(parseInt(e.target.value) || 30)}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                />
                <span className="text-slate-500 font-medium whitespace-nowrap">Days</span>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Reagents expiring within this many days will be highlighted as "Expiring Soon" in all stock views.
              </p>
            </div>

            <div className="pt-6 border-t border-slate-100">
              <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Lock size={20} className="text-blue-600" />
                Security Settings
              </h3>
              {!showPasswordChange ? (
                <button 
                  onClick={() => setShowPasswordChange(true)}
                  className="px-6 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-all flex items-center gap-2"
                >
                  <Lock size={18} />
                  Change My Password
                </button>
              ) : (
                <form onSubmit={handleChangePassword} className="space-y-4 bg-slate-50 p-6 rounded-2xl border border-slate-100">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Current Password</label>
                    <input 
                      type="password" required
                      value={passwordForm.currentPassword}
                      onChange={e => setPasswordForm({...passwordForm, currentPassword: e.target.value})}
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">New Password</label>
                    <input 
                      type="password" required
                      value={passwordForm.newPassword}
                      onChange={e => setPasswordForm({...passwordForm, newPassword: e.target.value})}
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Confirm New Password</label>
                    <input 
                      type="password" required
                      value={passwordForm.confirmPassword}
                      onChange={e => setPasswordForm({...passwordForm, confirmPassword: e.target.value})}
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button 
                      type="submit"
                      disabled={passwordLoading}
                      className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50"
                    >
                      {passwordLoading ? 'Updating...' : 'Update Password'}
                    </button>
                    <button 
                      type="button"
                      onClick={() => setShowPasswordChange(false)}
                      className="px-6 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Admin Password Change Modal */}
      <AnimatePresence>
        {adminPasswordChange && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-8 shadow-2xl border border-slate-100 w-full max-w-md"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-slate-900">Ubah Password User</h3>
                <button onClick={() => setAdminPasswordChange(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>
              
              <div className="mb-6 p-4 bg-blue-50 rounded-2xl border border-blue-100">
                <p className="text-sm text-blue-700">
                  Mengubah password untuk: <br/>
                  <span className="font-bold">{adminPasswordChange.email}</span>
                </p>
              </div>

              <form onSubmit={handleAdminChangePassword} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Password Baru</label>
                  <input 
                    type="password" required
                    value={newAdminPassword}
                    onChange={e => setNewAdminPassword(e.target.value)}
                    placeholder="Minimal 6 karakter"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  />
                </div>
                
                <div className="flex gap-3 pt-4">
                  <button 
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50"
                  >
                    {loading ? 'Updating...' : 'Simpan Password'}
                  </button>
                  <button 
                    type="button"
                    onClick={() => setAdminPasswordChange(null)}
                    className="px-6 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-all"
                  >
                    Batal
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="flex justify-end">
        <button 
          onClick={handleSaveSettings}
          disabled={loading}
          className="bg-blue-600 text-white px-10 py-3 rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-xl shadow-blue-200 flex items-center gap-2 disabled:opacity-50"
        >
          {loading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Save className="w-5 h-5" />}
          Save All Changes
        </button>
      </div>
    </div>
  );
};


const MasterDataView = () => {
  const [stock, setStock] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItems, setSelectedItems] = useState<number[]>([]);
  const [showBulkQR, setShowBulkQR] = useState(false);
  const { profile } = React.useContext(UserContext);

  const fetchAllStock = async () => {
    try {
      const res = await fetch('/api/stocks?limit=1000');
      if (res.ok) {
        const result = await res.json();
        setStock(result.data || []);
      }
    } catch (error) {
      console.error('Error fetching all stock:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllStock();
  }, []);

  const filteredStock = stock.filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.materialCode && item.materialCode.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (item.brand && item.brand.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const toggleSelectAll = () => {
    if (selectedItems.length === filteredStock.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(filteredStock.map(i => i.id));
    }
  };

  const toggleSelectItem = (id: number) => {
    if (selectedItems.includes(id)) {
      setSelectedItems(selectedItems.filter(i => i !== id));
    } else {
      setSelectedItems([...selectedItems, id]);
    }
  };

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Master Inventory</h1>
          <p className="text-slate-500 font-medium">Centralized database for all laboratory reagents and materials.</p>
        </div>
        <div className="flex items-center gap-3">
          {selectedItems.length > 0 && (
            <motion.button 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={() => setShowBulkQR(true)}
              className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 text-sm"
            >
              <Printer size={18} />
              Print {selectedItems.length} Labels
            </motion.button>
          )}
          <button className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-all shadow-sm">
            <Filter size={18} />
          </button>
        </div>
      </div>

      <div className="premium-card overflow-hidden">
        <div className="p-8 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-6 bg-slate-50/30">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Search by name, code, or brand..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3.5 bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500/10 outline-none transition-all shadow-sm font-medium text-sm"
            />
          </div>
          <div className="flex items-center gap-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">
            <span>Showing {filteredStock.length} items</span>
          </div>
        </div>

        <div className="overflow-x-auto hidden lg:block">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/30 border-b border-slate-100">
                <th className="px-8 py-5 w-10">
                  <input 
                    type="checkbox" 
                    checked={selectedItems.length === filteredStock.length && filteredStock.length > 0}
                    onChange={toggleSelectAll}
                    className="w-5 h-5 rounded-lg border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Material Info</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Lot & Code</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Location</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Stock Level</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Expiry</th>
                <th className="px-6 py-5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-8 py-20 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-10 h-10 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin"></div>
                      <p className="text-slate-400 font-bold text-sm">Loading master data...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredStock.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-8 py-20 text-center">
                    <div className="flex flex-col items-center gap-4 text-slate-300">
                      <Database size={48} strokeWidth={1.5} />
                      <p className="font-bold text-sm">No materials found matching your search.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredStock.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-8 py-5">
                      <input 
                        type="checkbox" 
                        checked={selectedItems.includes(item.id)}
                        onChange={() => toggleSelectItem(item.id)}
                        className="w-5 h-5 rounded-lg border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600 transition-all shadow-sm border border-slate-200/50">
                          <Package size={20} />
                        </div>
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-900 text-sm leading-tight">{item.name}</span>
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">{item.brand || 'Generic'}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex flex-col gap-1.5">
                        <span className="font-mono text-[10px] text-slate-600 font-black bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200 w-fit">{item.materialCode || 'N/A'}</span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Lot: {item.lotNumber || '-'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-2">
                        {item.location === 'warehouse' ? (
                          <span className="px-3 py-1 bg-amber-50 text-amber-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-amber-100 flex items-center gap-1.5 shadow-sm shadow-amber-500/5">
                            <Warehouse size={12} /> Warehouse
                          </span>
                        ) : (
                          <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-blue-100 flex items-center gap-1.5 shadow-sm shadow-blue-500/5">
                            <Microscope size={12} /> {item.labType}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex flex-col">
                        <span className="font-black text-slate-900 text-sm">{item.quantity} {item.unit}</span>
                        <div className="w-24 h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden border border-slate-200/50">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min((item.quantity / (item.minStock || 20)) * 100, 100)}%` }}
                            className={cn(
                              "h-full rounded-full transition-all duration-500",
                              item.quantity <= (item.minStock || 5) ? "bg-rose-500" : "bg-blue-500"
                            )}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-2 text-slate-600 font-bold text-xs">
                        <Clock size={14} className="text-slate-400" />
                        {item.expiryDate || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        <button className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all">
                          <QrCode size={18} />
                        </button>
                        <button className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all">
                          <Settings size={18} />
                        </button>
                        <button className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all">
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile View */}
        <div className="lg:hidden divide-y divide-slate-100">
          {loading ? (
            <div className="p-12 text-center">
              <div className="w-10 h-10 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-sm text-slate-400 font-bold">Loading data...</p>
            </div>
          ) : filteredStock.length === 0 ? (
            <div className="p-12 text-center text-slate-300">
              <Database size={48} className="mx-auto mb-4 opacity-50" />
              <p className="text-sm font-bold uppercase tracking-widest">No data found</p>
            </div>
          ) : (
            filteredStock.map((item) => (
              <div key={item.id} className="p-6 space-y-5 hover:bg-slate-50/50 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <input 
                      type="checkbox" 
                      checked={selectedItems.includes(item.id)}
                      onChange={() => toggleSelectItem(item.id)}
                      className="w-6 h-6 rounded-lg border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <h4 className="font-black text-slate-900 uppercase tracking-tight leading-tight truncate">{item.name}</h4>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[10px] font-bold text-slate-500 font-mono bg-slate-100 px-2 py-0.5 rounded uppercase">{item.materialCode || 'NO-CODE'}</span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{item.brand || 'No Brand'}</span>
                      </div>
                    </div>
                  </div>
                  <button className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all">
                    <QrCode size={18} />
                  </button>
                </div>
                
                <div className="grid grid-cols-2 gap-4 bg-slate-50/50 p-5 rounded-2xl border border-slate-100">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Stock Available</p>
                    <p className="font-black text-slate-900 text-lg">{item.quantity} {item.unit}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Location</p>
                    <div className="flex items-center">
                      {item.location === 'warehouse' ? (
                        <span className="text-amber-600 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
                          <Warehouse size={12} /> Warehouse
                        </span>
                      ) : (
                        <span className="text-blue-600 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
                          <Microscope size={12} /> {item.labType}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="col-span-2 pt-3 border-t border-slate-200/50">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Expiration Date</p>
                    <div className="flex items-center gap-2 text-slate-600 font-bold text-xs">
                      <Clock size={14} className="text-slate-400" />
                      {item.expiryDate || '-'}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {showBulkQR && (
        <BulkQRCodeModal 
          items={stock.filter(i => selectedItems.includes(i.id))}
          onClose={() => setShowBulkQR(false)}
        />
      )}
    </div>
  );
};


const Layout = () => {
  const { user, settings, addNotification } = React.useContext(UserContext);
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 1024);

  return (
    <div className="flex min-h-screen subtle-gradient-bg font-sans text-slate-900">
      <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
      <div className="flex-1 flex flex-col min-w-0 pb-24 lg:pb-0">
        <Topbar onMenuClick={() => setIsSidebarOpen(true)} />
        <main className="flex-1 p-4 sm:p-6 lg:p-10 overflow-y-auto max-w-7xl mx-auto w-full">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/sampling/admin" element={<SamplingAdminDashboard user={user} onNotify={addNotification} />} />
            <Route path="/sampling/officer" element={<SamplingDashboard user={user} onNotify={addNotification} />} />
            <Route path="/lab/login" element={<LabLoginDashboard user={user} onNotify={addNotification} />} />
            <Route path="/lab/udara" element={<LabModule type="udara" title="Lab Udara" />} />
            <Route path="/lab/air" element={<LabModule type="air" title="Lab Air" />} />
            <Route path="/lab/b3_tanah" element={<LabModule type="b3_tanah" title="Lab B3 & Tanah" />} />
            <Route path="/lab/mikrobiologi" element={<LabModule type="mikrobiologi" title="Lab Mikrobiologi" />} />
            <Route path="/stock/lab" element={<LabStockOpnameView />} />
            <Route path="/stock/warehouse" element={<WarehouseStockView />} />
            <Route path="/master-data" element={<MasterDataView />} />
            <Route path="/reports" element={<ReportsView />} />
            <Route path="/purchasing" element={<PurchasingView />} />
            <Route path="/settings" element={<SettingsView />} />
          </Routes>
        </main>
      </div>
    </div>
  );
};

// --- Error Boundary ---
class ErrorBoundary extends (React.Component as any) {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full text-center space-y-6 border border-slate-100">
            <div className="bg-rose-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto text-rose-600">
              <AlertCircle size={40} />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-slate-900">Something went wrong</h1>
              <p className="text-slate-500">The application encountered an unexpected error. Please try refreshing the page.</p>
            </div>
            {this.state.error && (
              <div className="bg-slate-50 p-4 rounded-xl text-left overflow-auto max-h-40">
                <p className="text-xs font-mono text-rose-600 whitespace-pre-wrap">{this.state.error.message}</p>
              </div>
            )}
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
            >
              Refresh Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <Router>
        <AuthGuard>
          <Layout />
        </AuthGuard>
      </Router>
    </ErrorBoundary>
  );
}
