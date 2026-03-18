import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Legacy crons — only tracking refreshes are enabled right now.
// crons.interval("check email", { minutes: 15 }, internal.checkEmail.run);
crons.interval("check scheduling", { minutes: 30 }, internal.checkScheduling.run);
crons.interval("check completion", { minutes: 30 }, internal.checkCompletion.run);
// crons.interval("check replies", { minutes: 15 }, internal.checkReplies.run);

// Email agent crons — enabled for testing
crons.interval("classify inbound", { minutes: 15 }, internal.classifyInbound.run);
crons.interval("execute decisions", { minutes: 15 }, internal.executeDecisions.run);

export default crons;
