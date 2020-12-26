import { Schema, model, Document } from "mongoose";

export interface iMember extends Document {
    _id: string;
    strikes: number;
    lastStrike: Date;
    preferences: {
        subscribed: boolean;
        unfollowed: string[];
    };
}

const memberSchema = new Schema({
    _id: String,
    strikes: Number,
    lastStrike: Date,
    preferences: {
        subscribed: Boolean,
        unfollowed: Array,
    },
});

const Member = model<iMember>("member", memberSchema, "members");
export default Member;
