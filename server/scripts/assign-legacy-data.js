const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const User = require('../models/User');
const Document = require('../models/Document');
const Conversation = require('../models/Conversation');

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    throw new Error('Usage: node scripts/assign-legacy-data.js account@example.com');
  }

  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ai-doc-assistant';
  await mongoose.connect(mongoUri, { dbName: process.env.MONGODB_DB || 'ai-doc-assistant' });
  const user = await User.findOne({ email }).select('_id email');
  if (!user) throw new Error(`No account exists for ${email}. Create the account before migrating legacy data.`);

  const [documents, conversations] = await Promise.all([
    Document.updateMany({ ownerId: { $exists: false } }, { $set: { ownerId: user._id } }),
    Conversation.updateMany({ ownerId: { $exists: false } }, { $set: { ownerId: user._id } }),
  ]);

  console.log(`Assigned ${documents.modifiedCount} documents and ${conversations.modifiedCount} conversations to ${email}.`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
  });
