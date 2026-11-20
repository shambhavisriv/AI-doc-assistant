const mongoose = require('mongoose');

const sourceSchema = new mongoose.Schema(
  {
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document' },
    name: { type: String, required: true },
    page: { type: Number, default: null },
    excerpt: { type: String, required: true },
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true, maxlength: 24000 },
    sources: { type: [sourceSchema], default: [] },
    usedDocumentContext: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const conversationSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 100 },
    documentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Document' }],
    messages: { type: [messageSchema], default: [] },
  },
  { timestamps: true, collection: 'conversations' }
);

conversationSchema.index({ updatedAt: -1 });

module.exports = mongoose.model('Conversation', conversationSchema);
