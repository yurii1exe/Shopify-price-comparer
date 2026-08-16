import mongoose from 'mongoose';

/**
 * Open the MongoDB connection.
 *
 * `bufferCommands` is turned off deliberately. With Mongoose's default, a query
 * issued before the connection is up sits in a buffer and eventually rejects
 * with a timeout that names no host — which reads like a broken query rather
 * than a database that was never reachable. Failing immediately gives the
 * connection error itself.
 */
export async function connectDB(uri: string): Promise<void> {
  mongoose.set('bufferCommands', false);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
}
