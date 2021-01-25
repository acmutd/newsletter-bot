import { APIMessageContentResolvable, Collection, DMChannel, Guild, MessageAdditions, MessageOptions, NewsChannel, TextChannel } from "discord.js";
import schedule, { Job } from "node-schedule";
import { v4 as uuidv4 } from "uuid";
import ACMClient from "../Bot";

interface MessageData {
    channel: TextChannel | DMChannel | NewsChannel;
    content: APIMessageContentResolvable | (MessageOptions & { split?: false }) | MessageAdditions;
}

export default class RatelimitManager {
    public client: ACMClient;
    private maxMessages = 20; // max number of messages to send during a single cron cycle
    private remMessages = this.maxMessages;
    private defaultCron = "*/30 * * * * *"; // flush every 30 seconds
    private readId = -1; // id to read the next message from
    private writeId = -1; // id to write the next message to

    constructor(client: ACMClient) {
        this.client = client;
    }

    public setup() {
        this.readId = 0; // TODO fetch this value from the database, default 0
        this.writeId = 0; // TODO fetch this value from the database, default 0
        this.schedule();
    }

    public async schedule() {
        await this.client.scheduler.createTask({
            id: "ratelimitManager",
            type: "flush_message_queue",
            cron: this.defaultCron,
        });
    }

    /**
     * Flushes the message queue, called by schedule manager. Reschedules when finished.
     */
    public async flush() {
        if (this.readId === -1) return; // return if we haven't setup() yet
        for (let i = 0; i < this.remMessages; i ++) {
            // handle no messages left in queue
            if (this.readId === this.writeId) {
                // only take action if the IDs need to be reset back to 0
                if (this.readId != 0) {
                    this.readId = this.writeId = 0;
                    // TODO store these IDs back into DB
                }
                return;
            }
            const msg = {}; // TODO read the message from database using readId (stringified)

            await this.send(msg as MessageData);
            // TODO remove the msg @ readId from db
            this.readId++;
            // TODO save the readId to db
        }

        // reset for next period
        this.remMessages = this.maxMessages;
        this.schedule();
    }

    /**
     * Send a message, either immediately or queued
     * @param messageData 
     * @param now 
     */
    public async send(messageData: MessageData, now=true) {
        if (now) {
            this.remMessages--;
            await messageData.channel.send(messageData.content);
        }
        else {
            // TODO write the message to database using the writeId (stringified)
            this.writeId++;
            // TODO save the writeId to db
        }
    }
}
