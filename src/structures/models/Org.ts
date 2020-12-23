import { Schema, model, Document } from "mongoose";

// verification will be done through whether an org has a matching abbreviation on the google sheets

export interface OrgData {
    // id is the discord guild id
    _id: string;
    // everything else is optional
    name?: string;
    description?: string;
    abbr?: string;
    color?: string;
    website?: string;
    logo?: string;
    error?: string;
    announcements?: any[];
}

export interface iOrg extends Document {
    // id is the discord guild id
    _id: string;
    // everything else is optional
    name?: string;
    description?: string;
    abbr?: string;
    color?: string;
    website?: string;
    logo?: string;
    error?: string;
    announcements?: any[];
}

const orgSchema = new Schema(
    {
        _id: String,
        // everything else is optional
        name: String,
        description: String,
        abbr: String,
        color: String,
        website: String,
        logo: String,
        error: String,
        announcements: Array,
    },
    { strict: false }
);

const Org = model<iOrg>("org", orgSchema, "orgs");
export default Org;
