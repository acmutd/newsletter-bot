import { GoogleSpreadsheet } from "google-spreadsheet";
import { Collection } from "discord.js";
import NewsletterClient from "../Bot";
import { settings } from "../../botsettings";

// * org id is abbr
type OrgResolvable = number | string;

interface SpreadsheetEvent {
    date: Date;
    name: string;
    description?: string;
    start: string;
    end?: string;
    location: string;
    team?: string;
    speaker: string;
    speakerContact: string;
    posterUrl: string;
}

interface SpreadsheetOrg {
    abbr: string;
    name: string;
    guild?: string;
    website?: string;
    logo?: string;
    color?: string;
}

export default class SpreadsheetManager {
    public client: NewsletterClient;
    public orgs: Collection<string, SpreadsheetOrg>;
    private spreadsheet: GoogleSpreadsheet;
    private lastRecache: Date;
    private recacheTimeout: number;

    constructor(client: NewsletterClient) {
        this.client = client;
        this.orgs = new Collection();
        this.recacheTimeout = 60000 * 5;
        this.lastRecache = new Date();
        this.lastRecache.setTime(
            this.lastRecache.getTime() - this.recacheTimeout
        );

        this.spreadsheet = new GoogleSpreadsheet(
            "1m_Y5ZgOUbAMn-T_gGTzzQ7ruiNKvs-8WFNoPfOuZL8Q" // <- spreadsheet id
        );
        this.spreadsheet.useApiKey(settings.keys.sheets);

        this.fetchAllOrgs();
    }

    // methods to abstract fetching data from the spreadsheet
    // all methods start with .loadInfo() to get the latest data

    public async fetchOrg(
        org: OrgResolvable,
        recache?: boolean
    ): Promise<SpreadsheetOrg | undefined> {
        // if recently recached then use old data
        if (
            new Date().getTime() - this.lastRecache.getTime() >
                this.recacheTimeout &&
            !recache
        ) {
            if (typeof org == "number") return this.orgs.array()[org];
            else return this.orgs.get(org);
        }
        // recache otherwise
        await this.spreadsheet.loadInfo();
        // index zero should always be the org sheet
        const sheet = this.spreadsheet.sheetsByIndex[0];
        const rows = await sheet.getRows();
        // if number
        if (typeof org == "number") return this.rowToOrg(rows[org]);
        // if abbr
        else {
            return this.rowToOrg(
                rows.find((row) => this.rowToOrg(row).abbr == org)
            );
        }
    }

    // this will recache regardless
    public async fetchAllOrgs(): Promise<SpreadsheetOrg[]> {
        await this.spreadsheet.loadInfo();
        // index zero should always be the org sheet
        const sheet = this.spreadsheet.sheetsByIndex.find(
            (e) => e.title == "Organization Key"
        )!;
        const rows = await sheet.getRows();
        return rows.map((row) => {
            const org = this.rowToOrg(row);
            this.orgs.set(org.abbr, org);
            return org;
        });
    }

    public async fetchEvents(
        org: OrgResolvable,
        days: number
    ): Promise<SpreadsheetEvent[]> {
        await this.spreadsheet.loadInfo();
        // get sheet
        let sheet;
        if (typeof org == "number") sheet = this.spreadsheet.sheetsByIndex[org];
        else sheet = this.spreadsheet.sheetsByTitle[org];

        // get events
        const rows = await sheet.getRows();

        const now = new Date();
        const max = new Date(now.getDate() + days);
        this.lastRecache = now;

        return rows
            .filter(
                (row) =>
                    max > this.rowToEvent(row).date &&
                    now < this.rowToEvent(row).date
            )
            .map((r) => this.rowToEvent(r));
    }

    // Helper functions (should be static but idfl writing out SpreadsheetManager every time)
    private rowToOrg(row: any): SpreadsheetOrg {
        return {
            abbr: row["Abbr. Name [Same as sheet title]"],
            name: row["Full Name"],
            guild: row["Guild ID"],
            website: row["Website"],
            logo: row["Logo [URL]"],
            color: row["Color [HEX]"],
        };
    }

    private rowToEvent(row: any): SpreadsheetEvent {
        return {
            date: new Date(row["Date"] + " " + row["Start Time"]),
            name: row["Event Name"] ?? "unnamed event",
            description: row["Event Description"],
            start: row["Start Time"] ?? "TBA",
            end: row["Start Time"],
            location: row["Location"],
            team: row["Team/Division"],
            speaker: row["Event Speaker(s)"],
            speakerContact: row["Event Speaker(s) Contact Information"],
            posterUrl: row["Link to Poster(s)"],
        };
    }

    // TODO: Create command that org leaders can run to update org cache data
    // ! cache should get updated every newsletter launch
}
