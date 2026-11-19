import mongoose, { Schema } from 'mongoose';

/** Atomic sequence counters (used for short, human-readable inventory item IDs). */
const counterSchema = new Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

export const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

export const nextSequence = async (key: string): Promise<number> => {
  const doc: any = await Counter.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  ).lean();
  return doc.seq as number;
};
