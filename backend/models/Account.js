import mongoose from 'mongoose';

const AccountSchema = new mongoose.Schema(
    {
        platform: {
            type: String,
            required: true,
            enum: ['linkedin', 'twitter', 'instagram', 'facebook', 'youtube'],
            unique: true
        },
        username: {
            type: String,
            required: true,
            trim: true
        },
        profileUrl: {
            type: String,
            trim: true
        },
        accessToken: {
            type: String,
            default: ''
        },
        apiKey: {
            type: String,
            default: ''
        },
        apiSecret: {
            type: String,
            default: ''
        },
        accessTokenSecret: {
            type: String,
            default: ''
        },
        accountUrn: {
            type: String,
            default: ''
        },
        isConnected: {
            type: Boolean,
            default: true
        },
        postCount: {
            type: Number,
            default: 0
        },
        lastPostAt: {
            type: Date
        }
    },
    {
        timestamps: true
    }
);

export const Account = mongoose.model('Account', AccountSchema);
