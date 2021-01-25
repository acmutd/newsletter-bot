import Event from "../structures/Event";
import ACMClient from "../structures/Bot";
import { MessageReaction, User } from "discord.js";

export default class MessageReactionAddEvent extends Event {
    constructor(client: ACMClient) {
        super(client, "messageReactionAdd");
    }

    public async emit(
        client: ACMClient,
        reaction: MessageReaction,
        user: User
    ) {
        client.services.newsletter.handleReaction(reaction, user);
    }
}
