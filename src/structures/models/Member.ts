import { Schema, model, Document, Model } from "mongoose";

export interface iMember extends Document {
    _id: string;
    strikes: number;
    lastStrike: Date;
    preferences: {
        subscribed: boolean;
    };
}

const memberSchema = new Schema({
    _id: String,
    strikes: Number,
    lastStrike: Date,
    preferences: {
        subscribed: Boolean,
    },
});

memberSchema.statics.findUnsubscribedIDs = function () {
    return Member.find({
        "preferences.subscribed": false,
    }).map((member: any) => member["_id"]);
};

export interface MemberModel extends Model<iMember> {
    findUnsubscribedIDs(): string[];
}

const Member = model<iMember, MemberModel>("member", memberSchema, "members");
export default Member;
