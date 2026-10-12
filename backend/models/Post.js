import mongoose from 'mongoose';

const PostSchema = new mongoose.Schema(
    {
        niche: {
            type: String,
            required: true,
            trim: true
        },
        research: {
            topic: { type: String, required: true },
            summary: { type: String },
            sourceUrl: { type: String }
        },
        content: {
            twitter: { type: String },
            linkedin: { type: String },
            instagramCaption: { type: String },
            facebook: { type: String },
            imagePrompt: { type: String }
        },
        imageUrl: {
            type: String,
            required: true
        },
        platforms: {
            type: [String],
            default: ['twitter', 'linkedin']
        },
        status: {
            type: String,
            enum: ['draft', 'ready', 'scheduled', 'published', 'failed'],
            default: 'ready'
        },
        publishResult: {
            type: mongoose.Schema.Types.Mixed
        },
        metrics: {
            impressions: { type: Number, default: 0 },
            likes: { type: Number, default: 0 },
            shares: { type: Number, default: 0 }
        }
    },
    {
        timestamps: true // Automatically adds createdAt and updatedAt
    }
);

export const Post = mongoose.model('Post', PostSchema);