/**
 * Backup script for Choppy Wood game files
 *
 * Usage:
 *   node scripts/backup.js           - Create a new backup
 *   node scripts/backup.js list      - List all backups
 *   node scripts/backup.js restore   - Restore from latest backup
 *   node scripts/backup.js restore <timestamp>  - Restore specific backup
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const BACKUP_DIR = path.join(PROJECT_ROOT, 'backups');

// Files to backup
const FILES_TO_BACKUP = [
  'src/game/scenes/GameScene.js',
  'src/game/PhaserGame.jsx',
  'src/App.jsx',
  'index.html',
  'vite.config.js',
  'capacitor.config.json'
];

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    console.log('Created backups directory');
  }
}

function getTimestamp() {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function createBackup() {
  ensureBackupDir();

  const timestamp = getTimestamp();
  const backupSubDir = path.join(BACKUP_DIR, timestamp);

  fs.mkdirSync(backupSubDir, { recursive: true });

  let backedUp = 0;

  for (const file of FILES_TO_BACKUP) {
    const srcPath = path.join(PROJECT_ROOT, file);
    if (fs.existsSync(srcPath)) {
      const destDir = path.join(backupSubDir, path.dirname(file));
      fs.mkdirSync(destDir, { recursive: true });

      const destPath = path.join(backupSubDir, file);
      fs.copyFileSync(srcPath, destPath);
      backedUp++;
      console.log(`  Backed up: ${file}`);
    }
  }

  // Create metadata file
  const metadata = {
    timestamp: new Date().toISOString(),
    files: FILES_TO_BACKUP.filter(f => fs.existsSync(path.join(PROJECT_ROOT, f))),
    version: require(path.join(PROJECT_ROOT, 'package.json')).version || '0.0.0'
  };

  fs.writeFileSync(
    path.join(backupSubDir, 'backup-info.json'),
    JSON.stringify(metadata, null, 2)
  );

  console.log(`\nBackup created: ${timestamp}`);
  console.log(`Files backed up: ${backedUp}`);
  console.log(`Location: ${backupSubDir}`);

  // Clean old backups (keep last 10)
  cleanOldBackups(10);

  return timestamp;
}

function listBackups() {
  ensureBackupDir();

  const backups = fs.readdirSync(BACKUP_DIR)
    .filter(f => fs.statSync(path.join(BACKUP_DIR, f)).isDirectory())
    .sort()
    .reverse();

  if (backups.length === 0) {
    console.log('No backups found');
    return [];
  }

  console.log('Available backups:\n');

  for (const backup of backups) {
    const infoPath = path.join(BACKUP_DIR, backup, 'backup-info.json');
    let info = { files: [] };

    if (fs.existsSync(infoPath)) {
      info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
    }

    console.log(`  ${backup}`);
    console.log(`    Files: ${info.files?.length || '?'}`);
    console.log('');
  }

  return backups;
}

function restoreBackup(timestamp) {
  ensureBackupDir();

  let backupDir;

  if (!timestamp) {
    // Get latest backup
    const backups = fs.readdirSync(BACKUP_DIR)
      .filter(f => fs.statSync(path.join(BACKUP_DIR, f)).isDirectory())
      .sort()
      .reverse();

    if (backups.length === 0) {
      console.error('No backups found');
      process.exit(1);
    }

    timestamp = backups[0];
  }

  backupDir = path.join(BACKUP_DIR, timestamp);

  if (!fs.existsSync(backupDir)) {
    console.error(`Backup not found: ${timestamp}`);
    process.exit(1);
  }

  console.log(`Restoring from backup: ${timestamp}\n`);

  // First, create a backup of current state
  console.log('Creating backup of current state before restore...');
  const currentBackup = createBackup();
  console.log(`Current state backed up as: ${currentBackup}\n`);

  // Now restore
  let restored = 0;

  for (const file of FILES_TO_BACKUP) {
    const srcPath = path.join(backupDir, file);
    const destPath = path.join(PROJECT_ROOT, file);

    if (fs.existsSync(srcPath)) {
      // Ensure destination directory exists
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(srcPath, destPath);
      restored++;
      console.log(`  Restored: ${file}`);
    }
  }

  console.log(`\nRestore complete: ${restored} files restored`);
}

function cleanOldBackups(keepCount) {
  const backups = fs.readdirSync(BACKUP_DIR)
    .filter(f => fs.statSync(path.join(BACKUP_DIR, f)).isDirectory())
    .sort()
    .reverse();

  if (backups.length > keepCount) {
    const toDelete = backups.slice(keepCount);

    for (const backup of toDelete) {
      const backupPath = path.join(BACKUP_DIR, backup);
      fs.rmSync(backupPath, { recursive: true });
      console.log(`  Cleaned old backup: ${backup}`);
    }
  }
}

// CLI handling
const command = process.argv[2];
const arg = process.argv[3];

switch (command) {
  case 'list':
    listBackups();
    break;
  case 'restore':
    restoreBackup(arg);
    break;
  default:
    createBackup();
}
