import mongoose from "mongoose";
import { TaskType } from "../managers/ScheduleManager";
require("mongoose-function")(mongoose);

export interface iTask extends mongoose.Document {
    _id: string;
    type: TaskType;
    cron: string | Date;
    payload?: any;
    delayed?: string;
}

const taskSchema = new mongoose.Schema(
    {
        _id: String,
        type: String,
    },
    { strict: false }
);

const Task = mongoose.model<iTask>("task", taskSchema, "tasks");
export default Task;
