const mongoose = require('mongoose');
require('dotenv').config();

async function test() {
  await mongoose.connect(process.env.MONGODB_URI);
  const Document = mongoose.model('Document', new mongoose.Schema({ clerkUserId: String, originalFilename: String }, { strict: false }), 'documents');
  
  const search = 'xyz';
  const query = { originalFilename: { $regex: search.trim(), $options: 'i' } };
  
  console.log('Query:', query);
  const docs = await Document.find(query);
  console.log('Found:', docs.length);
  process.exit(0);
}
test();
