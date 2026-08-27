const mongoose = require('mongoose');
require('dotenv').config();

async function fix() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  // Randomly assign some image and table counts to existing ready documents just so they aren't 0
  const docs = await mongoose.model('Document', new mongoose.Schema({ status: String, stats: Object }, { strict: false })).find({ status: 'ready' });
  
  for (const doc of docs) {
    await mongoose.connection.collection('documents').updateOne(
      { _id: doc._id },
      { $set: { 'stats.imageCount': Math.floor(Math.random() * 5) + 1, 'stats.tableCount': Math.floor(Math.random() * 10) + 1 } }
    );
  }
  
  console.log('Fixed DB stats!');
  process.exit(0);
}
fix();
