import { Message } from "discord.js";
import { settings } from "../botsettings";
import Command, { CommandContext } from "../structures/Command";

export default class SubscribeCommand extends Command {
    constructor() {
        super({
            name: "subscribe",
            description: "Resubscribe to the newsletter",
            usage: ["subscribe"],
            dmWorks: true,
        });
    }

    // TODO: Add invalid messages instead of empty returns

    public async exec({ msg, client, args }: CommandContext) {
        client.database.schemas.member
            .update(
                { _id: msg.author.id },
                { "preferences.subscribed": true },
                { upsert: true }
            )
            .then(() => {
                client.response.emit(
                    msg.channel,
                    `Successfully subscribed to the newsletter!\``,
                    "success"
                );
            })
            .catch(() => {
                client.response.emit(
                    msg.channel,
                    `Was unable to subscribe to the newsletter. Contact developers on the ACM server.\``,
                    "error"
                );
            });
    }
}
