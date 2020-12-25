import { Message } from "discord.js";
import Command, { CommandContext } from "../structures/Command";

export default class RSVPCommand extends Command {
    constructor() {
        super({
            name: "rsvp",
            description: "RSVP for a particular event!",
            usage: ["rsvp [event number]"],
            dmWorks: true,
        });
    }

    // TODO: Add invalid messages instead of empty returns

    public async exec({ msg, client, args }: CommandContext) {
        if (!args[0]) {
            client.response.emit(
                msg.channel,
                `You need to add the appropriate arguments: \`${this.usage[0]}\``,
                "invalid"
            );
            return;
        }
        if (!parseInt(args[0])) {
            client.response.emit(
                msg.channel,
                `The first argument needs to be a number: \`${this.usage[0]}\``,
                "invalid"
            );
            return;
        }

        const e = client.database.cache.events.get(args[0]);
        if (!e) {
            client.response.emit(
                msg.channel,
                `There is no event associated with that number this week.`,
                "invalid"
            );
            return;
        }

        const minutesBeforeStart = 30;
        const toBeNotified = new Date(
            e.event.start!.getTime() - minutesBeforeStart * 60000
        );
        const now = new Date();
        if (toBeNotified < now) {
            if (e.event.start! < now) {
                client.response.emit(
                    msg.channel,
                    `This event has already started!`,
                    "invalid"
                );
            } else {
                client.response.emit(
                    msg.channel,
                    `This event is already starting within ${minutesBeforeStart} minutes`,
                    "invalid"
                );
            }
            return;
        }

        client.scheduler.createTask({
            type: "rsvp_reminder",
            payload: {
                eventID: args[0],
                userID: msg.author.id,
                minutesBeforeStart,
            },
            cron: new Date(
                e.event.start!.getTime() - minutesBeforeStart * 60000
            ),
        });

        client.response.emit(
            msg.channel,
            `Successfully RSVP'd for \`${e.event.name}\`.`,
            "success"
        );
    }
}
