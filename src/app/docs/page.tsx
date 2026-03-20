import Link from "next/link";
import {
  PROMPT_DOCS,
  getPromptBrowseUrl,
  getPromptEditUrl,
} from "@/lib/promptDocs";

const lifecycleSteps = [
  {
    title: "1. Inbound capture",
    body:
      "The system watches the EDU Ops inbox, stores inbound emails involving edu.ops, and links them to the right site, partner, or thread when possible. Google Groups history can also be backfilled into the archive for older work.",
  },
  {
    title: "2. Site and task context",
    body:
      "The dashboard tracks each site as a small task portfolio. Every site starts with standard M1 tasks like SIR, LiDAR Scan, and Building Inspection, and site progress is derived from task state instead of a single hard-coded badge.",
  },
  {
    title: "3. Classification and detection",
    body:
      "Live inbound email is classified into operational types such as partner scheduling, partner completion, partner question, internal action needed, or unknown. Archived Google Groups messages are also scanned for task signals and missing site records.",
  },
  {
    title: "4. Decisioning and review",
    body:
      "Decision trees decide whether to draft a response, wait for more information, escalate to a human, or simply track the message in context. Draft replies and proposed task transitions both go through human review.",
  },
  {
    title: "5. Send and learn",
    body:
      "When a reviewer acts, the system stores the final outcome, edit distance, edit categories, task signal outcomes, and site record dispositions so system quality can be measured and improved over time.",
  },
];

const dashboardSections = [
  {
    title: "Site progress",
    body:
      "The main progress bar is derived from active task states. It is not just a visual summary of LiDAR and inspection fields. If a new required task is added later, the percentage can drop because the denominator changes.",
  },
  {
    title: "Task checklist",
    body:
      "Each site shows the current task set and state for SIR, LiDAR Scan, and Building Inspection. Tracking integrations update LiDAR and inspection task state, while email review can advance tasks based on message evidence.",
  },
  {
    title: "Tracking panel",
    body:
      "The tracking panel shows the latest LiDAR and inspection facts pulled from the shared Airtable view and Google Sheet, plus freshness timestamps so reviewers can see whether the card is current.",
  },
  {
    title: "Site record disposition",
    body:
      "Expanded site cards now include a disposition control so reviewers can mark a record as confirmed, needs review, or invalid and leave a note. This is feedback on whether the site record itself was created correctly from the message thread.",
  },
];

const labelGroups = [
  {
    title: "Email classifications",
    items: [
      ["partner scheduling", "Partner email about site scheduling, availability, or scheduling blockers."],
      ["partner completion", "Partner email about completed work, deliverables, reports, or job closeout."],
      ["partner question", "Partner request for clarification, next steps, scope, contacts, or logistics."],
      ["partner invoice", "Partner email related to billing or invoice processing."],
      ["internal action needed", "Internal email that likely needs an EDU Ops decision or response."],
      ["internal FYI", "Internal update that is useful context but usually does not need a reply."],
      ["unknown", "The classifier could not confidently place the message. Treat carefully."],
    ],
  },
  {
    title: "Thread states",
    items: [
      ["active", "An active thread with recent movement and no specific blocker state."],
      ["waiting partner", "The last meaningful action is with the external partner. We are waiting on them."],
      ["waiting human", "The agent needs a human decision, approval, or manual intervention."],
      ["escalated", "The thread contains enough risk or ambiguity that normal automation should pause."],
      ["resolved", "The operational question is complete or closed."],
      ["archived", "The thread is not currently actionable and has been set aside."],
    ],
  },
  {
    title: "Draft statuses",
    items: [
      ["pending", "Waiting for a human reviewer."],
      ["approved", "Reviewer sent the agent draft with no meaningful edits."],
      ["edited", "Reviewer changed the draft before sending."],
      ["rejected", "Reviewer decided the draft should not be sent."],
      ["auto sent", "The system sent the draft without human intervention."],
      ["expired", "The draft was no longer valid to send."],
    ],
  },
  {
    title: "Task states",
    items: [
      ["requested", "The work has been requested or kicked off but is not yet scheduled."],
      ["scheduled", "A date or clear scheduled commitment exists."],
      ["in progress", "The work is underway."],
      ["in review", "A deliverable was sent and is being reviewed or processed."],
      ["completed", "The task is complete."],
      ["blocked", "The task cannot move forward without another decision or dependency clearing."],
      ["not needed", "The task does not apply and is excluded from the progress denominator."],
    ],
  },
  {
    title: "Site record dispositions",
    items: [
      ["unreviewed", "No human has confirmed whether the site record was created correctly from the source thread."],
      ["confirmed", "The site record looks valid and correctly linked to the underlying work."],
      ["needs review", "The record may be right, but something about the address, source thread, or context is questionable."],
      ["invalid", "The record should not exist as a live site and should be treated as a creation error or false positive."],
    ],
  },
];

const reviewerActions = [
  {
    title: "Approve and send",
    guidance:
      "Use when the draft is factually correct, addressed to the right people, and safe to send as-is. Small punctuation or whitespace concerns are not a reason to edit.",
  },
  {
    title: "Edit and send",
    guidance:
      "Use when the agent has the right intent but needs correction in tone, factual detail, recipients, scope, commitments, dates, or sequencing.",
  },
  {
    title: "Reject",
    guidance:
      "Use when the draft is pointed at the wrong outcome, should not be sent yet, contains risky assumptions, or the situation needs manual handling first.",
  },
];

const editingRules = [
  "Do not let the agent make commitments about dates, deliverables, or approvals unless the source email or tracked data supports them.",
  "If a partner asks multiple questions, make sure the response addresses each one directly or explicitly says what will be followed up later.",
  "Prefer operational clarity over politeness theater. Short, explicit next steps are usually better than long soft language.",
  "Fix recipients and CCs when necessary. Incorrect routing is more serious than imperfect wording.",
  "Reject instead of editing when the draft is solving the wrong problem. Large rewrites should be treated as a signal that the class, prompt, or decision rule still needs work.",
];

const faqItems = [
  {
    question: "How is site progress calculated now?",
    answer:
      "Progress is derived from the active task set on the site. Each task state maps to a weighted progress value, and the site percentage is the average across active tasks. This means the main dashboard percentage is task-based, not just tracker-based.",
  },
  {
    question: "What is the difference between a task signal and a draft review?",
    answer:
      "A task signal is a proposed task-state transition inferred from archived Google Groups mail. A draft review is a proposed outbound reply inferred from live inbound email. Both are human-reviewed, but they improve different parts of the system.",
  },
  {
    question: "Why would a message show no site match in task-signal diagnostics?",
    answer:
      "Usually because the system cannot confidently map the message to an existing tracked site. The archive discovery flow now tries to create missing site records from strong address extractions, then reruns signal extraction against the expanded site list.",
  },
  {
    question: "What should we do with bad site records?",
    answer:
      "Use the site record disposition control on the site card. Mark obviously bad records as invalid, suspicious ones as needs review, and leave a note. This feedback is meant to improve the site-creation logic over time.",
  },
  {
    question: "What does pass rate actually mean?",
    answer:
      "A reviewed draft counts as passing when it was not rejected and the stored edit distance is 0.02 or lower. In practice, that means the human reviewer made little or no substantive change.",
  },
  {
    question: "What does 20+ reviews mean?",
    answer:
      "It is only a minimum evidence threshold. It means there is enough reviewed volume to start evaluating a class seriously. It does not mean a class is ready for auto-send by itself.",
  },
  {
    question: "When should we move a class toward autonomy?",
    answer:
      "Only after the class has enough volume, a strong and stable pass rate, low-risk edit patterns, and no recurring failures around commitments, recipients, or missing context.",
  },
  {
    question: "What should reviewers do with recurring edits?",
    answer:
      "Treat recurring edits as product feedback. If the same correction keeps appearing, tighten the prompt, the classification guidance, or the decision tree instead of relying on reviewers forever.",
  },
  {
    question: "What should happen to unknown or ambiguous emails?",
    answer:
      "They should stay under human control. Unknown is a routing problem, not a class you should push toward autonomy quickly.",
  },
  {
    question: "How should prompt changes be made now?",
    answer:
      "Prompt changes should be made in the shared Git repository by editing the markdown files in prompt-sources, then letting the normal deploy flow publish the generated prompt library.",
  },
];

function sectionTitle(title: string, body?: string) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      {body && <p className="mt-1 text-sm text-gray-600 max-w-3xl">{body}</p>}
    </div>
  );
}

export default function DocsPage() {
  return (
    <main className="max-w-7xl mx-auto px-4 py-8 space-y-10">
      <section className="bg-white border border-gray-200 rounded-2xl p-6 md:p-8">
        <div className="max-w-3xl">
          <div className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
            Operations guide
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-gray-900">
            How the EDU Ops agent works and how reviewers should use it
          </h1>
          <p className="mt-3 text-sm leading-6 text-gray-600">
            This guide is the shared operating manual for the supervised reply system. Use it to
            understand the workflow, interpret labels in the dashboard, and make consistent
            review decisions while the agent is still learning.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        {sectionTitle(
          "Process overview",
          "The current system is designed for task tracking, AI drafting, and human review. The learning loop depends on reviewers acting consistently across both email and site-record feedback."
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          {lifecycleSteps.map((step) => (
            <div key={step.title} className="bg-white border border-gray-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-900">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-gray-600">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        {sectionTitle(
          "How the dashboard works now",
          "The dashboard is no longer just a list of tracker fields. It is a site-level operating view built on tasks, source freshness, and reviewer feedback."
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {dashboardSections.map((section) => (
            <div key={section.title} className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-900">{section.title}</h3>
              <p className="mt-2 text-sm leading-6 text-gray-600">{section.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        {sectionTitle(
          "Archive backfill and task signals",
          "Historical Google Groups mail now feeds the task system in a supervised way."
        )}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-900">Raw archive first</h3>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              Google Groups backfill is stored as raw archived threads and messages first. The system does not write directly from scraped history into live task state.
            </p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-900">Signal extraction second</h3>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              Archived messages are scanned for supported task types and proposed state transitions. Those proposals appear on the Task Signals page for human review before they touch live task history.
            </p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-900">Site discovery support</h3>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              If archive diagnostics show lots of no-site-match results, admins can run site discovery from archived messages, create missing site records from strong address extractions, and then rerun signal extraction.
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        {sectionTitle(
          "Reviewer execution guidance",
          "Use the queues and site-review controls to enforce quality and teach the system what a correct response and a correct record both look like."
        )}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {reviewerActions.map((action) => (
            <div key={action.title} className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-900">{action.title}</h3>
              <p className="mt-2 text-sm leading-6 text-gray-600">{action.guidance}</p>
            </div>
          ))}
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-amber-900">Editing rules of thumb</h3>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-amber-900">
            {editingRules.map((rule) => (
              <li key={rule} className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-900">Admin-only controls</h3>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-gray-600">
            <li>Use dashboard admin controls to refresh scheduling, completion, tracking, or task backfill on demand.</li>
            <li>Use Task Signals admin controls to run signal extraction or archive-driven site discovery when historical messages need another pass.</li>
            <li>Use site disposition feedback when the record itself is wrong, even if the task signal or draft logic is otherwise behaving as expected.</li>
          </ul>
        </div>
      </section>

      <section className="space-y-5">
        {sectionTitle(
          "What the labels mean",
          "These are the labels reviewers will see across the dashboard, review queue, and insights views."
        )}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {labelGroups.map((group) => (
            <div key={group.title} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="border-b border-gray-100 px-5 py-4">
                <h3 className="text-sm font-semibold text-gray-900">{group.title}</h3>
              </div>
              <div className="divide-y divide-gray-100">
                {group.items.map(([label, meaning]) => (
                  <div key={label} className="px-5 py-4">
                    <div className="text-sm font-medium text-gray-900">{label}</div>
                    <div className="mt-1 text-sm leading-6 text-gray-600">{meaning}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        {sectionTitle(
          "How to interpret the learning metrics",
          "The insights dashboard is for decision quality, not vanity metrics."
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-900">What to trust</h3>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-gray-600">
              <li>High pass rate with low edit distance across many reviews is a good sign.</li>
              <li>Common edit categories show where prompts or policies need tightening.</li>
              <li>Examples behind each classification show whether the numbers reflect real quality.</li>
            </ul>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-900">What not to over-trust</h3>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-gray-600">
              <li>A small sample with a high pass rate is not enough to justify autonomy.</li>
              <li>Approved as-is counts can hide routing issues if the wrong drafts never reach review.</li>
              <li>Low edit distance does not matter if the draft makes risky commitments or misses context.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        {sectionTitle(
          "FAQ",
          "Operational answers for the questions that usually come up when reviewing or interpreting the system."
        )}
        <div className="space-y-3">
          {faqItems.map((item) => (
            <div key={item.question} className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-900">{item.question}</h3>
              <p className="mt-2 text-sm leading-6 text-gray-600">{item.answer}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-5">
        {sectionTitle(
          "Prompt editing in team Git",
          "Prompt changes should be managed like controlled operational config: versioned, reviewable, and deploy-backed."
        )}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm leading-6 text-gray-600 max-w-4xl">
            Approved users should edit the markdown files in <code>prompt-sources/</code> through the shared Git repository.
            The build converts those markdown files into the generated prompt library before Vercel and Convex deploy, so
            prompt changes stay reviewable and do not rely on runtime file reads.
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="border-b border-gray-100 px-5 py-4">
            <h3 className="text-sm font-semibold text-gray-900">Prompt source files</h3>
            <p className="mt-1 text-sm text-gray-600">
              These are the files approved users should edit in Git. Generated files are deploy artifacts and should not be edited by hand.
            </p>
          </div>
          <div className="divide-y divide-gray-100">
            {PROMPT_DOCS.map((prompt) => {
              const editUrl = getPromptEditUrl(prompt.relativePath);
              const browseUrl = getPromptBrowseUrl(prompt.relativePath);
              return (
                <div key={prompt.key} className="px-5 py-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900">{prompt.title}</div>
                    <div className="mt-1 text-sm leading-6 text-gray-600">{prompt.description}</div>
                    <div className="mt-2 text-xs font-mono text-gray-400">prompt-sources/{prompt.relativePath}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {browseUrl ? (
                      <a
                        href={browseUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 rounded-md text-xs font-medium border border-gray-200 text-gray-700 hover:bg-gray-50"
                      >
                        View in Git
                      </a>
                    ) : null}
                    {editUrl ? (
                      <a
                        href={editUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 rounded-md text-xs font-medium bg-blue-600 text-white hover:bg-blue-700"
                      >
                        Edit in Git
                      </a>
                    ) : (
                      <span className="px-3 py-1.5 rounded-md text-xs font-medium bg-gray-100 text-gray-500">
                        Set prompt edit URL env to enable edit links
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-amber-900">Publishing behavior</h3>
          <p className="mt-2 text-sm leading-6 text-amber-900">
            Prompt edits do not go live until the repo deploys. That is deliberate. The markdown files are the human-editable source, and the build converts them into the generated prompt library consumed by Convex and the frontend.
          </p>
          <p className="mt-3 text-sm leading-6 text-amber-900">
            Reviewers should use{" "}
            <Link href="/review" className="font-medium underline">
              the review queue
            </Link>{" "}
            and{" "}
            <Link href="/review" className="font-medium underline">
              learning insights
            </Link>{" "}
            after a prompt deploy to confirm the change improved behavior instead of just changing wording.
          </p>
        </div>
      </section>
    </main>
  );
}
