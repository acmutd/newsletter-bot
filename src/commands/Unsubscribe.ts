import { Message } from "discord.js";
import { settings } from "../botsettings";
import Command, { CommandContext } from "../structures/Command";

export default class UnsubscribeCommand extends Command {
    constructor() {
        super({
            name: "unsubscribe",
            description: "Unsubscribe from the newsletter",
            usage: ["unsubscribe"],
            dmWorks: true,
        });
    }

    // TODO: Add invalid messages instead of empty returns

    public async exec({ msg, client, args }: CommandContext) {
        client.database.schemas.member
            .update(
                { _id: msg.author.id },
                { "preferences.subscribed": false },
                { upsert: true }
            )
            .then(() => {
                client.response.emit(
                    msg.channel,
                    `Successfully unsubscribed from the newsletter. Resubscribe with \`${settings.prefix}subscribe\``,
                    "success"
                );
            })
            .catch(() => {
                client.response.emit(
                    msg.channel,
                    `Was unable to unsubscribe from the newsletter. Contact developers on the ACM server.\``,
                    "error"
                );
            });
    }
}
