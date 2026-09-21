export type PageKey =
  | 'dashboard'
  | 'databases'
  | 'tables'
  | 'sql-editor'
  | 'query-history'
  | 'users'
  | 'import-export'
  | 'backups'
  | 'monitoring'
  | 'settings';

export interface DatabaseRow {
  name: string;
  engine: string;
  tables: number;
  size: string;
  status: 'Online' | 'Syncing' | 'Offline' | 'Maintenance';
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  key: 'PRI' | 'UNI' | 'MUL' | '';
  defaultValue: string | null;
  extra: string;
}

export interface IndexInfo {
  name: string;
  columns: string[];
  type: 'BTREE' | 'HASH' | 'FULLTEXT';
  unique: boolean;
}

export interface TableDetail {
  columns: ColumnInfo[];
  indexes: IndexInfo[];
  sampleData: Record<string, string>[];
}

export interface TableInfo {
  name: string;
  rows: string;
  size: string;
  engine?: string;
  collation?: string;
  lastModified?: string;
  detail?: TableDetail;
}

export interface QueryRecord {
  id: string;
  query: string;
  database: string;
  duration: number;
  rows: number;
  status: 'success' | 'error' | 'slow';
  timestamp: string;
  user: string;
}

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  role: 'Admin' | 'Developer' | 'Read-Only' | 'DBA';
  status: 'Active' | 'Invited' | 'Suspended';
  lastActive: string;
  avatarColor: string;
  initials: string;
}

export interface BackupRecord {
  id: string;
  database: string;
  type: 'Full' | 'Incremental' | 'Snapshot';
  size: string;
  status: 'Completed' | 'In Progress' | 'Scheduled' | 'Failed';
  timestamp: string;
  duration: string;
  driveId?: string;
}

/* ---- Dashboard stats ---- */
export const dashboardStats = [
  { label: 'Databases', value: '48', icon: 'Database', trend: '+3', trendUp: true, color: 'blue' },
  { label: 'Tables', value: '1,247', icon: 'Table2', trend: '+28', trendUp: true, color: 'cyan' },
  { label: 'Total Rows', value: '3.8B', icon: 'Rows3', trend: '+127M', trendUp: true, color: 'emerald' },
  { label: 'Active Users', value: '124', icon: 'Users', trend: '+12', trendUp: true, color: 'violet' },
  { label: 'Active Connections', value: '18', icon: 'Cable', trend: '−2', trendUp: false, color: 'amber' },
  { label: 'RAM Usage', value: '12GB', icon: 'MemoryStick', trend: '8%', trendUp: false, color: 'rose' },
  { label: 'CPU Usage', value: '42%', icon: 'Cpu', trend: '+5%', trendUp: true, color: 'orange' },
  { label: 'Storage Used', value: '2.4TB', icon: 'HardDrive', trend: '+38GB', trendUp: true, color: 'slate' },
] as const;

export const recentDatabases: DatabaseRow[] = [
  { name: 'ecommerce_prod', engine: 'MySQL 8', tables: 124, size: '18.2 GB', status: 'Online' },
  { name: 'crm_system', engine: 'MariaDB', tables: 87, size: '9.5 GB', status: 'Online' },
  { name: 'immobilier_tn', engine: 'MySQL 8', tables: 156, size: '24.1 GB', status: 'Online' },
  { name: 'analytics', engine: 'PostgreSQL', tables: 312, size: '87.5 GB', status: 'Online' },
  { name: 'backup_archive', engine: 'MySQL', tables: 413, size: '50 GB', status: 'Syncing' },
];

export const recentQueries: QueryRecord[] = [
  { id: 'q1', query: 'SELECT * FROM users LIMIT 100;', database: 'ecommerce_prod', duration: 12, rows: 100, status: 'success', timestamp: '2 min ago', user: 'sarah.c' },
  { id: 'q2', query: "UPDATE properties SET status='published';", database: 'immobilier_tn', duration: 340, rows: 48, status: 'slow', timestamp: '5 min ago', user: 'marwan.k' },
  { id: 'q3', query: 'SELECT COUNT(*) FROM orders;', database: 'ecommerce_prod', duration: 8, rows: 1, status: 'success', timestamp: '11 min ago', user: 'sarah.c' },
  { id: 'q4', query: 'DELETE FROM logs WHERE created_at < NOW()-INTERVAL 30 DAY;', database: 'analytics', duration: 1240, rows: 128400, status: 'slow', timestamp: '23 min ago', user: 'admin' },
];

export const topTables: TableInfo[] = [
  { name: 'users', rows: '1,240,000', size: '2.3 GB' },
  { name: 'orders', rows: '8,700,000', size: '18.2 GB' },
  { name: 'properties', rows: '4,200,000', size: '12.4 GB' },
  { name: 'visits', rows: '185,000,000', size: '95 GB' },
];

/* ---- Monitoring chart data ---- */
export const cpuSeries = [38, 42, 35, 48, 52, 45, 50, 47, 55, 43, 39, 44, 48, 42];
export const ramSeries = [68, 70, 72, 71, 74, 73, 75, 76, 78, 77, 79, 80, 78, 76];
export const connectionsSeries = [8, 12, 15, 18, 22, 19, 24, 20, 17, 15, 14, 18, 16, 18];
export const queryPerfSeries = [14, 22, 18, 35, 28, 42, 31, 25, 19, 45, 38, 29, 33, 27];

export const cpuLabels = ['00','02','04','06','08','10','12','14','16','18','20','22','00','02'];
export const connLabels = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun','Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

export const diskUsage = { used: 2.4, total: 4, label: '2.4TB / 4TB', percent: 60 };

export const dbSizeBreakdown = [
  { label: 'analytics', value: 87.5, color: '#2563eb' },
  { label: 'backup_archive', value: 50, color: '#0891b2' },
  { label: 'immobilier_tn', value: 24.1, color: '#059669' },
  { label: 'ecommerce_prod', value: 18.2, color: '#d97706' },
  { label: 'crm_system', value: 9.5, color: '#e11d48' },
  { label: 'other', value: 51.7, color: '#94a3b8' },
];

/* ---- Full databases table ---- */
export const allDatabases: DatabaseRow[] = [
  ...recentDatabases,
  { name: 'auth_service', engine: 'PostgreSQL', tables: 23, size: '3.2 GB', status: 'Online' },
  { name: 'logging_db', engine: 'MySQL 8', tables: 18, size: '12.8 GB', status: 'Online' },
  { name: 'payments', engine: 'PostgreSQL', tables: 41, size: '6.7 GB', status: 'Online' },
  { name: 'sessions', engine: 'Redis', tables: 8, size: '1.1 GB', status: 'Online' },
  { name: 'reporting', engine: 'MariaDB', tables: 92, size: '15.3 GB', status: 'Maintenance' },
  { name: 'staging_ecom', engine: 'MySQL 8', tables: 124, size: '18.0 GB', status: 'Offline' },
  { name: 'data_warehouse', engine: 'PostgreSQL', tables: 210, size: '142.0 GB', status: 'Online' },
  { name: 'messaging', engine: 'MariaDB', tables: 34, size: '7.9 GB', status: 'Online' },
  { name: 'notifications', engine: 'MySQL 8', tables: 12, size: '2.1 GB', status: 'Online' },
  { name: 'user_profiles', engine: 'PostgreSQL', tables: 19, size: '5.4 GB', status: 'Online' },
];

/* ---- Full tables data ---- */
export const allTables: TableInfo[] = [
  {
    name: 'users', rows: '1,240,000', size: '2.3 GB', engine: 'InnoDB', collation: 'utf8mb4_unicode_ci', lastModified: '2 min ago',
    detail: {
      columns: [
        { name: 'id', type: 'BIGINT UNSIGNED', nullable: false, key: 'PRI', defaultValue: null, extra: 'AUTO_INCREMENT' },
        { name: 'uuid', type: 'CHAR(36)', nullable: false, key: 'UNI', defaultValue: null, extra: '' },
        { name: 'name', type: 'VARCHAR(255)', nullable: false, key: '', defaultValue: null, extra: '' },
        { name: 'email', type: 'VARCHAR(255)', nullable: false, key: 'UNI', defaultValue: null, extra: '' },
        { name: 'password_hash', type: 'VARCHAR(255)', nullable: false, key: '', defaultValue: null, extra: '' },
        { name: 'role', type: "ENUM('admin','dev','user')", nullable: false, key: '', defaultValue: 'user', extra: '' },
        { name: 'avatar_url', type: 'VARCHAR(500)', nullable: true, key: '', defaultValue: null, extra: '' },
        { name: 'last_login', type: 'DATETIME', nullable: true, key: '', defaultValue: null, extra: '' },
        { name: 'created_at', type: 'TIMESTAMP', nullable: false, key: '', defaultValue: 'CURRENT_TIMESTAMP', extra: '' },
        { name: 'updated_at', type: 'TIMESTAMP', nullable: false, key: '', defaultValue: 'CURRENT_TIMESTAMP', extra: 'ON UPDATE CURRENT_TIMESTAMP' },
      ],
      indexes: [
        { name: 'PRIMARY', columns: ['id'], type: 'BTREE', unique: true },
        { name: 'uniq_uuid', columns: ['uuid'], type: 'BTREE', unique: true },
        { name: 'uniq_email', columns: ['email'], type: 'BTREE', unique: true },
        { name: 'idx_role', columns: ['role'], type: 'BTREE', unique: false },
      ],
      sampleData: [
        { id: '1', name: 'Sarah Chen', email: 'sarah.c@dbhub.io', role: 'admin', created_at: '2025-01-15 09:30:00' },
        { id: '2', name: 'Marwan Khelifi', email: 'marwan.k@dbhub.io', role: 'dev', created_at: '2025-02-03 14:22:00' },
        { id: '3', name: 'Alex Rivera', email: 'alex.r@dbhub.io', role: 'dev', created_at: '2025-03-11 08:15:00' },
        { id: '4', name: 'Priya Patel', email: 'priya.p@dbhub.io', role: 'dev', created_at: '2025-04-20 16:45:00' },
        { id: '5', name: 'Tom Walker', email: 'tom.w@dbhub.io', role: 'user', created_at: '2025-05-14 11:00:00' },
      ],
    },
  },
  {
    name: 'orders', rows: '8,700,000', size: '18.2 GB', engine: 'InnoDB', collation: 'utf8mb4_unicode_ci', lastModified: '5 min ago',
    detail: {
      columns: [
        { name: 'id', type: 'BIGINT UNSIGNED', nullable: false, key: 'PRI', defaultValue: null, extra: 'AUTO_INCREMENT' },
        { name: 'user_id', type: 'BIGINT UNSIGNED', nullable: false, key: 'MUL', defaultValue: null, extra: '' },
        { name: 'order_number', type: 'VARCHAR(32)', nullable: false, key: 'UNI', defaultValue: null, extra: '' },
        { name: 'status', type: "ENUM('pending','paid','shipped','delivered','cancelled')", nullable: false, key: '', defaultValue: 'pending', extra: '' },
        { name: 'total', type: 'DECIMAL(10,2)', nullable: false, key: '', defaultValue: '0.00', extra: '' },
        { name: 'tax_amount', type: 'DECIMAL(10,2)', nullable: false, key: '', defaultValue: '0.00', extra: '' },
        { name: 'shipping_address', type: 'TEXT', nullable: true, key: '', defaultValue: null, extra: '' },
        { name: 'payment_method', type: 'VARCHAR(50)', nullable: true, key: '', defaultValue: null, extra: '' },
        { name: 'created_at', type: 'TIMESTAMP', nullable: false, key: '', defaultValue: 'CURRENT_TIMESTAMP', extra: '' },
        { name: 'updated_at', type: 'TIMESTAMP', nullable: false, key: '', defaultValue: 'CURRENT_TIMESTAMP', extra: 'ON UPDATE CURRENT_TIMESTAMP' },
      ],
      indexes: [
        { name: 'PRIMARY', columns: ['id'], type: 'BTREE', unique: true },
        { name: 'uniq_order_number', columns: ['order_number'], type: 'BTREE', unique: true },
        { name: 'idx_user_id', columns: ['user_id'], type: 'BTREE', unique: false },
        { name: 'idx_status_created', columns: ['status', 'created_at'], type: 'BTREE', unique: false },
      ],
      sampleData: [
        { id: '100001', user_id: '1', order_number: 'ORD-2026-0001', status: 'delivered', total: '489.00', created_at: '2026-09-01 10:15:00' },
        { id: '100002', user_id: '2', order_number: 'ORD-2026-0002', status: 'shipped', total: '152.50', created_at: '2026-09-02 14:30:00' },
        { id: '100003', user_id: '1', order_number: 'ORD-2026-0003', status: 'paid', total: '89.99', created_at: '2026-09-05 09:00:00' },
        { id: '100004', user_id: '3', order_number: 'ORD-2026-0004', status: 'pending', total: '245.00', created_at: '2026-09-10 16:45:00' },
        { id: '100005', user_id: '4', order_number: 'ORD-2026-0005', status: 'cancelled', total: '67.30', created_at: '2026-09-12 11:20:00' },
      ],
    },
  },
  {
    name: 'properties', rows: '4,200,000', size: '12.4 GB', engine: 'InnoDB', collation: 'utf8mb4_unicode_ci', lastModified: '11 min ago',
    detail: {
      columns: [
        { name: 'id', type: 'BIGINT UNSIGNED', nullable: false, key: 'PRI', defaultValue: null, extra: 'AUTO_INCREMENT' },
        { name: 'agent_id', type: 'BIGINT UNSIGNED', nullable: false, key: 'MUL', defaultValue: null, extra: '' },
        { name: 'title', type: 'VARCHAR(255)', nullable: false, key: '', defaultValue: null, extra: '' },
        { name: 'description', type: 'TEXT', nullable: true, key: '', defaultValue: null, extra: '' },
        { name: 'price', type: 'DECIMAL(12,2)', nullable: false, key: '', defaultValue: null, extra: '' },
        { name: 'city', type: 'VARCHAR(100)', nullable: false, key: 'MUL', defaultValue: null, extra: '' },
        { name: 'area_sqm', type: 'DECIMAL(8,2)', nullable: true, key: '', defaultValue: null, extra: '' },
        { name: 'bedrooms', type: 'TINYINT UNSIGNED', nullable: true, key: '', defaultValue: null, extra: '' },
        { name: 'bathrooms', type: 'TINYINT UNSIGNED', nullable: true, key: '', defaultValue: null, extra: '' },
        { name: 'status', type: "ENUM('draft','published','sold','rented')", nullable: false, key: '', defaultValue: 'draft', extra: '' },
        { name: 'created_at', type: 'TIMESTAMP', nullable: false, key: '', defaultValue: 'CURRENT_TIMESTAMP', extra: '' },
      ],
      indexes: [
        { name: 'PRIMARY', columns: ['id'], type: 'BTREE', unique: true },
        { name: 'idx_agent_id', columns: ['agent_id'], type: 'BTREE', unique: false },
        { name: 'idx_city_status', columns: ['city', 'status'], type: 'BTREE', unique: false },
      ],
      sampleData: [
        { id: '1', title: 'Appartement Sidi Dhrif', price: '320000', city: 'Tunis', status: 'published', bedrooms: '3' },
        { id: '2', title: 'Villa La Marsa', price: '1200000', city: 'Tunis', status: 'sold', bedrooms: '5' },
        { id: '3', title: 'Studio Sousse', price: '1800', city: 'Sousse', status: 'rented', bedrooms: '1' },
        { id: '4', title: 'R+1 Hammamet', price: '650000', city: 'Hammamet', status: 'published', bedrooms: '4' },
        { id: '5', title: 'Commercial Sfax', price: '890000', city: 'Sfax', status: 'draft', bedrooms: '0' },
      ],
    },
  },
  {
    name: 'visits', rows: '185,000,000', size: '95 GB', engine: 'InnoDB', collation: 'utf8mb4_unicode_ci', lastModified: '1 min ago',
    detail: {
      columns: [
        { name: 'id', type: 'BIGINT UNSIGNED', nullable: false, key: 'PRI', defaultValue: null, extra: 'AUTO_INCREMENT' },
        { name: 'visitor_id', type: 'CHAR(36)', nullable: false, key: 'MUL', defaultValue: null, extra: '' },
        { name: 'property_id', type: 'BIGINT UNSIGNED', nullable: false, key: 'MUL', defaultValue: null, extra: '' },
        { name: 'source', type: "ENUM('web','mobile','api','widget')", nullable: false, key: '', defaultValue: 'web', extra: '' },
        { name: 'ip_address', type: 'VARCHAR(45)', nullable: true, key: '', defaultValue: null, extra: '' },
        { name: 'user_agent', type: 'VARCHAR(500)', nullable: true, key: '', defaultValue: null, extra: '' },
        { name: 'duration_seconds', type: 'INT UNSIGNED', nullable: true, key: '', defaultValue: '0', extra: '' },
        { name: 'created_at', type: 'TIMESTAMP', nullable: false, key: '', defaultValue: 'CURRENT_TIMESTAMP', extra: '' },
      ],
      indexes: [
        { name: 'PRIMARY', columns: ['id'], type: 'BTREE', unique: true },
        { name: 'idx_visitor_id', columns: ['visitor_id'], type: 'BTREE', unique: false },
        { name: 'idx_property_id', columns: ['property_id'], type: 'BTREE', unique: false },
        { name: 'idx_created_at', columns: ['created_at'], type: 'BTREE', unique: false },
      ],
      sampleData: [
        { id: '99000001', visitor_id: 'a1b2c3d4-…', property_id: '42', source: 'web', duration_seconds: '125', created_at: '2026-09-17 12:01:00' },
        { id: '99000002', visitor_id: 'e5f6g7h8-…', property_id: '108', source: 'mobile', duration_seconds: '45', created_at: '2026-09-17 12:02:00' },
        { id: '99000003', visitor_id: 'i9j0k1l2-…', property_id: '42', source: 'api', duration_seconds: '12', created_at: '2026-09-17 12:03:00' },
        { id: '99000004', visitor_id: 'm3n4o5p6-…', property_id: '77', source: 'widget', duration_seconds: '89', created_at: '2026-09-17 12:04:00' },
        { id: '99000005', visitor_id: 'q7r8s9t0-…', property_id: '201', source: 'web', duration_seconds: '210', created_at: '2026-09-17 12:05:00' },
      ],
    },
  },
  {
    name: 'order_items', rows: '22,400,000', size: '34.1 GB', engine: 'InnoDB', collation: 'utf8mb4_unicode_ci', lastModified: '8 min ago',
    detail: {
      columns: [
        { name: 'id', type: 'BIGINT UNSIGNED', nullable: false, key: 'PRI', defaultValue: null, extra: 'AUTO_INCREMENT' },
        { name: 'order_id', type: 'BIGINT UNSIGNED', nullable: false, key: 'MUL', defaultValue: null, extra: '' },
        { name: 'product_id', type: 'BIGINT UNSIGNED', nullable: false, key: 'MUL', defaultValue: null, extra: '' },
        { name: 'quantity', type: 'INT UNSIGNED', nullable: false, key: '', defaultValue: '1', extra: '' },
        { name: 'unit_price', type: 'DECIMAL(10,2)', nullable: false, key: '', defaultValue: null, extra: '' },
        { name: 'subtotal', type: 'DECIMAL(10,2)', nullable: false, key: '', defaultValue: null, extra: 'GENERATED' },
        { name: 'created_at', type: 'TIMESTAMP', nullable: false, key: '', defaultValue: 'CURRENT_TIMESTAMP', extra: '' },
      ],
      indexes: [
        { name: 'PRIMARY', columns: ['id'], type: 'BTREE', unique: true },
        { name: 'idx_order_id', columns: ['order_id'], type: 'BTREE', unique: false },
        { name: 'idx_product_id', columns: ['product_id'], type: 'BTREE', unique: false },
      ],
      sampleData: [
        { id: '1', order_id: '100001', product_id: '501', quantity: '2', unit_price: '49.99', subtotal: '99.98' },
        { id: '2', order_id: '100001', product_id: '502', quantity: '1', unit_price: '199.00', subtotal: '199.00' },
        { id: '3', order_id: '100002', product_id: '503', quantity: '3', unit_price: '25.50', subtotal: '76.50' },
        { id: '4', order_id: '100003', product_id: '504', quantity: '1', unit_price: '89.99', subtotal: '89.99' },
        { id: '5', order_id: '100004', product_id: '505', quantity: '5', unit_price: '49.00', subtotal: '245.00' },
      ],
    },
  },
  {
    name: 'products', rows: '456,000', size: '1.8 GB', engine: 'InnoDB', collation: 'utf8mb4_unicode_ci', lastModified: '3 hours ago',
    detail: {
      columns: [
        { name: 'id', type: 'BIGINT UNSIGNED', nullable: false, key: 'PRI', defaultValue: null, extra: 'AUTO_INCREMENT' },
        { name: 'sku', type: 'VARCHAR(50)', nullable: false, key: 'UNI', defaultValue: null, extra: '' },
        { name: 'name', type: 'VARCHAR(255)', nullable: false, key: '', defaultValue: null, extra: '' },
        { name: 'description', type: 'TEXT', nullable: true, key: '', defaultValue: null, extra: '' },
        { name: 'price', type: 'DECIMAL(10,2)', nullable: false, key: '', defaultValue: null, extra: '' },
        { name: 'stock', type: 'INT', nullable: false, key: '', defaultValue: '0', extra: '' },
        { name: 'category_id', type: 'INT UNSIGNED', nullable: true, key: 'MUL', defaultValue: null, extra: '' },
        { name: 'is_active', type: 'TINYINT(1)', nullable: false, key: '', defaultValue: '1', extra: '' },
        { name: 'created_at', type: 'TIMESTAMP', nullable: false, key: '', defaultValue: 'CURRENT_TIMESTAMP', extra: '' },
      ],
      indexes: [
        { name: 'PRIMARY', columns: ['id'], type: 'BTREE', unique: true },
        { name: 'uniq_sku', columns: ['sku'], type: 'BTREE', unique: true },
        { name: 'idx_category', columns: ['category_id'], type: 'BTREE', unique: false },
      ],
      sampleData: [
        { id: '501', sku: 'WID-PRO-001', name: 'Widget Pro', price: '49.99', stock: '340', is_active: '1' },
        { id: '502', sku: 'GAD-MAX-002', name: 'Gadget Max', price: '199.00', stock: '120', is_active: '1' },
        { id: '503', sku: 'ACC-MIN-003', name: 'Accessory Mini', price: '25.50', stock: '890', is_active: '1' },
        { id: '504', sku: 'TOO-PRM-004', name: 'Premium Tool', price: '89.99', stock: '45', is_active: '1' },
        { id: '505', sku: 'KIT-STD-005', name: 'Starter Kit', price: '49.00', stock: '210', is_active: '0' },
      ],
    },
  },
  {
    name: 'sessions', rows: '890,000', size: '3.2 GB', engine: 'MEMORY', collation: 'utf8mb4_unicode_ci', lastModified: '1 min ago',
    detail: {
      columns: [
        { name: 'id', type: 'CHAR(64)', nullable: false, key: 'PRI', defaultValue: null, extra: '' },
        { name: 'user_id', type: 'BIGINT UNSIGNED', nullable: true, key: '', defaultValue: null, extra: '' },
        { name: 'ip_address', type: 'VARCHAR(45)', nullable: true, key: '', defaultValue: null, extra: '' },
        { name: 'payload', type: 'TEXT', nullable: false, key: '', defaultValue: null, extra: '' },
        { name: 'expires_at', type: 'DATETIME', nullable: false, key: 'MUL', defaultValue: null, extra: '' },
      ],
      indexes: [
        { name: 'PRIMARY', columns: ['id'], type: 'HASH', unique: true },
        { name: 'idx_expires_at', columns: ['expires_at'], type: 'BTREE', unique: false },
      ],
      sampleData: [
        { id: 'a1b2c3d4…', user_id: '1', ip_address: '196.20.1.10', expires_at: '2026-09-17 14:00:00' },
        { id: 'e5f6g7h8…', user_id: '2', ip_address: '41.230.5.22', expires_at: '2026-09-17 13:45:00' },
        { id: 'i9j0k1l2…', user_id: 'null', ip_address: '197.15.8.3', expires_at: '2026-09-17 13:30:00' },
        { id: 'm3n4o5p6…', user_id: '4', ip_address: '196.20.1.50', expires_at: '2026-09-17 15:00:00' },
        { id: 'q7r8s9t0…', user_id: '5', ip_address: '41.230.5.99', expires_at: '2026-09-17 13:55:00' },
      ],
    },
  },
  {
    name: 'audit_logs', rows: '320,000,000', size: '112 GB', engine: 'InnoDB', collation: 'utf8mb4_unicode_ci', lastModified: '30 sec ago',
    detail: {
      columns: [
        { name: 'id', type: 'BIGINT UNSIGNED', nullable: false, key: 'PRI', defaultValue: null, extra: 'AUTO_INCREMENT' },
        { name: 'user_id', type: 'BIGINT UNSIGNED', nullable: true, key: 'MUL', defaultValue: null, extra: '' },
        { name: 'action', type: 'VARCHAR(100)', nullable: false, key: 'MUL', defaultValue: null, extra: '' },
        { name: 'entity_type', type: 'VARCHAR(50)', nullable: true, key: '', defaultValue: null, extra: '' },
        { name: 'entity_id', type: 'BIGINT UNSIGNED', nullable: true, key: '', defaultValue: null, extra: '' },
        { name: 'ip_address', type: 'VARCHAR(45)', nullable: true, key: '', defaultValue: null, extra: '' },
        { name: 'metadata', type: 'JSON', nullable: true, key: '', defaultValue: null, extra: '' },
        { name: 'created_at', type: 'TIMESTAMP', nullable: false, key: '', defaultValue: 'CURRENT_TIMESTAMP', extra: '' },
      ],
      indexes: [
        { name: 'PRIMARY', columns: ['id'], type: 'BTREE', unique: true },
        { name: 'idx_user_action', columns: ['user_id', 'action'], type: 'BTREE', unique: false },
        { name: 'idx_created_at', columns: ['created_at'], type: 'BTREE', unique: false },
      ],
      sampleData: [
        { id: '320000001', user_id: '1', action: 'login', entity_type: 'User', entity_id: '1', created_at: '2026-09-17 12:01:00' },
        { id: '320000002', user_id: '2', action: 'update', entity_type: 'Property', entity_id: '42', created_at: '2026-09-17 12:02:00' },
        { id: '320000003', user_id: '1', action: 'export', entity_type: 'Order', entity_id: 'null', created_at: '2026-09-17 12:03:00' },
        { id: '320000004', user_id: 'null', action: 'login_failed', entity_type: 'User', entity_id: 'null', created_at: '2026-09-17 12:04:00' },
        { id: '320000005', user_id: '3', action: 'delete', entity_type: 'Session', entity_id: '890', created_at: '2026-09-17 12:05:00' },
      ],
    },
  },
  {
    name: 'customer_reviews', rows: '2,100,000', size: '6.7 GB', engine: 'InnoDB', collation: 'utf8mb4_unicode_ci', lastModified: '2 hours ago',
    detail: {
      columns: [
        { name: 'id', type: 'BIGINT UNSIGNED', nullable: false, key: 'PRI', defaultValue: null, extra: 'AUTO_INCREMENT' },
        { name: 'product_id', type: 'BIGINT UNSIGNED', nullable: false, key: 'MUL', defaultValue: null, extra: '' },
        { name: 'user_id', type: 'BIGINT UNSIGNED', nullable: false, key: 'MUL', defaultValue: null, extra: '' },
        { name: 'rating', type: 'TINYINT UNSIGNED', nullable: false, key: '', defaultValue: null, extra: '' },
        { name: 'title', type: 'VARCHAR(200)', nullable: true, key: '', defaultValue: null, extra: '' },
        { name: 'body', type: 'TEXT', nullable: true, key: '', defaultValue: null, extra: '' },
        { name: 'verified', type: 'TINYINT(1)', nullable: false, key: '', defaultValue: '0', extra: '' },
        { name: 'created_at', type: 'TIMESTAMP', nullable: false, key: '', defaultValue: 'CURRENT_TIMESTAMP', extra: '' },
      ],
      indexes: [
        { name: 'PRIMARY', columns: ['id'], type: 'BTREE', unique: true },
        { name: 'idx_product', columns: ['product_id'], type: 'BTREE', unique: false },
        { name: 'idx_user', columns: ['user_id'], type: 'BTREE', unique: false },
        { name: 'idx_rating', columns: ['rating'], type: 'BTREE', unique: false },
      ],
      sampleData: [
        { id: '1', product_id: '501', user_id: '3', rating: '5', title: 'Excellent!', verified: '1', created_at: '2026-08-15 10:00:00' },
        { id: '2', product_id: '502', user_id: '5', rating: '4', title: 'Good value', verified: '1', created_at: '2026-08-20 14:30:00' },
        { id: '3', product_id: '503', user_id: '1', rating: '3', title: 'Decent', verified: '0', created_at: '2026-09-01 09:15:00' },
        { id: '4', product_id: '501', user_id: '4', rating: '5', title: 'Love it', verified: '1', created_at: '2026-09-05 16:45:00' },
        { id: '5', product_id: '504', user_id: '2', rating: '2', title: 'Disappointed', verified: '0', created_at: '2026-09-10 11:20:00' },
      ],
    },
  },
  {
    name: 'shipping_records', rows: '1,890,000', size: '4.1 GB', engine: 'InnoDB', collation: 'utf8mb4_unicode_ci', lastModified: '45 min ago',
    detail: {
      columns: [
        { name: 'id', type: 'BIGINT UNSIGNED', nullable: false, key: 'PRI', defaultValue: null, extra: 'AUTO_INCREMENT' },
        { name: 'order_id', type: 'BIGINT UNSIGNED', nullable: false, key: 'MUL', defaultValue: null, extra: '' },
        { name: 'carrier', type: 'VARCHAR(50)', nullable: false, key: '', defaultValue: null, extra: '' },
        { name: 'tracking_number', type: 'VARCHAR(50)', nullable: true, key: 'UNI', defaultValue: null, extra: '' },
        { name: 'status', type: "ENUM('pending','shipped','in_transit','delivered','returned')", nullable: false, key: '', defaultValue: 'pending', extra: '' },
        { name: 'shipped_at', type: 'DATETIME', nullable: true, key: '', defaultValue: null, extra: '' },
        { name: 'delivered_at', type: 'DATETIME', nullable: true, key: '', defaultValue: null, extra: '' },
        { name: 'created_at', type: 'TIMESTAMP', nullable: false, key: '', defaultValue: 'CURRENT_TIMESTAMP', extra: '' },
      ],
      indexes: [
        { name: 'PRIMARY', columns: ['id'], type: 'BTREE', unique: true },
        { name: 'idx_order_id', columns: ['order_id'], type: 'BTREE', unique: false },
        { name: 'uniq_tracking', columns: ['tracking_number'], type: 'BTREE', unique: true },
      ],
      sampleData: [
        { id: '1', order_id: '100001', carrier: 'DHL', tracking_number: 'DHL123456789', status: 'delivered', shipped_at: '2026-09-02 08:00:00' },
        { id: '2', order_id: '100002', carrier: 'Aramex', tracking_number: 'ARX987654321', status: 'in_transit', shipped_at: '2026-09-03 10:30:00' },
        { id: '3', order_id: '100003', carrier: 'Tunisie Poste', tracking_number: 'TN456789012', status: 'shipped', shipped_at: '2026-09-06 09:00:00' },
        { id: '4', order_id: '100004', carrier: 'DHL', tracking_number: 'null', status: 'pending', shipped_at: 'null' },
        { id: '5', order_id: '100005', carrier: 'Aramex', tracking_number: 'ARX111222333', status: 'returned', shipped_at: '2026-09-13 14:00:00' },
      ],
    },
  },
  {
    name: 'inventory', rows: '678,000', size: '2.9 GB', engine: 'InnoDB', collation: 'utf8mb4_unicode_ci', lastModified: '20 min ago',
    detail: {
      columns: [
        { name: 'id', type: 'BIGINT UNSIGNED', nullable: false, key: 'PRI', defaultValue: null, extra: 'AUTO_INCREMENT' },
        { name: 'product_id', type: 'BIGINT UNSIGNED', nullable: false, key: 'UNI', defaultValue: null, extra: '' },
        { name: 'warehouse', type: 'VARCHAR(50)', nullable: false, key: 'MUL', defaultValue: null, extra: '' },
        { name: 'quantity', type: 'INT', nullable: false, key: '', defaultValue: '0', extra: '' },
        { name: 'reserved', type: 'INT', nullable: false, key: '', defaultValue: '0', extra: '' },
        { name: 'reorder_threshold', type: 'INT', nullable: false, key: '', defaultValue: '10', extra: '' },
        { name: 'updated_at', type: 'TIMESTAMP', nullable: false, key: '', defaultValue: 'CURRENT_TIMESTAMP', extra: 'ON UPDATE CURRENT_TIMESTAMP' },
      ],
      indexes: [
        { name: 'PRIMARY', columns: ['id'], type: 'BTREE', unique: true },
        { name: 'uniq_product', columns: ['product_id'], type: 'BTREE', unique: true },
        { name: 'idx_warehouse', columns: ['warehouse'], type: 'BTREE', unique: false },
      ],
      sampleData: [
        { id: '1', product_id: '501', warehouse: 'Tunis-Nord', quantity: '340', reserved: '12', reorder_threshold: '50' },
        { id: '2', product_id: '502', warehouse: 'Tunis-Sud', quantity: '120', reserved: '5', reorder_threshold: '30' },
        { id: '3', product_id: '503', warehouse: 'Sousse', quantity: '890', reserved: '0', reorder_threshold: '100' },
        { id: '4', product_id: '504', warehouse: 'Tunis-Nord', quantity: '45', reserved: '8', reorder_threshold: '20' },
        { id: '5', product_id: '505', warehouse: 'Sfax', quantity: '210', reserved: '0', reorder_threshold: '50' },
      ],
    },
  },
  {
    name: 'api_keys', rows: '3,200', size: '12 MB', engine: 'InnoDB', collation: 'utf8mb4_unicode_ci', lastModified: '5 days ago',
    detail: {
      columns: [
        { name: 'id', type: 'BIGINT UNSIGNED', nullable: false, key: 'PRI', defaultValue: null, extra: 'AUTO_INCREMENT' },
        { name: 'user_id', type: 'BIGINT UNSIGNED', nullable: false, key: 'MUL', defaultValue: null, extra: '' },
        { name: 'key_hash', type: 'VARCHAR(255)', nullable: false, key: 'UNI', defaultValue: null, extra: '' },
        { name: 'name', type: 'VARCHAR(100)', nullable: false, key: '', defaultValue: null, extra: '' },
        { name: 'scopes', type: 'JSON', nullable: true, key: '', defaultValue: null, extra: '' },
        { name: 'last_used', type: 'DATETIME', nullable: true, key: '', defaultValue: null, extra: '' },
        { name: 'expires_at', type: 'DATETIME', nullable: true, key: '', defaultValue: null, extra: '' },
        { name: 'created_at', type: 'TIMESTAMP', nullable: false, key: '', defaultValue: 'CURRENT_TIMESTAMP', extra: '' },
      ],
      indexes: [
        { name: 'PRIMARY', columns: ['id'], type: 'BTREE', unique: true },
        { name: 'uniq_key_hash', columns: ['key_hash'], type: 'BTREE', unique: true },
        { name: 'idx_user_id', columns: ['user_id'], type: 'BTREE', unique: false },
      ],
      sampleData: [
        { id: '1', user_id: '1', name: 'Production API', key_hash: 'sha256:a1b2…', last_used: '2026-09-17 11:50:00', expires_at: '2027-01-01 00:00:00' },
        { id: '2', user_id: '2', name: 'Dev Testing', key_hash: 'sha256:c3d4…', last_used: '2026-09-16 18:30:00', expires_at: '2026-12-31 00:00:00' },
        { id: '3', user_id: '1', name: 'Mobile App', key_hash: 'sha256:e5f6…', last_used: '2026-09-17 12:00:00', expires_at: 'null' },
        { id: '4', user_id: '3', name: 'Webhook', key_hash: 'sha256:g7h8…', last_used: '2026-09-15 09:15:00', expires_at: '2027-06-01 00:00:00' },
        { id: '5', user_id: '4', name: 'Analytics', key_hash: 'sha256:i9j0…', last_used: 'null', expires_at: '2026-10-01 00:00:00' },
      ],
    },
  },
];

/* ---- Query history ---- */
export const queryHistory: QueryRecord[] = [
  ...recentQueries,
  { id: 'q5', query: 'SELECT u.name, COUNT(o.id) FROM users u JOIN orders o ON u.id=o.user_id GROUP BY u.name;', database: 'ecommerce_prod', duration: 156, rows: 1240, status: 'success', timestamp: '34 min ago', user: 'marwan.k' },
  { id: 'q6', query: 'CREATE INDEX idx_status ON properties(status);', database: 'immobilier_tn', duration: 2100, rows: 0, status: 'slow', timestamp: '1 hour ago', user: 'dba_team' },
  { id: 'q7', query: 'SELECT * FROM visits WHERE created_at > NOW() - INTERVAL 1 DAY;', database: 'analytics', duration: 89, rows: 456000, status: 'success', timestamp: '1 hour ago', user: 'sarah.c' },
  { id: 'q8', query: 'ALTER TABLE orders ADD COLUMN tax_amount DECIMAL(10,2);', database: 'ecommerce_prod', duration: 3400, rows: 0, status: 'slow', timestamp: '2 hours ago', user: 'admin' },
  { id: 'q9', query: 'SELECT email FROM users WHERE created_at > "2026-01-01";', database: 'ecommerce_prod', duration: 23, rows: 8900, status: 'success', timestamp: '2 hours ago', user: 'sarah.c' },
  { id: 'q10', query: 'DELETE FROM sessions WHERE expires_at < NOW();', database: 'sessions', duration: 4, rows: 12000, status: 'success', timestamp: '3 hours ago', user: 'system' },
  { id: 'q11', query: 'SELECT COUNT(*) FROM audit_logs WHERE action="login";', database: 'logging_db', duration: 670, rows: 1, status: 'slow', timestamp: '3 hours ago', user: 'dba_team' },
  { id: 'q12', query: 'INSERT INTO products (name, price) VALUES ("Widget Pro", 29.99);', database: 'ecommerce_prod', duration: 3, rows: 1, status: 'success', timestamp: '4 hours ago', user: 'marwan.k' },
  { id: 'q13', query: 'SELECT * FROM non_existent_table;', database: 'analytics', duration: 2, rows: 0, status: 'error', timestamp: '5 hours ago', user: 'guest' },
  { id: 'q14', query: 'VACUUM ANALYZE audit_logs;', database: 'logging_db', duration: 5600, rows: 0, status: 'slow', timestamp: '6 hours ago', user: 'dba_team' },
  { id: 'q15', query: 'SELECT status, COUNT(*) FROM properties GROUP BY status;', database: 'immobilier_tn', duration: 45, rows: 5, status: 'success', timestamp: '6 hours ago', user: 'sarah.c' },
  { id: 'q16', query: 'UPDATE users SET last_login=NOW() WHERE id=42;', database: 'ecommerce_prod', duration: 1, rows: 1, status: 'success', timestamp: '7 hours ago', user: 'system' },
];

/* ---- Users ---- */
export const users: UserRecord[] = [
  { id: 'u1', name: 'Sarah Chen', email: 'sarah.c@dbhub.io', role: 'Admin', status: 'Active', lastActive: '2 min ago', avatarColor: '#2563eb', initials: 'SC' },
  { id: 'u2', name: 'Marwan Khelifi', email: 'marwan.k@dbhub.io', role: 'Developer', status: 'Active', lastActive: '5 min ago', avatarColor: '#059669', initials: 'MK' },
  { id: 'u3', name: 'Alex Rivera', email: 'alex.r@dbhub.io', role: 'DBA', status: 'Active', lastActive: '1 hour ago', avatarColor: '#d97706', initials: 'AR' },
  { id: 'u4', name: 'Priya Patel', email: 'priya.p@dbhub.io', role: 'Developer', status: 'Active', lastActive: '20 min ago', avatarColor: '#7c3aed', initials: 'PP' },
  { id: 'u5', name: 'Tom Walker', email: 'tom.w@dbhub.io', role: 'Read-Only', status: 'Active', lastActive: '3 hours ago', avatarColor: '#0891b2', initials: 'TW' },
  { id: 'u6', name: 'Yuki Tanaka', email: 'yuki.t@dbhub.io', role: 'Developer', status: 'Invited', lastActive: '—', avatarColor: '#e11d48', initials: 'YT' },
  { id: 'u7', name: 'Omar Ben Salah', email: 'omar.b@dbhub.io', role: 'Read-Only', status: 'Active', lastActive: '1 day ago', avatarColor: '#475569', initials: 'OB' },
  { id: 'u8', name: 'Emma Wilson', email: 'emma.w@dbhub.io', role: 'Admin', status: 'Suspended', lastActive: '5 days ago', avatarColor: '#64748b', initials: 'EW' },
  { id: 'u9', name: 'Karim Mansour', email: 'karim.m@dbhub.io', role: 'DBA', status: 'Active', lastActive: '15 min ago', avatarColor: '#0d9488', initials: 'KM' },
  { id: 'u10', name: 'Lisa Zhang', email: 'lisa.z@dbhub.io', role: 'Developer', status: 'Active', lastActive: '45 min ago', avatarColor: '#9333ea', initials: 'LZ' },
];

export const permissionsMatrix = [
  { resource: 'ecommerce_prod', admin: 'Full', dba: 'Full', developer: 'Read/Write', readonly: 'Read' },
  { resource: 'crm_system', admin: 'Full', dba: 'Full', developer: 'Read/Write', readonly: 'Read' },
  { resource: 'immobilier_tn', admin: 'Full', dba: 'Full', developer: 'Read/Write', readonly: 'Read' },
  { resource: 'analytics', admin: 'Full', dba: 'Full', developer: 'Read', readonly: 'Read' },
  { resource: 'backup_archive', admin: 'Full', dba: 'Full', developer: 'None', readonly: 'None' },
  { resource: 'data_warehouse', admin: 'Full', dba: 'Full', developer: 'Read', readonly: 'Read' },
];

/* ---- Backups ---- */
export const backups: BackupRecord[] = [
  { id: 'b1', database: 'ecommerce_prod', type: 'Full', size: '18.2 GB', status: 'Completed', timestamp: 'Today, 03:00', duration: '12m 34s', driveId: 'cd1' },
  { id: 'b2', database: 'analytics', type: 'Incremental', size: '4.3 GB', status: 'Completed', timestamp: 'Today, 03:15', duration: '4m 12s', driveId: 'cd2' },
  { id: 'b3', database: 'immobilier_tn', type: 'Full', size: '24.1 GB', status: 'Completed', timestamp: 'Today, 03:30', duration: '15m 02s', driveId: 'cd1' },
  { id: 'b4', database: 'crm_system', type: 'Snapshot', size: '9.5 GB', status: 'In Progress', timestamp: 'Now', duration: '—', driveId: 'cd1' },
  { id: 'b5', database: 'data_warehouse', type: 'Full', size: '142 GB', status: 'Scheduled', timestamp: 'Tomorrow, 03:00', duration: '—', driveId: 'cd2' },
  { id: 'b6', database: 'logging_db', type: 'Incremental', size: '1.2 GB', status: 'Completed', timestamp: 'Yesterday, 03:00', duration: '2m 48s', driveId: 'cd1' },
  { id: 'b7', database: 'payments', type: 'Full', size: '6.7 GB', status: 'Completed', timestamp: 'Yesterday, 03:00', duration: '5m 20s', driveId: 'cd2' },
  { id: 'b8', database: 'messaging', type: 'Snapshot', size: '7.9 GB', status: 'Failed', timestamp: 'Yesterday, 03:30', duration: '0m 45s' },
  { id: 'b9', database: 'staging_ecom', type: 'Full', size: '18.0 GB', status: 'Scheduled', timestamp: 'Sep 19, 03:00', duration: '—', driveId: 'cd1' },
  { id: 'b10', database: 'user_profiles', type: 'Incremental', size: '0.8 GB', status: 'Completed', timestamp: 'Sep 16, 03:00', duration: '1m 15s', driveId: 'cd1' },
];

export type CloudProvider = 'google-drive' | 'dropbox' | 'aws-s3' | 'onedrive' | 'backblaze';

export interface CloudDrive {
  id: string;
  provider: CloudProvider;
  label: string;
  email: string;
  connected: boolean;
  storageUsed: number; // GB
  storageTotal: number; // GB
  folder: string;
  lastSync: string;
}

export const cloudProviders: { id: CloudProvider; name: string; color: string; bg: string; initials: string }[] = [
  { id: 'google-drive', name: 'Google Drive', color: '#1a73e8', bg: 'bg-blue-50', initials: 'G' },
  { id: 'dropbox', name: 'Dropbox', color: '#0061ff', bg: 'bg-blue-50', initials: 'D' },
  { id: 'aws-s3', name: 'Amazon S3', color: '#ff9900', bg: 'bg-amber-50', initials: 'S3' },
  { id: 'onedrive', name: 'OneDrive', color: '#0078d4', bg: 'bg-cyan-50', initials: 'O' },
  { id: 'backblaze', name: 'Backblaze B2', color: '#e21d3c', bg: 'bg-rose-50', initials: 'B2' },
];

export const connectedDrives: CloudDrive[] = [
  { id: 'cd1', provider: 'google-drive', label: 'Google Drive — Main', email: 'sarah.c@dbhub.io', connected: true, storageUsed: 142, storageTotal: 2000, folder: '/DBHub/Backups', lastSync: '5 min ago' },
  { id: 'cd2', provider: 'aws-s3', label: 'AWS S3 — dbhub-backups', email: 'admin@dbhub.io', connected: true, storageUsed: 480, storageTotal: 5000, folder: 's3://dbhub-backups/daily', lastSync: '2 min ago' },
  { id: 'cd3', provider: 'dropbox', label: 'Dropbox — Team', email: 'team@dbhub.io', connected: false, storageUsed: 0, storageTotal: 2000, folder: '/DBHub', lastSync: '—' },
];

/* Retention unit options */
export type RetentionUnit = 'days' | 'backups';
export type BackupFrequency = 'daily' | 'every-2-days' | 'weekly' | 'custom';

export interface BackupScheduleConfig {
  id: string;
  database: string;
  driveId: string;
  frequency: BackupFrequency;
  cronExpression: string;
  time: string; // HH:MM
  timezone: string;
  retentionCount: number; // keep N backups
  retentionUnit: RetentionUnit;
  enabled: boolean;
  lastRun: string;
  nextRun: string;
  backupsKept: number;
}

export const backupSchedules: BackupScheduleConfig[] = [
  { id: 'bs1', database: 'ecommerce_prod', driveId: 'cd1', frequency: 'daily', cronExpression: '0 3 * * *', time: '03:00', timezone: 'UTC', retentionCount: 2, retentionUnit: 'backups', enabled: true, lastRun: 'Today, 03:00', nextRun: 'Tomorrow, 03:00', backupsKept: 2 },
  { id: 'bs2', database: 'analytics', driveId: 'cd2', frequency: 'every-2-days', cronExpression: '0 3 */2 * *', time: '03:00', timezone: 'UTC', retentionCount: 2, retentionUnit: 'backups', enabled: true, lastRun: 'Today, 03:15', nextRun: 'Sep 19, 03:00', backupsKept: 2 },
  { id: 'bs3', database: 'immobilier_tn', driveId: 'cd1', frequency: 'daily', cronExpression: '0 3 * * *', time: '03:30', timezone: 'UTC', retentionCount: 3, retentionUnit: 'backups', enabled: true, lastRun: 'Today, 03:30', nextRun: 'Tomorrow, 03:30', backupsKept: 3 },
  { id: 'bs4', database: 'data_warehouse', driveId: 'cd2', frequency: 'weekly', cronExpression: '0 3 * * 0', time: '03:00', timezone: 'UTC', retentionCount: 4, retentionUnit: 'backups', enabled: true, lastRun: 'Sep 15, 03:00', nextRun: 'Sep 22, 03:00', backupsKept: 4 },
  { id: 'bs5', database: 'logging_db', driveId: 'cd1', frequency: 'every-2-days', cronExpression: '0 3 */2 * *', time: '03:00', timezone: 'UTC', retentionCount: 1, retentionUnit: 'backups', enabled: true, lastRun: 'Today, 03:00', nextRun: 'Sep 19, 03:00', backupsKept: 1 },
  { id: 'bs6', database: 'staging_ecom', driveId: 'cd1', frequency: 'weekly', cronExpression: '0 3 * * 0', time: '03:00', timezone: 'UTC', retentionCount: 2, retentionUnit: 'backups', enabled: false, lastRun: '—', nextRun: '—', backupsKept: 0 },
];

/* ---- Import / Export jobs ---- */
export const importExportJobs = [
  { id: 'ie1', type: 'Import', filename: 'products_batch_0917.csv', database: 'ecommerce_prod', format: 'CSV', size: '45.2 MB', status: 'Completed', progress: 100, timestamp: '10 min ago' },
  { id: 'ie2', type: 'Export', filename: 'orders_2026_q3.sql', database: 'ecommerce_prod', format: 'SQL', size: '1.8 GB', status: 'In Progress', progress: 67, timestamp: 'Now' },
  { id: 'ie3', type: 'Import', filename: 'crm_contacts.json', database: 'crm_system', format: 'JSON', size: '12.4 MB', status: 'Completed', progress: 100, timestamp: '1 hour ago' },
  { id: 'ie4', type: 'Export', filename: 'analytics_dump.parquet', database: 'analytics', format: 'Parquet', size: '8.2 GB', status: 'Completed', progress: 100, timestamp: '3 hours ago' },
  { id: 'ie5', type: 'Import', filename: 'properties_batch.csv', database: 'immobilier_tn', format: 'CSV', size: '78.3 MB', status: 'Failed', progress: 34, timestamp: '5 hours ago' },
  { id: 'ie6', type: 'Export', filename: 'users_backup.json', database: 'ecommerce_prod', format: 'JSON', size: '56 MB', status: 'Completed', progress: 100, timestamp: '6 hours ago' },
];

/* ---- SQL editor sample history ---- */
export const editorHistory = [
  { id: 'h1', query: 'SELECT * FROM users LIMIT 100;', time: '12:04:33', duration: '12ms', rows: 100, ok: true },
  { id: 'h2', query: "UPDATE properties SET status='published' WHERE id > 1000;", time: '12:02:18', duration: '340ms', rows: 48, ok: true },
  { id: 'h3', query: 'SELECT COUNT(*) FROM orders WHERE status="shipped";', time: '11:58:02', duration: '8ms', rows: 1, ok: true },
  { id: 'h4', query: 'SELECT name, email FROM users WHERE role="admin";', time: '11:45:50', duration: '5ms', rows: 4, ok: true },
  { id: 'h5', query: 'EXPLAIN SELECT * FROM visits WHERE visitor_id=42;', time: '11:40:12', duration: '2ms', rows: 3, ok: true },
];

/* ---- Monitoring: active connections detail ---- */
export const activeConnections = [
  { id: 1, user: 'sarah.c', database: 'ecommerce_prod', client: 'psql 16.2', state: 'active', query: 'SELECT * FROM orders WHERE...', duration: '2s', idle: false },
  { id: 2, user: 'marwan.k', database: 'immobilier_tn', client: 'MySQL CLI 8.4', state: 'active', query: 'UPDATE properties SET...', duration: '12s', idle: false },
  { id: 3, user: 'admin', database: 'analytics', client: 'pgAdmin 8', state: 'idle', query: '—', duration: '—', idle: true },
  { id: 4, user: 'dba_team', database: 'logging_db', client: 'DBeaver 24', state: 'active', query: 'VACUUM ANALYZE...', duration: '45s', idle: false },
  { id: 5, user: 'priya.p', database: 'payments', client: 'psql 16.2', state: 'idle', query: '—', duration: '—', idle: true },
  { id: 6, user: 'system', database: 'sessions', client: 'app-pool', state: 'active', query: 'DELETE FROM sessions...', duration: '<1s', idle: false },
  { id: 7, user: 'karim.m', database: 'data_warehouse', client: 'DBeaver 24', state: 'active', query: 'SELECT * FROM sales...', duration: '8s', idle: false },
  { id: 8, user: 'lisa.z', database: 'messaging', client: 'MySQL CLI 8.4', state: 'idle', query: '—', duration: '—', idle: true },
];

export const queryPerformance = [
  { query: 'SELECT * FROM visits WHERE...', avgMs: 1240, calls: 45200, impact: 'high' },
  { query: 'VACUUM ANALYZE audit_logs', avgMs: 5600, calls: 12, impact: 'high' },
  { query: 'SELECT COUNT(*) FROM orders', avgMs: 8, calls: 89400, impact: 'low' },
  { query: 'UPDATE properties SET status...', avgMs: 340, calls: 1200, impact: 'medium' },
  { query: 'SELECT * FROM users LIMIT 100', avgMs: 12, calls: 156000, impact: 'low' },
];
