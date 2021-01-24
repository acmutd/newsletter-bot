import Command from "../structures/Command";
import { CommandContext } from "../structures/Command";
import { Message, MessageAttachment } from "discord.js";
import ACMClient from "../structures/Bot";
import axios from "axios";
import { settings } from "../botsettings";

export default class HelpCommand extends Command {
    constructor() {
        super({
            name: "help",
            description: "Display help text for commands",
            longDescription:
                "Display help text for commands. Omit the argument " +
                "to show all available commands.",
            usage: ["help [command]"],
            dmWorks: true,
        });
    }

    public async exec({ msg, client, args }: CommandContext) {
        msg.channel.send(client.services.command.buildDMHelp());

        // switch (args.length) {
        //     case 0:
        //         // 0 args, list commands
        //         let commandsEmbed = {
        //             color: "#F67B21",
        //             title: "Commands",
        //             description: "",
        //             fields: [] as any[],
        //             footer: {
        //                 text: "[num] commands available to you",
        //             },
        //         };

        //         // build fields
        //         for (const cmd of client.manager.commands.values())
        //             if (!client.services.command.cantInvoke(msg, cmd))
        //                 commandsEmbed.fields.push({
        //                     name: cmd.name,
        //                     value: cmd.description,
        //                 });

        //         // set footer telling user how many commands are accessible in this place, to them
        //         const cmdsAvailable = commandsEmbed.fields.length;
        //         commandsEmbed.footer.text = `${cmdsAvailable} command${
        //             cmdsAvailable != 1 ? "s" : ""
        //         } available.`;

        //         // send the embed!
        //         await msg.channel.send({ embed: commandsEmbed });

        //         return;

        //     case 1:
        //         // 1 arg, show command help text if it can be run by the user

        //         // retrieve command from the client
        //         const cmd = client.manager.commands.get(args[0]);

        //         // handle command not found or they don't have access (purposely don't tell them the exact reason)
        //         if (
        //             cmd == undefined ||
        //             client.services.command.cantInvoke(msg, cmd)
        //         ) {
        //             return client.response.emit(
        //                 msg.channel,
        //                 `\`${args[0]}\` could not be found, or you don't have access to it here.`,
        //                 "invalid"
        //             );
        //         }

        //         // build embed with long description text
        //         let helpEmbed = {
        //             color: "#F67B21",
        //             title: `Help text for \`${cmd.name}\``,
        //             description:
        //                 `${cmd.longDescription}\n` +
        //                 "**Usage**:\n" +
        //                 `\`${cmd.usage
        //                     .map((usg) => client.settings.prefix + usg)
        //                     .join("\n")}\``,
        //         };

        //         // send the embed!
        //         await msg.channel.send({ embed: helpEmbed });

        //         return;

        //     default:
        //         return client.response.emit(
        //             msg.channel,
        //             `Usage: \`${this.getUsageText(client.settings.prefix)}\``,
        //             "invalid"
        //         );
        // }
    }
}
