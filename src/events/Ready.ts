import Event from "../structures/Event";
import NewsletterClient from "../structures/Bot";
import { settings } from "../botsettings";

export default class ReadyEvent extends Event {
  constructor(client: NewsletterClient) {
    super(client, "ready");
  }

  // TODO: Lower the required permissions

  public async emit(client: NewsletterClient) {
    client.logger.info("=================== READY START ===================");
    if (client.user) {
      client.logger.info(`Logged in as ${client.user.username}!`);
      var invite = await client.generateInvite(["ADMINISTRATOR"]);
      client.logger.info(invite);
      await client.user.setActivity(settings.activity.description, {
        type: settings.activity.type,
      });
      client.logger.info(
        `Set activity to \"${settings.activity.type} ${settings.activity.description}\"`
      );
    }
    client.logger.info("==================== READY END ====================");
  }
}
