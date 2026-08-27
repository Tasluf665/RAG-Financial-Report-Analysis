const mongoose = require('mongoose');
require('dotenv').config();
mongoose.connect(process.env.MONGODB_URI);
const docSchema = new mongoose.Schema({ status: String, failure: Object }, { strict: false });
const Document = mongoose.model('Document', docSchema);
Document.findOne({ status: 'failed' }).then(d => { console.log(JSON.stringify(d, null, 2)); process.exit(0); });
