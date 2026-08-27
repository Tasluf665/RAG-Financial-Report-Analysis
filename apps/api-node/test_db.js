const mongoose = require('mongoose');
const { User } = require('./src/modules/users/user.model');
require('dotenv').config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const users = await User.find({});
  console.log("Users:", JSON.stringify(users, null, 2));
  process.exit(0);
}
run();
