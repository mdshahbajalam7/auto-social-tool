import mongoose from 'mongoose';

export async function connectDB() {
    if (!process.env.MONGODB_URI) {
        console.warn('⚠️ [MongoDB] MONGODB_URI is missing in environment variables!');
        return;
    }

    if (mongoose.connection.readyState >= 1) {
        return;
    }

    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 6000,
            bufferCommands: false
        });
        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`❌ MongoDB Connection Error: ${error.message}`);
    }
}