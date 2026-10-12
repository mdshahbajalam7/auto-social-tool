import mongoose from 'mongoose';

const mediaSchema = new mongoose.Schema({
    filename: { type: String, default: 'image.jpg' },
    contentType: { type: String, default: 'image/jpeg' },
    data: { type: Buffer, required: true },
    size: { type: Number, default: 0 }
}, {
    timestamps: true
});

export const Media = mongoose.models.Media || mongoose.model('Media', mediaSchema);
