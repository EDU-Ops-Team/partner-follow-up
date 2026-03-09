import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Poll Gmail for trigger emails every 15 minutes
crons.interval("check email", { minutes: 15 }, internal.checkEmail.run);

// Check Airtable + Sheets for scheduling updates every 30 minutes
crons.interval("check scheduling", { minutes: 30 }, internal.checkScheduling.run);

// Monitor LiDAR completion + report status every 30 minutes
crons.interval("check completion", { minutes: 30 }, internal.checkCompletion.run);

export default crons;
