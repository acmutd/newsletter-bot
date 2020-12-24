import { Schema, model, Document } from "mongoose";
import { SpreadsheetEvent } from "../managers/SpreadsheetManager";

export interface EventData extends Document {
    _id: string;
    event: SpreadsheetEvent;
    abbr: string;
}

export interface iEvent extends Document {
    _id: string;
    event: SpreadsheetEvent;
    abbr: string;
}

const eventSchema = new Schema({
    _id: String,
    event: Object,
    abbr: String,
});

const Event = model<iEvent>("event", eventSchema, "events");
export default Event;
