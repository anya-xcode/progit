import mongoose from "mongoose";

// On serverless platforms the same process handles many requests, so the
// connection (and the in-flight promise) is cached instead of reopened.
let connecting = null;

export async function connectDB(uri) {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (!connecting) {
    connecting = mongoose
      .connect(uri, { serverSelectionTimeoutMS: 10_000, maxPoolSize: 10 })
      .then((connection) => {
        console.log(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
        return connection;
      })
      .catch((error) => {
        connecting = null;
        throw error;
      });
  }
  return connecting;
}
