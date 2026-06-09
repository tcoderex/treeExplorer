const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const userDataPath = path.join(process.env.APPDATA, 'win11-family-tree');
const dbPath = path.join(userDataPath, 'family_tree.db');
const backupPath = path.join(userDataPath, `family_tree_backup_${Date.now()}.db`);

if (!fs.existsSync(dbPath)) {
  console.log("No existing database found.");
  process.exit(0);
}

// Backup
fs.copyFileSync(dbPath, backupPath);
console.log(`Backup created at ${backupPath}`);

  const db = new Database(dbPath);

  // Read old people
  let oldPeople = [];
  try {
    oldPeople = db.prepare('SELECT * FROM people').all();
    // Check if it's already migrated
    try {
      db.prepare('SELECT firstName FROM people LIMIT 1').get();
      console.log("Database already migrated.");
      process.exit(0);
    } catch (e) {
      // expected error
    }
  } catch(e) {
    console.error("Failed to read old people table.", e);
    process.exit(1);
  }

  db.exec('BEGIN TRANSACTION;');

  try {
    // Rename old table so we can safely copy data
    db.exec('ALTER TABLE people RENAME TO people_old;');

    // Create new tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS people (
        id TEXT PRIMARY KEY,
        firstName TEXT NOT NULL,
        familyName TEXT,
        gender TEXT,
        photo TEXT,
        notes TEXT
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS relationships (
        id TEXT PRIMARY KEY,
        person1Id TEXT NOT NULL,
        person2Id TEXT NOT NULL,
        type TEXT NOT NULL,
        metadata TEXT
      );
    `);

    const insertPerson = db.prepare(`INSERT INTO people (id, firstName, familyName, gender, photo, notes) VALUES (?, ?, ?, ?, ?, ?)`);
    const insertRelation = db.prepare(`INSERT INTO relationships (id, person1Id, person2Id, type, metadata) VALUES (?, ?, ?, ?, ?)`);

    const generateId = () => Math.random().toString(36).substring(2, 11);
    const addedRels = new Set();
    const addRel = (p1, p2, type) => {
      if(!p1 || !p2) return;
      const key = p1 < p2 ? `${p1}-${p2}-${type}` : `${p2}-${p1}-${type}`;
      if(type === 'parent-child') {
        const dirKey = `${p1}-${p2}-${type}`;
        if(!addedRels.has(dirKey)) {
          insertRelation.run(generateId(), p1, p2, type, '{}');
          addedRels.add(dirKey);
        }
      } else {
        if(!addedRels.has(key)) {
          const min = p1 < p2 ? p1 : p2;
          const max = p1 < p2 ? p2 : p1;
          insertRelation.run(generateId(), min, max, type, '{}');
          addedRels.add(key);
        }
      }
    };

    for (const p of oldPeople) {
      const name = p.name || '';
      const parts = name.trim().split(' ');
      let firstName = name;
      let familyName = '';
      if (parts.length > 1) {
        familyName = parts.pop();
        firstName = parts.join(' ');
      }

      insertPerson.run(p.id, firstName, familyName, p.gender || '', p.photo || '', p.notes || '');

      if (p.fatherId) addRel(p.fatherId, p.id, 'parent-child');
      if (p.motherId) addRel(p.motherId, p.id, 'parent-child');

      if (p.spouses) {
        try {
          const sps = JSON.parse(p.spouses);
          for (const s of sps) addRel(p.id, s, 'spouse');
        } catch(e) {}
      }

      if (p.siblings) {
        try {
          const sibs = JSON.parse(p.siblings);
          for (const s of sibs) addRel(p.id, s, 'sibling');
        } catch(e) {}
      }

      if (p.customRelations) {
        try {
          const crs = JSON.parse(p.customRelations);
          for (const [rid, type] of Object.entries(crs)) {
            insertRelation.run(generateId(), p.id, rid, 'custom', JSON.stringify({ subtype: type }));
          }
        } catch(e) {}
      }
    }

    db.exec('DROP TABLE people_old;');
    db.exec('COMMIT;');
    console.log("Migration successful.");
  } catch (err) {
    db.exec('ROLLBACK;');
    console.error("Migration failed, rolling back.", err);
  }

  process.exit(0);
