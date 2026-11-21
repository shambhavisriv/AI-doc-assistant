const mongoose = require('mongoose');

const passageSchema = new mongoose.Schema(
  {
    text: { type: String, required: true },
    page: { type: Number, default: null },
    index: { type: Number, required: true },
  },
  { _id: false }
);

const documentSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 240 },
    extension: { type: String, required: true, lowercase: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    passages: { type: [passageSchema], default: [] },
    originalFile: { type: Buffer, required: true, select: false },
  },
  { timestamps: true, collection: 'documents' }
);

documentSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Document', documentSchema);
