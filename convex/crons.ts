import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Poll Gmail for trigger emails every 15 minutes
crons.interval("check email", { minutes: 15 }, internal.checkEmail.run);

// Check Airtable + Sheets for scheduling updates every 30 minutes
crons.interval("check scheduling", { minutes: 30 }, internal.checkScheduling.run);

// Monitor LiDAR completion + report status every 30 minutes
crons.interval("check completion", { minutes: 30 }, internal.checkCompletion.run);

// Watch for replies in active email threads every 15 minutes
crons.interval("check replies", { minutes: 15 }, internal.checkReplies.run);

// Classify inbound emails to edu.ops@trilogy.com every 15 minutes
crons.interval("classify inbound", { minutes: 15 }, internal.classifyInbound.run);

// Execute decisions on classified emails every 15 minutes
crons.interval("execute decisions", { minutes: 15 }, internal.executeDecisions.run);

export default crons;
