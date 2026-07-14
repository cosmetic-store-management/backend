import mongoose, { Schema, Document } from "mongoose";

export interface ISearchKeyword extends Document {
  term: string;
  count: number;
  lastSearchedAt: Date;
}

const SearchKeywordSchema = new Schema(
  {
    term: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    count: {
      type: Number,
      default: 1,
    },
    lastSearchedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Index for fast popular searches retrieval
SearchKeywordSchema.index({ count: -1, lastSearchedAt: -1 });

export const SearchKeywordModel = mongoose.model<ISearchKeyword>(
  "SearchKeyword",
  SearchKeywordSchema
);
