import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { Sequelize, DataTypes, Model } from 'sequelize';
import cors from 'cors';
import dotenv from 'dotenv';
import admin from 'firebase-admin';

import fs from 'fs';

// Handle global errors to prevent silent crashes
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

dotenv.config();

// Initialize Firebase Admin
try {
  admin.initializeApp();
  console.log('Firebase Admin initialized successfully');
} catch (error) {
  console.error('Firebase Admin initialization error:', error);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3000;

// --- Database Configuration ---
const dbHost = process.env.DB_HOST || 'localhost';
const dbPort = parseInt(process.env.DB_PORT || '3306') || 3306;
const dbUser = process.env.DB_USER || 'root';
const dbPass = process.env.DB_PASS || '';
const dbName = process.env.DB_NAME || 'lims_db';

// Validate dialect
const supportedDialects = ['mysql', 'mariadb', 'postgres', 'mssql', 'sqlite', 'oracle', 'db2'];
let dbDialect = (process.env.DB_DIALECT || 'sqlite').toLowerCase();

if (!supportedDialects.includes(dbDialect)) {
  console.warn(`Warning: Unsupported DB_DIALECT "${dbDialect}". Falling back to "sqlite".`);
  dbDialect = 'sqlite';
}

// Ensure data directory exists for SQLite in production
const sqliteStorage = process.env.NODE_ENV === 'production' ? './data/database.sqlite' : './database.sqlite';
if (dbDialect === 'sqlite' && process.env.NODE_ENV === 'production') {
  const dir = path.dirname(sqliteStorage);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created directory: ${dir}`);
  }
}

const sequelize = new Sequelize(dbName, dbUser, dbPass, {
  host: dbHost,
  port: dbPort,
  dialect: dbDialect as any,
  storage: dbDialect === 'sqlite' ? sqliteStorage : undefined,
  logging: false,
});

// --- Models ---
class User extends Model {}
User.init({
  uid: { type: DataTypes.STRING, primaryKey: true },
  email: { type: DataTypes.STRING, unique: true },
  displayName: { type: DataTypes.STRING },
  role: { type: DataTypes.ENUM('admin', 'analyst', 'warehouse_manager', 'purchasing', 'sampling_admin', 'sampling_officer', 'login_team'), defaultValue: 'analyst' },
  permissions: { type: DataTypes.TEXT }, // JSON string of permissions
  notificationPreferences: { type: DataTypes.TEXT }, // JSON string of notification preferences
}, { sequelize, modelName: 'user' });

class LabSample extends Model {}
LabSample.init({
  type: { type: DataTypes.ENUM('udara', 'air', 'b3_tanah', 'mikrobiologi') },
  sampleName: { type: DataTypes.STRING },
  status: { type: DataTypes.ENUM('pending', 'in-progress', 'completed'), defaultValue: 'pending' },
  analystId: { type: DataTypes.STRING },
  result: { type: DataTypes.TEXT },
}, { 
  sequelize, 
  modelName: 'lab_sample',
  indexes: [
    { fields: ['type'] },
    { fields: ['status'] },
    { fields: ['analystId'] }
  ]
});

class StockItem extends Model {}
StockItem.init({
  name: { type: DataTypes.STRING },
  brand: { type: DataTypes.STRING },
  lotNumber: { type: DataTypes.STRING },
  materialCode: { type: DataTypes.STRING },
  category: { type: DataTypes.STRING },
  quantity: { type: DataTypes.FLOAT, defaultValue: 0 },
  minStock: { type: DataTypes.FLOAT, defaultValue: 0 },
  unit: { type: DataTypes.STRING }, // Packaging Unit (Pack, Pcs, Botol)
  contentPerUnit: { type: DataTypes.FLOAT, defaultValue: 1 }, // Amount per package (e.g. 500)
  contentUnit: { type: DataTypes.STRING }, // Unit per package (Gram, ML, Pcs)
  totalContent: { type: DataTypes.FLOAT, defaultValue: 0 }, // Total amount in contentUnit
  arrivalDate: { type: DataTypes.DATEONLY },
  expiryDate: { type: DataTypes.DATEONLY },
  coaFile: { type: DataTypes.TEXT }, // Base64 PDF
  location: { type: DataTypes.ENUM('lab', 'warehouse') },
  labType: { type: DataTypes.ENUM('udara', 'air', 'b3_tanah', 'mikrobiologi', 'general'), defaultValue: 'general' },
  rejectionReason: { type: DataTypes.STRING },
  lastCheckedAt: { type: DataTypes.DATE },
}, { 
  sequelize, 
  modelName: 'stock_item',
  hooks: {
    beforeSave: (item: any) => {
      if (item.quantity !== undefined && item.contentPerUnit !== undefined) {
        item.totalContent = item.quantity * item.contentPerUnit;
      }
    }
  },
  indexes: [
    { fields: ['location'] },
    { fields: ['labType'] },
    { fields: ['name'] },
    { fields: ['materialCode'] }
  ]
});

class Requisition extends Model {}
Requisition.init({
  reagentName: { type: DataTypes.STRING },
  quantity: { type: DataTypes.FLOAT },
  unit: { type: DataTypes.STRING },
  labType: { type: DataTypes.ENUM('udara', 'air', 'b3_tanah', 'mikrobiologi', 'general') },
  status: { type: DataTypes.ENUM('pending', 'po', 'shipped', 'received', 'rejected', 'lab_rejected'), defaultValue: 'pending' },
  requestedBy: { type: DataTypes.STRING },
  approvedBy: { type: DataTypes.STRING },
  rejectionReason: { type: DataTypes.STRING },
  purchasingNote: { type: DataTypes.STRING },
  receivedPhoto: { type: DataTypes.TEXT }, // Store as base64 (used for both receive and lab_reject)
}, { 
  sequelize, 
  modelName: 'requisition',
  indexes: [
    { fields: ['labType'] },
    { fields: ['status'] }
  ]
});

class DailyUse extends Model {}
DailyUse.init({
  reagentName: { type: DataTypes.STRING },
  quantity: { type: DataTypes.FLOAT },
  unit: { type: DataTypes.STRING },
  labType: { type: DataTypes.ENUM('udara', 'air', 'b3_tanah', 'mikrobiologi') },
  userName: { type: DataTypes.STRING },
  purpose: { type: DataTypes.STRING },
  parameter: { type: DataTypes.STRING },
  date: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, { 
  sequelize, 
  modelName: 'daily_use',
  indexes: [
    { fields: ['labType'] },
    { fields: ['reagentName'] },
    { fields: ['date'] }
  ]
});

class AppSettings extends Model {}
AppSettings.init({
  key: { type: DataTypes.STRING, primaryKey: true },
  value: { type: DataTypes.TEXT },
}, { sequelize, modelName: 'app_settings' });

class ReagentTransfer extends Model {}
ReagentTransfer.init({
  reagentName: { type: DataTypes.STRING },
  quantity: { type: DataTypes.FLOAT },
  unit: { type: DataTypes.STRING },
  sourceLab: { type: DataTypes.ENUM('udara', 'air', 'b3_tanah', 'mikrobiologi', 'general') },
  destinationLab: { type: DataTypes.ENUM('udara', 'air', 'b3_tanah', 'mikrobiologi', 'general') },
  status: { type: DataTypes.ENUM('pending', 'approved', 'rejected'), defaultValue: 'pending' },
  requestedBy: { type: DataTypes.STRING },
  approvedBy: { type: DataTypes.STRING },
}, { sequelize, modelName: 'reagent_transfer' });

class StockCheck extends Model {}
StockCheck.init({
  stockItemId: { type: DataTypes.INTEGER },
  reagentName: { type: DataTypes.STRING },
  lotNumber: { type: DataTypes.STRING },
  systemQuantity: { type: DataTypes.FLOAT },
  physicalQuantity: { type: DataTypes.FLOAT },
  discrepancy: { type: DataTypes.FLOAT },
  checkedBy: { type: DataTypes.STRING },
  notes: { type: DataTypes.STRING },
  date: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, { 
  sequelize, 
  modelName: 'stock_check',
  indexes: [
    { fields: ['stockItemId'] },
    { fields: ['date'] }
  ]
});

// --- Sync Database ---
async function syncDatabase() {
  try {
    console.log('Syncing database...');
    await sequelize.sync({ alter: true });
    // Initialize default settings if not exists
    const defaults = [
      { key: 'appName', value: 'EnviroLIMS' },
      { key: 'appLogo', value: '' },
      { key: 'loginBackground', value: 'https://images.unsplash.com/photo-1581093588401-fbb62a02f10?auto=format&fit=crop&q=80&w=2070' },
      { key: 'themeColor', value: '#059669' },
      { key: 'loginTitle', value: 'EnviroLIMS' },
      { key: 'loginSubtitle', value: 'Environmental Laboratory Information Management System. Please sign in to access the system.' },
      { key: 'loginWelcomeText', value: 'Welcome Back' },
      { key: 'loginWelcomeSubtext', value: 'Please enter your details to sign in.' },
      { key: 'sidebarLabTitle', value: 'Laboratory' },
      { key: 'sidebarBackground', value: '' },
      { key: 'labNames', value: JSON.stringify({
        udara: 'Lab Udara',
        air: 'Lab Air',
        b3_tanah: 'Lab B3 & Tanah',
        mikrobiologi: 'Lab Mikrobiologi'
      }) },
      { key: 'rolePermissions', value: JSON.stringify({
        admin: ['dashboard', 'lab', 'stock_lab', 'stock_warehouse', 'master_data', 'purchasing', 'reports', 'settings', 'sampling_admin', 'sampling_officer', 'login_team', 'analyst_lab'],
        warehouse_manager: ['dashboard', 'stock_warehouse', 'master_data'],
        purchasing: ['dashboard', 'purchasing'],
        analyst: ['dashboard', 'analyst_lab', 'stock_lab', 'reports', 'settings'],
        sampling_admin: ['dashboard', 'sampling_admin', 'settings'],
        sampling_officer: ['dashboard', 'sampling_officer', 'settings'],
        login_team: ['dashboard', 'login_team', 'lab', 'settings']
      }) }
    ];
    for (const d of defaults) {
      if (d.key === 'rolePermissions') {
        // Force update rolePermissions to include new roles
        await AppSettings.upsert(d);
      } else {
        await AppSettings.findOrCreate({ where: { key: d.key }, defaults: d });
      }
    }
    console.log('Database synced successfully');
  } catch (error) {
    console.error('Failed to sync database:', error);
  }
}

async function startServer() {
  console.log('Starting server with NODE_ENV:', process.env.NODE_ENV);
  // Sync database first
  await syncDatabase();
  
  const app = express();
  
  // Request logging middleware
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
  });

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  app.use('/api', (req, res, next) => {
    console.log(`[API LOG] ${req.method} ${req.originalUrl}`);
    next();
  });

  // Stocks
  app.get('/api/stocks', async (req, res) => {
    console.log('GET /api/stocks request received', req.query);
    try {
      const { location, labType, page = 1, limit = 100 } = req.query;
      const offset = (Number(page) - 1) * Number(limit);
      const where: any = {};
      if (location) where.location = location;
      if (labType) where.labType = labType;
      
      const { count, rows } = await StockItem.findAndCountAll({ 
        where, 
        order: [['name', 'ASC']],
        limit: Number(limit),
        offset,
        attributes: { exclude: ['coaFile'] } // Exclude large base64 data for list
      });
      
      res.json({
        data: rows,
        total: count,
        page: Number(page),
        totalPages: Math.ceil(count / Number(limit))
      });
    } catch (error) {
      console.error('Get stocks error:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
    }
  });

  // --- API Routes ---
  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

  // Settings
  app.get('/api/settings', async (req, res) => {
    try {
      const settings = await AppSettings.findAll();
      const result: any = {};
      settings.forEach(s => {
        try {
          result[s.get('key') as string] = JSON.parse(s.get('value') as string);
        } catch {
          result[s.get('key') as string] = s.get('value');
        }
      });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Security Check: Only admins can change settings
  app.post('/api/settings', async (req, res) => {
    try {
      const { updates, requesterUid } = req.body;
      
      if (requesterUid) {
        const adminUser = await User.findByPk(requesterUid);
        if (!adminUser || adminUser.get('role') !== 'admin') {
          return res.status(403).json({ error: 'Unauthorized. Admin access required.' });
        }
      } else {
        return res.status(401).json({ error: 'Authentication required.' });
      }

      for (const [key, value] of Object.entries(updates)) {
        const valStr = typeof value === 'string' ? value : JSON.stringify(value);
        await AppSettings.upsert({ key, value: valStr });
      }
      res.json({ success: true });
    } catch (error) {
      console.error('Settings update error:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
    }
  });

  // Auth Sync
  app.post('/api/auth/sync', async (req, res) => {
    try {
      const { uid, email, displayName, role, permissions, requesterUid } = req.body;
      console.log(`Syncing user: ${email} (UID: ${uid}), Requested by: ${requesterUid}`);
      
      let user = await User.findByPk(uid);
      
      // Force admin role for the master email if it's currently different
      if (user && email === 'gkrismantara@gmail.com' && user.get('role') !== 'admin') {
        await user.update({ role: 'admin' });
      }

      if (!user) {
        // Check if user was pre-created by email
        user = await User.findOne({ where: { email } });
        if (user) {
          await user.update({ 
            uid, 
            displayName, 
            role: role || user.get('role'),
            permissions: permissions ? JSON.stringify(permissions) : user.get('permissions')
          });
        } else {
          user = await User.create({ 
            uid, 
            email, 
            displayName, 
            role: role || (email === 'gkrismantara@gmail.com' ? 'admin' : 'analyst'),
            permissions: permissions ? JSON.stringify(permissions) : null
          });
        }
      }
      const userData = user.get() as any;
      if (userData.permissions) {
        userData.permissions = JSON.parse(userData.permissions);
      }
      if (userData.notificationPreferences) {
        userData.notificationPreferences = JSON.parse(userData.notificationPreferences);
      } else {
        // Default preferences
        userData.notificationPreferences = {
          newJobAssignment: true,
          statusUpdate: true,
        };
      }
      res.json(userData);
    } catch (error) {
      console.error('Auth sync error:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
    }
  });

  app.get('/api/users', async (req, res) => {
    console.log(`GET /api/users request received, requesterUid: ${req.query.requesterUid}`);
    try {
      const { requesterUid } = req.query;
      
      // Security Check: Only admins can list users
      if (requesterUid) {
        const adminUser = await User.findByPk(requesterUid as string);
        if (!adminUser || adminUser.get('role') !== 'admin') {
          return res.status(403).json({ error: 'Unauthorized. Admin access required.' });
        }
      } else {
        return res.status(401).json({ error: 'Authentication required.' });
      }

      const users = await User.findAll();
      res.json(users.map(u => {
        const data = u.get() as any;
        if (data.permissions) {
          try {
            data.permissions = JSON.parse(data.permissions);
          } catch {
            data.permissions = [];
          }
        }
        return data;
      }));
    } catch (error) {
      console.error('Get users error:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
    }
  });

  app.post('/api/users', async (req, res) => {
    try {
      const { email, displayName, role, permissions, requesterUid } = req.body;
      
      // Security Check: Only admins can create users
      if (requesterUid) {
        const adminUser = await User.findByPk(requesterUid);
        if (!adminUser || adminUser.get('role') !== 'admin') {
          return res.status(403).json({ error: 'Unauthorized. Admin access required.' });
        }
      } else {
        return res.status(401).json({ error: 'Authentication required.' });
      }

      const user = await User.create({ 
        uid: `pending_${Date.now()}`, 
        email, 
        displayName, 
        role,
        permissions: permissions ? JSON.stringify(permissions) : null
      });
      const userData = user.get() as any;
      if (userData.permissions) userData.permissions = JSON.parse(userData.permissions);
      res.json(userData);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.delete('/api/users/:uid', async (req, res) => {
    try {
      const { requesterUid } = req.query;
      
      // Security Check: Only admins can delete users
      if (requesterUid) {
        const adminUser = await User.findByPk(requesterUid as string);
        if (!adminUser || adminUser.get('role') !== 'admin') {
          return res.status(403).json({ error: 'Unauthorized. Admin access required.' });
        }
      } else {
        return res.status(401).json({ error: 'Authentication required.' });
      }

      // Prevent self-deletion
      if (req.params.uid === requesterUid) {
        return res.status(400).json({ error: 'Cannot delete your own account.' });
      }

      await User.destroy({ where: { uid: req.params.uid } });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.put('/api/users/:uid/role', async (req, res) => {
    try {
      const { role, requesterUid } = req.body;
      
      // Security Check: Only admins can update roles
      if (requesterUid) {
        const adminUser = await User.findByPk(requesterUid);
        if (!adminUser || adminUser.get('role') !== 'admin') {
          return res.status(403).json({ error: 'Unauthorized. Admin access required.' });
        }
      } else {
        return res.status(401).json({ error: 'Authentication required.' });
      }

      await User.update({ role }, { where: { uid: req.params.uid } });
      res.json({ success: true });
    } catch (error) {
      console.error('Update user role error:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
    }
  });

  app.put('/api/users/:uid/permissions', async (req, res) => {
    try {
      const { permissions, requesterUid } = req.body;
      
      // Security Check: Only admins can update permissions
      if (requesterUid) {
        const adminUser = await User.findByPk(requesterUid);
        if (!adminUser || adminUser.get('role') !== 'admin') {
          return res.status(403).json({ error: 'Unauthorized. Admin access required.' });
        }
      } else {
        return res.status(401).json({ error: 'Authentication required.' });
      }

      await User.update({ 
        permissions: permissions ? JSON.stringify(permissions) : null 
      }, { where: { uid: req.params.uid } });
      res.json({ success: true });
    } catch (error) {
      console.error('Update user permissions error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.put('/api/users/:uid/preferences', async (req, res) => {
    try {
      const { preferences, requesterUid } = req.body;
      const { uid } = req.params;

      // Security Check: Only the user themselves or an admin can update preferences
      if (requesterUid !== uid) {
        const adminUser = await User.findByPk(requesterUid);
        if (!adminUser || adminUser.get('role') !== 'admin') {
          return res.status(403).json({ error: 'Unauthorized.' });
        }
      }

      await User.update({ 
        notificationPreferences: preferences ? JSON.stringify(preferences) : null 
      }, { where: { uid } });
      
      res.json({ success: true });
    } catch (error) {
      console.error('Update user preferences error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.put('/api/users/:uid/password', async (req, res) => {
    try {
      const { password, requesterUid } = req.body;
      const { uid } = req.params;

      // Security Check: Only admins can update passwords
      if (requesterUid) {
        const adminUser = await User.findByPk(requesterUid);
        if (!adminUser || adminUser.get('role') !== 'admin') {
          return res.status(403).json({ error: 'Unauthorized. Admin access required.' });
        }
      } else {
        return res.status(401).json({ error: 'Authentication required.' });
      }

      if (!password || password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters.' });
      }

      console.log(`Admin ${requesterUid} is changing password for user ${uid}`);
      
      const firebaseAdmin = admin as any; 
      await firebaseAdmin.auth().updateUser(uid, { password });
      
      res.json({ success: true });
    } catch (error: any) {
      console.error('Update user password error:', error);
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  });

  // Requisition Routes
  app.get('/api/requisitions', async (req, res) => {
    try {
      const { labType, status, page = 1, limit = 50 } = req.query;
      const offset = (Number(page) - 1) * Number(limit);
      const where: any = {};
      if (labType) where.labType = labType;
      if (status) where.status = status;
      
      const { count, rows } = await Requisition.findAndCountAll({ 
        where, 
        order: [['createdAt', 'DESC']],
        limit: Number(limit),
        offset
      });
      
      res.json({
        data: rows,
        total: count,
        page: Number(page),
        totalPages: Math.ceil(count / Number(limit))
      });
    } catch (error) {
      console.error('Get requisitions error:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
    }
  });

  app.post('/api/requisitions', async (req, res) => {
    try {
      const reqItem = await Requisition.create(req.body);
      res.json(reqItem);
    } catch (error) {
      console.error('Create requisition error:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
    }
  });

  app.post('/api/requisitions/:id/status', async (req, res) => {
    try {
      const { status, approvedBy, rejectionReason, purchasingNote } = req.body;
      const requisition = await Requisition.findByPk(req.params.id);
      if (!requisition) return res.status(404).json({ error: 'Not found' });

      const currentStatus = requisition.get('status');

      // Basic validation of status transitions
      if (status === 'po' && currentStatus !== 'pending' && currentStatus !== 'lab_rejected') return res.status(400).json({ error: 'Invalid transition to PO' });
      if (status === 'shipped' && currentStatus !== 'po') return res.status(400).json({ error: 'Invalid transition to Shipped' });
      if (status === 'rejected' && currentStatus !== 'pending' && currentStatus !== 'po' && currentStatus !== 'lab_rejected') return res.status(400).json({ error: 'Invalid transition to Rejected' });

      const updateData: any = { status };
      if (approvedBy) updateData.approvedBy = approvedBy;
      if (rejectionReason) updateData.rejectionReason = rejectionReason;
      if (purchasingNote !== undefined) updateData.purchasingNote = purchasingNote;
      
      // Clear lab rejection info if moving back to PO
      if (status === 'po') {
        updateData.rejectionReason = null;
        updateData.receivedPhoto = null;
      }

      await requisition.update(updateData);
      res.json({ success: true });
    } catch (error) {
      console.error('Update requisition status error:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
    }
  });

  app.post('/api/requisitions/:id/receive', async (req, res) => {
    try {
      const { receivedBy, receivedPhoto } = req.body;
      const requisition = await Requisition.findByPk(req.params.id);
      if (!requisition) return res.status(404).json({ error: 'Not found' });
      if (requisition.get('status') !== 'shipped') return res.status(400).json({ error: 'Only shipped items can be received' });

      // 1. Decrease Warehouse Stock
      const warehouseItem = await StockItem.findOne({ 
        where: { name: requisition.get('reagentName'), location: 'warehouse' } 
      });
      
      if (!warehouseItem || (warehouseItem.get('quantity') as number) < (requisition.get('quantity') as number)) {
        return res.status(400).json({ error: 'Insufficient warehouse stock' });
      }

      await warehouseItem.decrement('quantity', { by: requisition.get('quantity') as number });

      // 2. Increase Lab Stock (Match by name and lot to preserve details)
      let labItem = await StockItem.findOne({ 
        where: { 
          name: requisition.get('reagentName'), 
          lotNumber: warehouseItem.get('lotNumber') || null,
          location: 'lab', 
          labType: requisition.get('labType') 
        } 
      });

      if (labItem) {
        const contentToAdd = (requisition.get('quantity') as number) * (warehouseItem.get('contentPerUnit') as number || 1);
        await labItem.increment({
          quantity: requisition.get('quantity') as number,
          totalContent: contentToAdd
        });
      } else {
        const quantity = requisition.get('quantity') as number;
        const contentPerUnit = warehouseItem.get('contentPerUnit') as number || 1;
        await StockItem.create({
          name: requisition.get('reagentName'),
          brand: warehouseItem.get('brand'),
          lotNumber: warehouseItem.get('lotNumber'),
          materialCode: warehouseItem.get('materialCode'),
          category: warehouseItem.get('category'),
          quantity: quantity,
          contentPerUnit: contentPerUnit,
          totalContent: quantity * contentPerUnit,
          unit: requisition.get('unit'),
          contentUnit: warehouseItem.get('contentUnit'),
          arrivalDate: new Date().toISOString().split('T')[0],
          expiryDate: warehouseItem.get('expiryDate'),
          coaFile: warehouseItem.get('coaFile'),
          location: 'lab',
          labType: requisition.get('labType')
        });
      }

      // 3. Update Requisition Status
      await requisition.update({ status: 'received', approvedBy: receivedBy, receivedPhoto });
      res.json({ success: true });
    } catch (error) {
      console.error('Receive requisition error:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
    }
  });

  app.post('/api/requisitions/:id/lab-reject', async (req, res) => {
    try {
      const { rejectedBy, rejectionReason, rejectionPhoto } = req.body;
      const requisition = await Requisition.findByPk(req.params.id);
      if (!requisition) return res.status(404).json({ error: 'Not found' });
      if (requisition.get('status') !== 'shipped') return res.status(400).json({ error: 'Only shipped items can be rejected' });

      await requisition.update({ 
        status: 'lab_rejected', 
        approvedBy: rejectedBy, 
        rejectionReason, 
        receivedPhoto: rejectionPhoto 
      });
      res.json({ success: true });
    } catch (error) {
      console.error('Lab reject requisition error:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
    }
  });

  // Keep old routes for compatibility but they will be replaced in UI
  app.post('/api/requisitions/:id/approve', async (req, res) => {
    res.status(410).json({ error: 'This endpoint is deprecated. Use /api/requisitions/:id/status' });
  });

  app.post('/api/requisitions/:id/reject', async (req, res) => {
    res.status(410).json({ error: 'This endpoint is deprecated. Use /api/requisitions/:id/status' });
  });

  // --- Daily Use Routes ---
  app.get('/api/daily-use', async (req, res) => {
    try {
      const { labType, reagentName, startDate, endDate, page = 1, limit = 100 } = req.query;
      const offset = (Number(page) - 1) * Number(limit);
      const where: any = {};
      if (labType) where.labType = labType;
      if (reagentName) where.reagentName = reagentName;
      
      if (startDate || endDate) {
        const { Op } = (Sequelize as any);
        where.date = {};
        if (startDate) where.date[Op.gte] = new Date(startDate as string);
        if (endDate) where.date[Op.lte] = new Date(endDate as string);
      }
      
      const { count, rows } = await DailyUse.findAndCountAll({ 
        where, 
        order: [['date', 'ASC']],
        limit: Number(limit),
        offset
      });
      
      res.json({
        data: rows,
        total: count,
        page: Number(page),
        totalPages: Math.ceil(count / Number(limit))
      });
    } catch (error) {
      console.error('Get daily use error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/daily-use', async (req, res) => {
    try {
      const { reagentName, quantity, labType } = req.body;
      
      // Decrease Lab Stock
      const labItem = await StockItem.findOne({ 
        where: { name: reagentName, location: 'lab', labType } 
      });

      if (!labItem || (labItem.get('totalContent') as number) < quantity) {
        return res.status(400).json({ error: 'Insufficient lab stock' });
      }

      const newTotalContent = (labItem.get('totalContent') as number) - quantity;
      const contentPerUnit = (labItem.get('contentPerUnit') as number) || 1;
      const newQuantity = Math.ceil(newTotalContent / contentPerUnit);

      await labItem.update({ 
        totalContent: newTotalContent,
        quantity: newQuantity
      });
      const dailyUse = await DailyUse.create(req.body);
      res.json(dailyUse);
    } catch (error) {
      console.error('Create daily use error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/samples', async (req, res) => {
    try {
      const { type, page = 1, limit = 50 } = req.query;
      const offset = (Number(page) - 1) * Number(limit);
      const where = type ? { type } : {};
      
      const { count, rows } = await LabSample.findAndCountAll({ 
        where, 
        order: [['createdAt', 'DESC']],
        limit: Number(limit),
        offset
      });
      
      res.json({
        data: rows,
        total: count,
        page: Number(page),
        totalPages: Math.ceil(count / Number(limit))
      });
    } catch (error) {
      console.error('Get samples error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/samples', async (req, res) => {
    try {
      const sample = await LabSample.create(req.body);
      res.json(sample);
    } catch (error) {
      console.error('Create sample error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.put('/api/samples/:id', async (req, res) => {
    try {
      await LabSample.update(req.body, { where: { id: req.params.id } });
      res.json({ success: true });
    } catch (error) {
      console.error('Update sample error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.delete('/api/samples/:id', async (req, res) => {
    try {
      await LabSample.destroy({ where: { id: req.params.id } });
      res.json({ success: true });
    } catch (error) {
      console.error('Delete sample error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Stocks
  app.get('/api/stocks/:id', async (req, res) => {
    try {
      const item = await StockItem.findByPk(req.params.id);
      if (!item) return res.status(404).json({ error: 'Not found' });
      res.json(item);
    } catch (error) {
      console.error('Get stock item error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/stocks', async (req, res) => {
    try {
      const item = await StockItem.create(req.body);
      res.json(item);
    } catch (error) {
      console.error('Create stocks error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/stocks/bulk', async (req, res) => {
    try {
      const items = await StockItem.bulkCreate(req.body);
      res.json(items);
    } catch (error) {
      console.error('Bulk create stocks error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.put('/api/stocks/:id', async (req, res) => {
    try {
      await StockItem.update(req.body, { where: { id: req.params.id }, individualHooks: true });
      res.json({ success: true });
    } catch (error) {
      console.error('Update stocks error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.put('/api/stocks-bulk/update', async (req, res) => {
    try {
      const { ids, updates } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'IDs array is required' });
      }
      await StockItem.update(updates, { 
        where: { id: ids },
        individualHooks: true 
      });
      res.json({ success: true });
    } catch (error) {
      console.error('Bulk update stocks error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.delete('/api/stocks/:id', async (req, res) => {
    try {
      await StockItem.destroy({ where: { id: req.params.id } });
      res.json({ success: true });
    } catch (error) {
      console.error('Delete stocks error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Reagent Transfers
  app.get('/api/transfers', async (req, res) => {
    try {
      res.json(await ReagentTransfer.findAll({ order: [['createdAt', 'DESC']] }));
    } catch (error) {
      console.error('Get transfers error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/transfers', async (req, res) => {
    try {
      const transfer = await ReagentTransfer.create(req.body);
      res.json(transfer);
    } catch (error) {
      console.error('Create transfer error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.put('/api/transfers/:id/approve', async (req, res) => {
    try {
      const { approvedBy } = req.body;
      const transfer = await ReagentTransfer.findByPk(req.params.id);
      if (!transfer) return res.status(404).json({ error: 'Transfer not found' });

      // Update transfer status
      await transfer.update({ status: 'approved', approvedBy });

      // Handle stock adjustment
      const { reagentName, quantity, sourceLab, destinationLab } = transfer.get() as any;

      // Deduct from source
      const sourceItem = await StockItem.findOne({ where: { name: reagentName, labType: sourceLab, location: 'lab' } });
      if (sourceItem) {
        await sourceItem.decrement('quantity', { by: quantity });
      }

      // Add to destination (Match by name and lot to preserve details)
      const [destItem, created] = await StockItem.findOrCreate({
        where: { 
          name: reagentName, 
          lotNumber: sourceItem ? sourceItem.get('lotNumber') : null,
          labType: destinationLab, 
          location: 'lab' 
        },
        defaults: {
          name: reagentName,
          brand: sourceItem ? sourceItem.get('brand') : null,
          lotNumber: sourceItem ? sourceItem.get('lotNumber') : null,
          materialCode: sourceItem ? sourceItem.get('materialCode') : null,
          category: sourceItem ? sourceItem.get('category') : 'Reagent',
          labType: destinationLab,
          location: 'lab',
          quantity: 0,
          minStock: 0,
          unit: (transfer.get() as any).unit,
          contentUnit: sourceItem ? sourceItem.get('contentUnit') : null,
          expiryDate: sourceItem ? sourceItem.get('expiryDate') : null,
          coaFile: sourceItem ? sourceItem.get('coaFile') : null,
          arrivalDate: new Date().toISOString().split('T')[0]
        }
      });
      await destItem.increment('quantity', { by: quantity });

      res.json({ success: true });
    } catch (error) {
      console.error('Approve transfer error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.put('/api/transfers/:id/reject', async (req, res) => {
    try {
      const { approvedBy } = req.body;
      await ReagentTransfer.update({ status: 'rejected', approvedBy }, { where: { id: req.params.id } });
      res.json({ success: true });
    } catch (error) {
      console.error('Reject transfer error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Stock Checks
  app.get('/api/stock-checks', async (req, res) => {
    try {
      const { stockItemId, limit = 100 } = req.query;
      const where: any = {};
      if (stockItemId) where.stockItemId = stockItemId;
      
      const checks = await StockCheck.findAll({ 
        where, 
        order: [['date', 'DESC']],
        limit: Number(limit)
      });
      res.json(checks);
    } catch (error) {
      console.error('Get stock checks error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/stock-checks', async (req, res) => {
    try {
      const check = await StockCheck.create(req.body);
      // Update the stock item last checked date and optionally quantity
      if (req.body.stockItemId) {
        const updateData: any = { lastCheckedAt: new Date() };
        if (req.body.updateStock) {
          updateData.quantity = req.body.physicalQuantity;
        }
        await StockItem.update(updateData, { where: { id: req.body.stockItemId } });
      }
      res.json(check);
    } catch (error) {
      console.error('Create stock check error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // --- System Management ---
  app.get('/api/system/backup', async (req, res) => {
    const { uid } = req.query;
    try {
      // Check admin role
      const user = await User.findByPk(uid as string);
      if (!user || (user.get('role') !== 'admin')) {
        return res.status(403).json({ error: 'Unauthorized. Admin access required.' });
      }

      const data = {
        users: await User.findAll(),
        samples: await LabSample.findAll(),
        stocks: await StockItem.findAll(),
        requisitions: await Requisition.findAll(),
        dailyUses: await DailyUse.findAll(),
        settings: await AppSettings.findAll(),
        transfers: await ReagentTransfer.findAll(),
        stockChecks: await StockCheck.findAll(),
        version: '1.0.0',
        timestamp: new Date().toISOString()
      };
      res.json(data);
    } catch (error) {
      console.error('Backup error:', error);
      res.status(500).json({ error: 'Failed to create backup' });
    }
  });

  app.post('/api/system/restore', async (req, res) => {
    const { uid, data: backupData } = req.body;
    try {
      // Check admin role
      const user = await User.findByPk(uid);
      if (!user || (user.get('role') !== 'admin')) {
        return res.status(403).json({ error: 'Unauthorized. Admin access required.' });
      }

      const transaction = await sequelize.transaction();
      try {
        const { users, samples, stocks, requisitions, dailyUses, settings, transfers } = backupData;

        // Clear existing data
      await User.destroy({ where: {}, transaction });
      await LabSample.destroy({ where: {}, transaction });
      await StockItem.destroy({ where: {}, transaction });
      await Requisition.destroy({ where: {}, transaction });
      await DailyUse.destroy({ where: {}, transaction });
      await AppSettings.destroy({ where: {}, transaction });
      await ReagentTransfer.destroy({ where: {}, transaction });
      await StockCheck.destroy({ where: {}, transaction });

      // Restore data
      if (users) await User.bulkCreate(users, { transaction });
      if (samples) await LabSample.bulkCreate(samples, { transaction });
      if (stocks) await StockItem.bulkCreate(stocks, { transaction });
      if (requisitions) await Requisition.bulkCreate(requisitions, { transaction });
      if (dailyUses) await DailyUse.bulkCreate(dailyUses, { transaction });
      if (settings) await AppSettings.bulkCreate(settings, { transaction });
      if (transfers) await ReagentTransfer.bulkCreate(transfers, { transaction });
      if (backupData.stockChecks) await StockCheck.bulkCreate(backupData.stockChecks, { transaction });

      await transaction.commit();
      res.json({ success: true });
    } catch (error) {
      await transaction.rollback();
      console.error('Restore error:', error);
      res.status(500).json({ error: 'Failed to restore backup' });
    }
  } catch (error) {
    console.error('Restore auth error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

  app.post('/api/system/reset', async (req, res) => {
    const { uid } = req.body;
    try {
      // Check admin role
      const user = await User.findByPk(uid);
      if (!user || (user.get('role') !== 'admin')) {
        return res.status(403).json({ error: 'Unauthorized. Admin access required.' });
      }

      const transaction = await sequelize.transaction();
      try {
        await LabSample.destroy({ where: {}, transaction });
        await StockItem.destroy({ where: {}, transaction });
        await Requisition.destroy({ where: {}, transaction });
        await DailyUse.destroy({ where: {}, transaction });
        await ReagentTransfer.destroy({ where: {}, transaction });
        await StockCheck.destroy({ where: {}, transaction });
        // Optionally keep AppSettings and Users
        
        await transaction.commit();
        res.json({ success: true });
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    } catch (error) {
      console.error('Reset error:', error);
      res.status(500).json({ error: 'Failed to reset system' });
    }
  });

  // --- API 404 Handler ---
  app.use('/api/*', (req, res) => {
    res.status(404).json({ error: `API route ${req.method} ${req.originalUrl} not found` });
  });

  // --- Vite Middleware ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Global error handler
  app.use((err: any, req: any, res: any, next: any) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('CRITICAL: Failed to start server:', err);
  process.exit(1);
});
