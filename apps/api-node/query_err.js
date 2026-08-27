const mongoose = require('mongoose');
mongoose.connect('mongodb+srv://tasluf1512089_db_user:GnIWtTCkSsQAR9ae@cluster0.8po9szx.mongodb.net/');
const docSchema = new mongoose.Schema({ status: String, failure: Object }, { strict: false });
const Document = mongoose.model('Document', docSchema);
Document.findOne({ status: 'failed' }).then(d => { console.log(JSON.stringify(d, null, 2)); process.exit(0); });
