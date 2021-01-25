import NewsletterClient, { BotConfig } from "../Bot";
import { settings, Settings } from "../../botsettings";
import { MessageEmbed, TextChannel } from "discord.js";

export default class ErrorManager {
    public client: NewsletterClient;

    constructor(client: NewsletterClient) {
        this.client = client;
    }

    setup() {
        process.on("unhandledRejection", (err) => this.handleMsg(err));
        process.on("uncaughtException", (err) => this.handleErr(err));
    }

    handleMsg(message: string | {} | null | undefined, log = false) {
        if (!message) return;
        message = message.toString();
        var guild = this.client.guilds.resolve(settings.guild);
        if (guild) {
            var embed = new MessageEmbed();
            embed.setTitle(`🤖 **${this.client.user!.username}** Bot ${!log ? 'Error' : 'Log'}`);
            embed.addField(`**${!log ? 'Error' : 'Log'} Message**`, message);
            embed.setColor(!log ? 'RED' : 'BLACK');
            let channel = guild.channels.resolve(!log ? settings.channels.error : settings.channels.log);
            if (channel && channel.type == "text")
                (channel as TextChannel).send(embed);
        }
        //this.client.logger.error(message);
    }

    handleErr(err: Error | null | undefined) {
        if (!err) return;
        var guild = this.client.guilds.resolve(settings.guild);
        if (guild) {
            var embed = new MessageEmbed();
            embed.setTitle(
                `🤖 **${this.client.user!.username}** Bot Error ${
                    err.name ? "| " + err.name : ""
                }`
            );
            embed.addField(
                "**Error Message**",
                err.message ? err.message : err
            );
            embed.setColor("RED");
            let errorChannel = guild.channels.resolve(settings.channels.error);
            if (errorChannel && errorChannel.type == "text")
                (errorChannel as TextChannel).send(embed);
        }
        this.client.logger.error(err.message);
    }
}
