import { Collection } from "discord.js";
import schedule, { Job } from "node-schedule";
import { v4 as uuidv4 } from "uuid";
import ACMClient from "../Bot";

/*
    *    *    *    *    *    *
    ┬    ┬    ┬    ┬    ┬    ┬
    │    │    │    │    │    │
    │    │    │    │    │    └ day of week (0 - 7) (0 or 7 is Sun)
    │    │    │    │    └───── month (1 - 12)
    │    │    │    └────────── day of month (1 - 31)
    │    │    └─────────────── hour (0 - 23)
    │    └──────────────────── minute (0 - 59)
    └───────────────────────── second (0 - 59, OPTIONAL)
 */

export type TaskType = "reminder" | "newsletter" | "rsvp_reminder" | "flush_message_queue";

export default class ScheduleManager {
    public tasks: Collection<string, Task>;
    public client: ACMClient;

    constructor(client: ACMClient) {
        this.tasks = new Collection<string, Task>();
        this.client = client;
    }

    public async setup() {
        // load in the tasks to schedule from DB and schedule them
        let res = await this.client.database.schemas.task.find({});
        for (let taskData of res) {
            const td = taskData.toObject();
            let task: Task = {
                id: td["_id"],
                type: td["type"],
                cron: td["cron"],
                payload: td["payload"],
            };
            await this.createTask(task);
        }
        this.client.logger.info(`Loaded in ${res.length} scheduled tasks!`);
        return;
    }

    /**
     * Creates a task. If ID is passed, that ID will be used. Otherwise, a random ID will be generated.
     */
    public async createTask(task: Task): Promise<Task> {
        let t: Task = { ...task }; // make a local copy

        if (t.id) {
            if (this.tasks.has(t.id)) {
                // throw 'ID already exists!';
                return this.tasks.get(t.id)!;
            }
            // at this point we know that if the user provided an ID, it is valid
        } else {
            // at this point we know the user hasn't provided an id
            // generate an id for our task
            t.id = uuidv4();
        }

        // finds out if the id is in db
        // Note from eric: our local this.tasks should contain this information already
        let search = await this.client.database.schemas.task.find({
            _id: t.id,
        });
        // if not
        if (search.length == 0) {
            // create the task
            await this.client.database.schemas.task.create({
                _id: t.id,
                cron: t.cron,
                type: t.type,
                payload: t.payload,
                delayed: t.delayed,
            });
        }

        const job = schedule.scheduleJob(t.cron, () => {
            this.runTask(t);
        });

        t.job = job;

        this.tasks.set(t.id!, t);

        return t;
    }

    /**
     * Cancels a task and deletes it from memory and database
     */
    public async deleteTask(id: string): Promise<boolean> {
        const task = this.getTask(id);
        if (!task) return false;

        task.job?.cancel(); // cancel the job in the task
        this.tasks.delete(id); // remove the task itself from our task list
        await this.client.database.schemas.task.deleteOne({ _id: id }); // remove from database

        return true;
    }

    /**
     * Returns task with ID
     * @param id
     */
    public getTask(id: string): Task | undefined {
        return this.tasks.get(id);
    }

    /**
     * Callback function that is scheduled and directs control back to the appropriate manager
     */
    public async runTask(task: Task) {
        // remove the task from all records if not cron
        if (typeof task.cron !== "string") await this.deleteTask(task.id!);

        // dont run if it is a delayed task
        if (task.delayed) {
            task.delayed = undefined;
            await this.deleteTask(task.id!);
            await this.createTask(task);
            return;
        }

        switch (task.type) {
            case "newsletter":
                await this.client.services.newsletter.send();
                break;
            case "reminder":
                // FOR TESTING
                this.client.guilds.cache.first()?.members.cache.get(task.payload.id)?.send(task.payload.message);
                break;
            case "rsvp_reminder":
                // example: this.client.rsvpmanager.sendRSVP(data.event_id);
                this.client.services.newsletter.remind(task.payload);
                break;
            case "flush_message_queue":
                this.client.sender.flush();
                break;
        }
    }

    public async clearTasks(type: TaskType) {
        let tasksToDelete = this.tasks.filter((t) => t.type === type).map((t) => t.id);
        tasksToDelete.forEach((id) => {
            id && this.deleteTask(id);
        });
    }
}

export interface Task {
    id?: string;
    type: TaskType;
    cron: string | Date;
    payload?: any;
    delayed?: string;
    job?: Job;
}

/**
 * What functionality do we need
 * add task
 * remove task
 * add user to task: handled by
 *
 */

/**
 * What needs to persist
 *   - Scheduled tasks metadata (id, function, cron, etc.)
 *     - Used to reschedule at startup
 *   - Mappings from task to set of users (not in here)
 *   - Mappings from task to ID in order to cancel
 */
