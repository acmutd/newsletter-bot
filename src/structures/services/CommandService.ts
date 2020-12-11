import { Message, DMChannel, MessageEmbed } from "discord.js";
import NewsletterClient from "../Bot";
import Command from "../Command";
import { settings } from "../../botsettings";
import shlex from "shlex";

export default class CommandService {
    public client: NewsletterClient;

    constructor(client: NewsletterClient) {
        this.client = client;
    }

    cantInvoke(msg: Message, command: Command): string | MessageEmbed | void {
        const dm = msg.channel instanceof DMChannel;

        if (dm && !command.dmWorks)
            return this.client.response.build(
                "This command does not work in DMs.",
                "invalid"
            );

        if (
            command.userPermissions &&
            msg.member &&
            !msg.member.permissions.has(command.userPermissions)
        )
            return this.client.response.build(
                "You do not have the appropriate permissions to use this command.",
                "invalid"
            );

        if (
            command.requiredRole &&
            msg.member &&
            !msg.member.roles.cache.has(command.requiredRole)
        ) {
            let role = msg.guild?.roles.cache.get(command.requiredRole);
            return this.client.response.build(
                `You do not have the appropriate role (${role?.toString()}) to use this command.`,
                "invalid"
            );
        }

        if (
            this.client.config.disabledCommands &&
            this.client.config.disabledCommands.includes(command.name)
        )
            return this.client.response.build(
                "This command is currently disabled.",
                "invalid"
            );

        // TODO: Add something for disabled categories...
    }

    /**
     * This will run when a new message is sent.
     */
    async handle(msg: Message) {
        if (msg.author.bot) return;
        if (!msg.content.startsWith(settings.prefix)) return;

        const command = msg.content
            .substring(settings.prefix.length)
            .split(" ")[0];
        const args = shlex
            .split(msg.content.slice(settings.prefix.length).trim())
            .slice(1);

        let cmd = this.client.manager.commands.get(command);
        if (!cmd) {
            // return this.client.response.emit(
            //     msg.channel,
            //     `Not a command. Try \'${settings.prefix}help\' for help.`,
            //     'invalid'
            // );
            return;
        }
        // * before running the command, is the user already using a setup wizard?
        if (this.client.indicators.hasUser("usingCommand", msg.author)) {
            return this.client.response.emit(
                msg.channel,
                "You are already using a command (setup wizard, etc.). Finish that command before starting another one.",
                "invalid"
            );
        }

        // this is where we check if the user can use the command
        const response = this.cantInvoke(msg, cmd);
        if (response)
            return this.client.response.emitBuild(msg.channel, response);

        this.client.indicators.addUser("usingCommand", msg.author);

        try {
            await cmd.exec({ client: this.client, msg: msg, args: args });
        } catch (e) {
            msg.reply(
                "Command execution failed. Please contact a bot moderator for help."
            );
            throw e; // note that finally will execute before we pass the error higher
        } finally {
            this.client.indicators.removeUser("usingCommand", msg.author);
        }
    }
}
