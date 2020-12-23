import { GoogleSpreadsheet } from "google-spreadsheet";
import { Collection } from "discord.js";
import NewsletterClient from "../Bot";
import { settings } from "../../botsettings";

// * org id is abbr
type OrgResolvable = number | string;

export interface SpreadsheetEvent {
    date: Date;
    name: string;
    description?: string;
    start?: Date;
    end?: Date;
    location: string;
    team?: string;
    speaker: string;
    speakerContact: string;
    posterUrl: string;
}

export interface SpreadsheetOrg {
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
            // <- spreadsheet id
            "1-i-70gyCkRh3m8mRbMzXBCBXKqq5_tVsFssR53lF6jM"
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
        const sheet =
            this.spreadsheet.sheetsByIndex.find(
                (e) => e.title == "Organization Key"
            ) ?? this.spreadsheet.sheetsByIndex[0];
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
        if (!sheet) return [];

        // get events
        const rows = await sheet.getRows();

        const now = new Date();
        const max = new Date();
        max.setDate(now.getDate() + days);
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
        const start = row["Start Time"];
        return {
            date:
                this.generateDate(row["Date"], start) ?? new Date(row["Date"]),
            name: row["Event Name"] ?? "unnamed event",
            description: row["Event Description"],
            start: this.generateDate(row["Date"], start),
            end: this.generateDate(row["Date"], row["End Time"]),
            location: row["Location"],
            team: row["Team/Division"],
            speaker: row["Event Speaker(s)"],
            speakerContact: row["Event Speaker(s) Contact Information"],
            posterUrl: row["Link to Poster(s)"],
        };
    }

    private generateDate(date: string, time: string): Date | undefined {
        if (!time || !date) return;

        // check to see if there is a pm or am
        let type: "am" | "pm";
        let t = time.toLowerCase();

        if (t.includes("pm")) type = "pm";
        else if (t.includes("am")) type = "am";
        else return;

        t = t.replace(type, "");
        t = t.replace(" ", "");

        const digits = t.split(":");
        if (digits.length != 2) return;

        const hour =
            type == "am" ? parseInt(digits[0]) : parseInt(digits[0]) + 12;
        const minute = parseInt(digits[1]);

        const day = new Date(date);
        day.setHours(0, 0, 0, 0);
        day.setHours(hour, minute, 0, 0);

        return day;
    }

    // TODO: Create command that org leaders can run to update org cache data
    // ! cache should get updated every newsletter launch
}
