const { AppDataSource } = require('./dist/database.js');
AppDataSource.initialize()
  .then(() => AppDataSource.query('SELECT id, "isStaff" FROM "user" LIMIT 5'))
  .then(r => { console.log(JSON.stringify(r)); AppDataSource.destroy(); })
  .catch(e => { console.error(e.message); process.exit(1); });
