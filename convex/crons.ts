import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("check scheduling", { minutes: 30 }, internal.checkScheduling.run, {});
crons.interval("check completion", { minutes: 30 }, internal.checkCompletion.run, {});

crons.interval("classify inbound", { minutes: 15 }, internal.classifyInbound.run);
crons.interval("execute decisions", { minutes: 15 }, internal.executeDecisions.run);

export default crons;
