import {startDailyDigestJob} from "./daily-digest-job";
import {startNotificationsJob} from "./notifications-job";
import {startProjectDigestJob} from "./project-digest-job";
import {startPlanTrialExpirationJob} from "../jobs/plan-trial-expiration-job";
import {startDigestScheduler} from "./digest-scheduler";
import {startClientPurgeJob} from "./client-purge-job";

export function startCronJobs() {
  startNotificationsJob();
  startDailyDigestJob();
  startProjectDigestJob();
  startDigestScheduler();

  // In Alpha Work internal edition, trial expiration and client portal purge jobs are disabled
  // startPlanTrialExpirationJob();
  // startClientPurgeJob();
}
